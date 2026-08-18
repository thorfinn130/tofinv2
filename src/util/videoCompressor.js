const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

// ── Concurrency limiter ─────────────────────────────────────────────────────
// Caps how many ffmpeg encodes run at once so a burst of large videos can't
// pile up and overload the server. Extra jobs just wait their turn.
const MAX_CONCURRENT_JOBS = 2;
let runningJobs = 0;
const waitQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    const tryClaim = () => {
      if (runningJobs < MAX_CONCURRENT_JOBS) {
        runningJobs++;
        resolve(() => {
          runningJobs--;
          const next = waitQueue.shift();
          if (next) next();
        });
      } else {
        waitQueue.push(tryClaim);
      }
    };
    tryClaim();
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-400)}`));
      resolve();
    });
  });
}

// Duration (seconds) and resolution in one ffmpeg call, parsed from its own
// diagnostic output (no ffprobe binary is bundled, so this reuses the same
// info ffmpeg already prints when given a file with no output).
function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-i", filePath]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", () => {
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!durMatch) return reject(new Error("Could not read video duration"));
      const [, hh, mm, ss] = durMatch;
      const duration = Number(hh) * 3600 + Number(mm) * 60 + Number(ss);

      // e.g. "Video: h264 ..., yuv420p, 1920x1080 [SAR 1:1 DAR 16:9], ..."
      const resMatch = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
      const width = resMatch ? Number(resMatch[1]) : null;
      const height = resMatch ? Number(resMatch[2]) : null;

      resolve({ duration, width, height });
    });
  });
}

// Below this many bits-per-pixel-per-frame, x264 quality degrades sharply —
// past that point spending more bits on the same resolution stops helping,
// so it's the point where a resolution reduction is actually worth it
// instead of just starving the bitrate further.
const MIN_BITS_PER_PIXEL = 0.04;
const NOMINAL_FPS_FOR_BPP_ESTIMATE = 30; // only used to judge whether to scale down; never applied to the actual encode

// Works out the video bitrate needed to hit targetBytes, and only computes a
// resolution scale-down if that bitrate would leave quality below the floor
// above — and even then, only shrinks by exactly as much as needed, not to
// some fixed resolution.
function planEncode({ width, height, duration, targetBytes, headroom = 0.92 }) {
  const targetBits = targetBytes * 8 * headroom;
  let audioBitrateK = 128;
  let videoBitrateK = Math.floor(targetBits / duration / 1000) - audioBitrateK;

  if (videoBitrateK < 100) {
    audioBitrateK = 96;
    videoBitrateK = Math.floor(targetBits / duration / 1000) - audioBitrateK;
  }
  videoBitrateK = Math.max(videoBitrateK, 40);

  let scale = 1;
  if (width && height) {
    const pixels = width * height;
    const bpp = (videoBitrateK * 1000) / (pixels * NOMINAL_FPS_FOR_BPP_ESTIMATE);
    if (bpp < MIN_BITS_PER_PIXEL) {
      const neededPixels = (videoBitrateK * 1000) / (MIN_BITS_PER_PIXEL * NOMINAL_FPS_FOR_BPP_ESTIMATE);
      scale = Math.sqrt(neededPixels / pixels);
      scale = Math.max(0.4, Math.min(1, scale)); // never drop below 40% of original dimensions in one step
    }
  }

  return { videoBitrateK, audioBitrateK, scale };
}

async function encode2Pass({ inputPath, outputPath, videoBitrateK, audioBitrateK, scale, uid }) {
  const passLogPath = path.join(os.tmpdir(), `ff2pass_${uid}`);
  const scaleArgs = scale < 1 ? ["-vf", `scale='trunc(iw*${scale}/2)*2':'trunc(ih*${scale}/2)*2'`] : [];
  // Note: FPS is never set here — no -r flag anywhere — the source frame rate passes through untouched.

  try {
    // Pass 1: analysis only, no real output.
    await runFfmpeg([
      "-y", "-i", inputPath,
      ...scaleArgs,
      "-c:v", "libx264", "-preset", "medium",
      "-b:v", `${videoBitrateK}k`,
      "-pass", "1", "-passlogfile", passLogPath,
      "-an", "-f", "mp4", os.platform() === "win32" ? "NUL" : "/dev/null",
    ]);

    // Pass 2: real encode, informed by pass 1's analysis — meaningfully
    // better quality-per-bit than a single-pass encode at the same size.
    await runFfmpeg([
      "-y", "-i", inputPath,
      ...scaleArgs,
      "-c:v", "libx264", "-preset", "medium",
      "-b:v", `${videoBitrateK}k`,
      "-maxrate", `${Math.floor(videoBitrateK * 1.2)}k`,
      "-bufsize", `${videoBitrateK * 2}k`,
      "-pass", "2", "-passlogfile", passLogPath,
      "-c:a", "aac", "-b:a", `${audioBitrateK}k`,
      "-movflags", "+faststart",
      outputPath,
    ]);
  } finally {
    for (const ext of ["-0.log", "-0.log.mbtree"]) {
      try { fs.unlinkSync(passLogPath + ext); } catch {}
    }
  }
}

/**
 * Compresses a video down to fit under targetBytes while preserving quality,
 * resolution, and frame rate as much as the size budget allows:
 *   - Resolution is only ever reduced, and only by exactly as much as the
 *     bits-per-pixel floor requires — never a fixed step down like 1080p->720p.
 *   - Frame rate is never touched.
 *   - Uses 2-pass encoding for better quality per byte than a single pass.
 *   - Runs through a concurrency limiter so a burst of jobs can't overload
 *     the server; extra jobs simply queue.
 *
 * `input` may be either a Buffer or a path to an existing file on disk —
 * passing a path avoids one extra buffer-to-disk round trip when the caller
 * already downloaded straight to a temp file.
 */
async function compressToFit(input, targetBytes) {
  const release = await acquireSlot();
  const tmpDir = os.tmpdir();
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const ownsInputFile = Buffer.isBuffer(input);
  const inputPath = ownsInputFile ? path.join(tmpDir, `vidin_${uid}`) : input;
  const outputPath = path.join(tmpDir, `vidout_${uid}.mp4`);

  if (ownsInputFile) fs.writeFileSync(inputPath, input);

  const cleanup = () => {
    if (ownsInputFile) { try { fs.unlinkSync(inputPath); } catch {} }
    try { fs.unlinkSync(outputPath); } catch {}
  };

  try {
    const { duration, width, height } = await getVideoInfo(inputPath);
    if (!duration || duration <= 0) throw new Error("Invalid video duration");

    const plan = planEncode({ width, height, duration, targetBytes });
    await encode2Pass({ inputPath, outputPath, uid, ...plan });

    let outBuf = fs.readFileSync(outputPath);
    if (outBuf.length <= targetBytes) {
      cleanup();
      return outBuf;
    }

    // Rare: estimation was optimistic (very high-motion content, etc).
    // One corrective pass — tighten the budget a bit more, and only nudge
    // the resolution down further if the tighter bitrate needs it, using
    // the exact same proportional logic as the first attempt.
    const retryPlan = planEncode({
      width: width ? Math.round(width * plan.scale) : null,
      height: height ? Math.round(height * plan.scale) : null,
      duration,
      targetBytes,
      headroom: 0.88,
    });
    await encode2Pass({ inputPath, outputPath, uid: `${uid}_r2`, ...retryPlan });

    outBuf = fs.readFileSync(outputPath);
    cleanup();

    if (outBuf.length <= targetBytes) return outBuf;
    return null; // genuinely couldn't fit — caller should fall back to a link
  } catch (err) {
    cleanup();
    throw err;
  } finally {
    release();
  }
}

module.exports = { compressToFit, getVideoInfo, getDuration: async (p) => (await getVideoInfo(p)).duration };
