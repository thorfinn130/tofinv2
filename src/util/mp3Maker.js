const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const http = require("http");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const MAX_DURATION_SECONDS = 600; // 10 minute safety ceiling per extraction

function fetchBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      // Follow redirects manually — Node's http/https client doesn't do this
      // on its own, so without it a redirecting URL silently "succeeds" with
      // the redirect page's body instead of the actual file.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); // drain so the socket can be reused
        if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
        const nextUrl = new URL(res.headers.location, url).toString();
        return resolve(fetchBuffer(nextUrl, redirectsLeft - 1));
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// Best-effort file extension from a URL, ignoring query strings/fragments —
// used only as a hint for ffmpeg's format probing, not a correctness check.
function extFromUrl(url) {
  try {
    const clean = new URL(url).pathname;
    const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

// Per-format ffmpeg settings. Opus uses libopus in an .opus (Ogg) container.
const FORMAT_CONFIG = {
  mp3: {
    ext: "mp3",
    codecArgs: ["-acodec", "libmp3lame", "-b:a", "192k"],
  },
  opus: {
    ext: "opus",
    // 128k is a solid default for libopus (opus is efficient at lower bitrates
    // than mp3 for equivalent perceived quality). Adjust if you want smaller files.
    codecArgs: ["-acodec", "libopus", "-b:a", "128k", "-vbr", "on"],
  },
};

// Extracts the audio track from a video/audio buffer and returns it as an
// MP3 or Opus buffer, depending on outputFormat ("mp3" | "opus").
// `sourceHint` — the original URL or filename, if known — is used only to
// give the temp input file a real extension. ffmpeg can usually sniff a
// well-structured container like MP4 from content alone, but less
// self-describing formats (raw MP3, some WAV/OGG variants) are detected far
// more reliably with an extension hint than with none at all.
function extractAudio(inputBuffer, outputFormat = "mp3", sourceHint = null) {
  return new Promise((resolve, reject) => {
    const config = FORMAT_CONFIG[outputFormat];
    if (!config) {
      return reject(new Error(`Unsupported outputFormat "${outputFormat}". Use "mp3" or "opus".`));
    }

    const tmpDir = os.tmpdir();
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const inExt = (sourceHint && extFromUrl(sourceHint)) || "dat";
    const inputPath = path.join(tmpDir, `audioin_${uid}.${inExt}`);
    const outputPath = path.join(tmpDir, `audioout_${uid}.${config.ext}`);
    fs.writeFileSync(inputPath, inputBuffer);

    const args = [
      "-y",
      // Look at more of the file before deciding on a format/codec — the
      // ffmpeg defaults are tuned for streaming and can misdetect some
      // audio-only or oddly-muxed files otherwise.
      "-analyzeduration", "10000000",
      "-probesize", "10000000",
      "-i", inputPath,
      "-t", String(MAX_DURATION_SECONDS),
      "-vn",                 // drop video stream entirely
      ...config.codecArgs,
      outputPath,
    ];

    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => { cleanup(); reject(err); });
    proc.on("close", (code) => {
      try {
        if (code !== 0) {
          cleanup();
          return reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`));
        }
        if (!fs.existsSync(outputPath)) {
          cleanup();
          return reject(new Error("No audio track could be extracted from that file."));
        }
        const outBuf = fs.readFileSync(outputPath);
        cleanup();
        resolve(outBuf);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    function cleanup() {
      try { fs.unlinkSync(inputPath); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
    }
  });
}

module.exports = { fetchBuffer, extractAudio, MAX_DURATION_SECONDS };