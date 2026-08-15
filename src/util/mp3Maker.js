const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const http = require("http");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const MAX_DURATION_SECONDS = 600; // 10 minute safety ceiling per extraction

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
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
function extractAudio(inputBuffer, outputFormat = "mp3") {
  return new Promise((resolve, reject) => {
    const config = FORMAT_CONFIG[outputFormat];
    if (!config) {
      return reject(new Error(`Unsupported outputFormat "${outputFormat}". Use "mp3" or "opus".`));
    }

    const tmpDir = os.tmpdir();
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const inputPath = path.join(tmpDir, `audioin_${uid}`);
    const outputPath = path.join(tmpDir, `audioout_${uid}.${config.ext}`);
    fs.writeFileSync(inputPath, inputBuffer);

    const args = [
      "-y",
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