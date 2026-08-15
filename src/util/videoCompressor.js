const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

// Reads the duration (in seconds) of a video file by parsing ffmpeg's stderr output.
function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-i", filePath]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return reject(new Error("Could not read video duration"));
      const [, hh, mm, ss] = m;
      resolve(Number(hh) * 3600 + Number(mm) * 60 + Number(ss));
    });
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`));
      resolve();
    });
  });
}

/**
 * Compresses a video buffer down to fit under targetBytes, keeping quality as
 * high as the size budget allows. Tries a quality-preserving pass first
 * (same resolution, bitrate sized to the video's duration), and only drops
 * resolution on a second pass if the first pass still doesn't fit.
 */
async function compressToFit(inputBuffer, targetBytes) {
  const tmpDir = os.tmpdir();
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(tmpDir, `vidin_${uid}`);
  const outputPath = path.join(tmpDir, `vidout_${uid}.mp4`);

  fs.writeFileSync(inputPath, inputBuffer);

  const cleanup = () => {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  };

  try {
    const duration = await getDuration(inputPath);
    if (!duration || duration <= 0) throw new Error("Invalid video duration");

    // Leave ~8% headroom for container/muxing overhead so we land under the real limit.
    const targetBits = targetBytes * 8 * 0.92;
    let audioBitrateK = 128;
    let videoBitrateK = Math.floor(targetBits / duration / 1000) - audioBitrateK;

    // Pass 1: keep original resolution, size the bitrate to the clip's length.
    // If that leaves a reasonable bitrate, quality stays close to the source.
    if (videoBitrateK < 100) {
      // Very long/large clip — even audio at 128k barely leaves room. Trim audio bitrate too.
      audioBitrateK = 96;
      videoBitrateK = Math.max(80, Math.floor(targetBits / duration / 1000) - audioBitrateK);
    }

    await runFfmpeg([
      "-y",
      "-i", inputPath,
      "-c:v", "libx264",
      "-preset", "medium",
      "-b:v", `${videoBitrateK}k`,
      "-maxrate", `${Math.floor(videoBitrateK * 1.2)}k`,
      "-bufsize", `${videoBitrateK * 2}k`,
      "-c:a", "aac",
      "-b:a", `${audioBitrateK}k`,
      "-movflags", "+faststart",
      outputPath,
    ]);

    let outBuf = fs.readFileSync(outputPath);
    if (outBuf.length <= targetBytes) {
      cleanup();
      return outBuf;
    }

    // Pass 2: still too big (rare — very long or high-motion clip). Scale
    // resolution down as well so the lower bitrate still looks reasonable.
    const retryTargetBits = targetBytes * 8 * 0.90;
    const retryVideoBitrateK = Math.max(60, Math.floor(retryTargetBits / duration / 1000) - 80);

    await runFfmpeg([
      "-y",
      "-i", inputPath,
      "-vf", "scale='min(854,iw)':-2", // cap at 480p-ish width, preserve aspect ratio
      "-c:v", "libx264",
      "-preset", "medium",
      "-b:v", `${retryVideoBitrateK}k`,
      "-maxrate", `${Math.floor(retryVideoBitrateK * 1.2)}k`,
      "-bufsize", `${retryVideoBitrateK * 2}k`,
      "-c:a", "aac",
      "-b:a", "80k",
      "-movflags", "+faststart",
      outputPath,
    ]);

    outBuf = fs.readFileSync(outputPath);
    cleanup();

    if (outBuf.length <= targetBytes) return outBuf;
    return null; // genuinely couldn't fit — caller should fall back to a link
  } catch (err) {
    cleanup();
    throw err;
  }
}

module.exports = { compressToFit, getDuration };