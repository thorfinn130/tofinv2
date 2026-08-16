const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { parseGIF, decompressFrames } = require("gifuct-js");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");
const https = require("https");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const { cloudinary } = require("../config");

if (!cloudinary?.cloudName) {
  console.warn("[gifMaker] CLOUDINARY_CLOUD_NAME is not set — video-to-GIF will fall back to local ffmpeg processing, which is slower and more resource-heavy. Set CLOUDINARY_CLOUD_NAME in .env to use Cloudinary instead (also requires enabling 'Allow fetching of unlisted resources' under Console > Settings > Security on your Cloudinary account).");
}
if (!ffmpegPath) {
  console.warn("[gifMaker] ffmpeg-static did not resolve a binary path — local fallback conversion will fail until this is fixed (try `npm rebuild ffmpeg-static` or reinstall node_modules).");
}

const CAPTION_BAR_RATIO = 0.22;
const MIN_BAR_HEIGHT = 60;
const MAX_BAR_HEIGHT = 220;
const MAX_FRAMES = 150;                 // hard cap on frames in the LOCAL (non-Cloudinary) fallback path
const VIDEO_OUTPUT_FPS = 10;            // local fallback fps only
const VIDEO_OUTPUT_FPS_MIN = 4;         // never drop below this even for long clips (local fallback)
const DEFAULT_VIDEO_SECONDS = 8;        // local fallback only — Cloudinary path defaults to the FULL video
const MAX_VIDEO_SECONDS = 20;           // local fallback only — hard cap even with explicit start/end
const MAX_GIF_WIDTH = 480;              // local fallback downscale width
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024; // leave headroom under Discord's ~25MB cap

// Cloudinary quality tiers, tried in order — first one that fits under
// MAX_OUTPUT_BYTES wins. Highest quality first, stepping down only as needed.
const CLOUDINARY_QUALITY_TIERS = [
  { fps: 35, width: 720 },
  { fps: 30, width: 640 },
  { fps: 20, width: 480 },
  { fps: 12, width: 400 },
  { fps: 8,  width: 320 },
];

// ── Simple stage logger so `,gif`/`/gif` never looks silently stuck ──
function makeLogger(label) {
  const t0 = Date.now();
  return (stage) => console.log(`[gif:${label}] ${stage} (+${Date.now() - t0}ms)`);
}

// ── Fetch with proper headers ──
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://discord.com/',
      },
    };
    client.get(url, options, (res) => {
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Fetch, but surface Cloudinary's JSON error body on failure (crucial for
//    diagnosing setup issues like "fetch delivery not enabled") ──
function fetchBufferVerbose(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode >= 400) {
          const text = body.toString('utf8').slice(0, 400);
          return reject(new Error(`Cloudinary returned HTTP ${res.statusCode}: ${text}`));
        }
        resolve(body);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Build a Cloudinary "fetch" delivery URL that transforms a remote video
//    (or animated image) into a GIF entirely on Cloudinary's servers.
//    Omitting so_/eo_ tells Cloudinary to transcode the FULL source. ──
function buildCloudinaryGifUrl(sourceUrl, { resourceType, startSeconds, endSeconds, fps, width } = {}) {
  const t = [`f_gif`, `fps_${fps}`, `w_${width}`, `c_limit`, `q_auto`];
  if (startSeconds != null) t.push(`so_${startSeconds}`);
  if (endSeconds != null) t.push(`eo_${endSeconds}`);
  const transform = t.join(',');
  return `https://res.cloudinary.com/${cloudinary.cloudName}/${resourceType}/fetch/${transform}/${encodeURIComponent(sourceUrl)}`;
}

async function fetchOneCloudinaryTier(sourceUrl, { resourceType, startSeconds, endSeconds, fps, width }, log) {
  const url = buildCloudinaryGifUrl(sourceUrl, { resourceType, startSeconds, endSeconds, fps, width });
  log(`requesting Cloudinary transform (${resourceType}, ${fps}fps @ ${width}px wide, ${startSeconds != null || endSeconds != null ? `${startSeconds ?? 0}s-${endSeconds ?? "end"}` : "full length"})`);
  const buf = await fetchBufferVerbose(url);
  log(`Cloudinary returned ${(buf.length / 1024).toFixed(0)}KB`);
  return buf;
}

// Tries quality tiers highest-first, automatically stepping down only if the
// result would be too large for Discord to accept. Returns the best buffer
// that fits, or the smallest tier's result if even that doesn't fit (the
// caller's own size check will then produce a clear final error).
async function makeGifViaCloudinary(sourceUrl, { resourceType, startSeconds, endSeconds }, log) {
  let lastBuf = null;
  for (let i = 0; i < CLOUDINARY_QUALITY_TIERS.length; i++) {
    const { fps, width } = CLOUDINARY_QUALITY_TIERS[i];
    const buf = await fetchOneCloudinaryTier(sourceUrl, { resourceType, startSeconds, endSeconds, fps, width }, log);
    lastBuf = buf;
    if (buf.length <= MAX_OUTPUT_BYTES) {
      if (i > 0) log(`fits at tier ${i + 1}/${CLOUDINARY_QUALITY_TIERS.length} (${fps}fps/${width}px) after stepping down from higher quality`);
      return buf;
    }
    log(`too large at ${fps}fps/${width}px (${(buf.length / 1024 / 1024).toFixed(1)}MB) — stepping down quality`);
  }
  return lastBuf; // smallest tier still didn't fit; let the caller's size check report it clearly
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCaptionBar(ctx, width, barHeight, caption) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, barHeight);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = Math.floor(barHeight * 0.4);
  ctx.font = `bold ${fontSize}px sans-serif`;
  let lines = wrapText(ctx, caption, width * 0.92);
  while (lines.length * (fontSize * 1.15) > barHeight * 0.9 && fontSize > 14) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px sans-serif`;
    lines = wrapText(ctx, caption, width * 0.92);
  }
  const lineHeight = fontSize * 1.15;
  const totalTextHeight = lines.length * lineHeight;
  const startY = (barHeight - totalTextHeight) / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * lineHeight);
  });
}

function barHeightFor(width) {
  return Math.max(MIN_BAR_HEIGHT, Math.min(MAX_BAR_HEIGHT, Math.round(width * CAPTION_BAR_RATIO)));
}

function isGifBuffer(buf) {
  return buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF";
}

function isVideoBuffer(buf) {
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) === "ftyp") return true;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  return false;
}

// ── Detect animated WebP (VP8X with Animation flag) ──
function isAnimatedWebP(buf) {
  if (buf.length < 30) return false;
  // Check RIFF header
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return false;
  if (buf.toString('ascii', 8, 12) !== 'WEBP') return false;
  // Look for VP8X chunk and check animation flag
  let offset = 12;
  while (offset + 8 < buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'VP8X') {
      if (offset + 12 > buf.length) return false;
      const flags = buf.readUInt32LE(offset + 8);
      // bit 1 of flags indicates animation (0x2)
      return (flags & 0x2) !== 0;
    }
    offset += 8 + chunkSize;
    // Align to even
    if (chunkSize % 2 === 1) offset += 1;
  }
  return false;
}

// ── Detect APNG (acTL chunk) ──
function isAnimatedPNG(buf) {
  if (buf.length < 8) return false;
  if (buf.toString('ascii', 0, 4) !== '\x89PNG') return false;
  let offset = 8;
  while (offset + 8 < buf.length) {
    const chunkSize = buf.readUInt32BE(offset);
    const chunkType = buf.toString('ascii', offset + 4, offset + 8);
    if (chunkType === 'acTL') {
      return true;
    }
    offset += 8 + chunkSize;
  }
  return false;
}

// ── Convert animated WebP/APNG to GIF using ffmpeg ──
function convertAnimatedToGifWithFfmpeg(buf, caption = null) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg is not available on this bot instance — animated WebP/APNG conversion is disabled.'));
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `ffmpeg_in_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);
    const outputPath = path.join(tmpDir, `ffmpeg_out_${Date.now()}_${Math.random().toString(36).slice(2)}.gif`);
    fs.writeFileSync(inputPath, buf);

    // Build ffmpeg command
    const args = [
      '-y',
      '-i', inputPath,
      '-vf', `fps=${VIDEO_OUTPUT_FPS},scale=-1:-1:flags=lanczos`,
      '-frames:v', String(MAX_FRAMES),
      outputPath,
    ];

    // If caption is provided, add it using drawtext
    if (caption) {
      // Simple text overlay at bottom (not a caption bar, just text)
      // For a full bar, we'd need to composite, but we'll keep it simple.
      // We'll just overlay text at bottom.
      // const drawtext = `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${caption}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=h-text_h-10`;
      // For portability, we'll skip caption for animated conversions or use a default font.
      // We'll just ignore caption for animated WebP/APNG to keep it simple.
      console.warn('[convertAnimatedToGifWithFfmpeg] Caption not supported for animated WebP/APNG yet.');
    }

    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => {
      cleanup();
      reject(err);
    });

    proc.on('close', (code) => {
      try {
        if (code !== 0) {
          cleanup();
          return reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`));
        }
        if (!fs.existsSync(outputPath)) {
          cleanup();
          return reject(new Error('ffmpeg did not produce output.'));
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
      try { fs.unlinkSync(inputPath); } catch (_) {}
      try { fs.unlinkSync(outputPath); } catch (_) {}
    }
  });
}

// ── Video extraction ──
// Downscales via ffmpeg (cheap, native) and auto-lowers fps for longer clips so
// we never hold more than MAX_FRAMES full-resolution-adjacent frames in memory.
function extractVideoFrames(videoBuffer, startSeconds = null, endSeconds = null) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg is not available on this bot instance — video-to-GIF is disabled until that is fixed.'));
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `gifmaker_in_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
    const outputPattern = path.join(tmpDir, `gifmaker_frame_${Date.now()}_${Math.random().toString(36).slice(2)}_%03d.png`);
    fs.writeFileSync(inputPath, videoBuffer);

    const start = startSeconds ?? 0;
    const requestedDuration = endSeconds != null
      ? Math.max(0.1, endSeconds - start)
      : DEFAULT_VIDEO_SECONDS;
    const duration = Math.min(requestedDuration, MAX_VIDEO_SECONDS);

    // If duration*fps would exceed our frame budget, lower fps instead of truncating silently.
    let fps = VIDEO_OUTPUT_FPS;
    if (duration * fps > MAX_FRAMES) {
      fps = Math.max(VIDEO_OUTPUT_FPS_MIN, Math.floor(MAX_FRAMES / duration));
    }

    const args = [
      '-y',
      ...(start > 0 ? ['-ss', String(start)] : []),
      '-i', inputPath,
      '-t', String(duration),
      '-vf', `fps=${fps},scale='min(${MAX_GIF_WIDTH},iw)':-2:flags=lanczos`,
      '-frames:v', String(MAX_FRAMES),
      outputPattern,
    ];

    console.log(`[gif:ffmpeg] extracting frames: ${duration}s @ ${fps}fps, scaled to ${MAX_GIF_WIDTH}px wide`);
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => {
      cleanup();
      reject(err);
    });

    proc.on('close', (code) => {
      console.log(`[gif:ffmpeg] frame extraction finished, exit code ${code}`);
      try {
        if (code !== 0) {
          cleanup();
          return reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`));
        }
        const dir = path.dirname(outputPattern);
        const uniquePrefix = path.basename(outputPattern).split('%03d')[0];
        const frameFiles = fs.readdirSync(dir)
          .filter((f) => f.startsWith(uniquePrefix))
          .sort();
        const frameBuffers = frameFiles.map((f) => fs.readFileSync(path.join(dir, f)));
        frameFiles.forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });
        cleanup();
        if (!frameBuffers.length) {
          return reject(new Error('No frames could be extracted from that video.'));
        }
        resolve({ frameBuffers, fps });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    function cleanup() {
      try { fs.unlinkSync(inputPath); } catch {}
    }
  });
}

// ── Video → GIF with caption ──
async function makeGifFromVideo(videoUrl, caption, startSeconds = null, endSeconds = null) {
  const log = makeLogger('video');

  if (cloudinary?.cloudName) {
    let gifBuf;
    try {
      gifBuf = await makeGifViaCloudinary(videoUrl, { resourceType: 'video', startSeconds, endSeconds }, log);
    } catch (err) {
      console.error('[makeGifFromVideo] Cloudinary path failed, falling back to local ffmpeg:', err.message);
      log(`Cloudinary failed (${err.message}) — falling back to local ffmpeg`);
      return makeGifFromVideoLocal(videoUrl, caption, startSeconds, endSeconds, log);
    }

    // Cloudinary succeeded — even if the result is still too big after every
    // quality tier, falling back to local ffmpeg won't produce anything
    // smaller, so report it clearly instead of silently degrading further.
    if (!caption) {
      if (gifBuf.length > MAX_OUTPUT_BYTES) {
        throw new Error(`Even at the lowest quality tier, that clip is too large as a GIF (${(gifBuf.length / 1024 / 1024).toFixed(1)}MB). Trim it with start/end times, e.g. \`,gif <url> 0:00 0:05\`.`);
      }
      log(`done — ${(gifBuf.length / 1024 / 1024).toFixed(2)}MB (no local processing needed)`);
      return gifBuf;
    }
    log('captioning Cloudinary result');
    return captionGifBuffer(gifBuf, caption, 'video-caption');
  }

  return makeGifFromVideoLocal(videoUrl, caption, startSeconds, endSeconds, log);
}

// ── Local ffmpeg fallback (used only if Cloudinary isn't configured or fails) ──
async function makeGifFromVideoLocal(videoUrl, caption, startSeconds, endSeconds, log = makeLogger('video-local')) {
  log('fetching source video');
  const buf = await fetchBuffer(videoUrl);
  log(`fetched (${(buf.length / 1024).toFixed(0)}KB), extracting frames via ffmpeg`);
  const { frameBuffers, fps } = await extractVideoFrames(buf, startSeconds, endSeconds);
  log(`extracted ${frameBuffers.length} frames @ ${fps}fps, decoding first frame`);

  const firstFrame = await loadImage(frameBuffers[0]);
  const barHeight = caption ? barHeightFor(firstFrame.width) : 0;
  const outWidth = firstFrame.width;
  const outHeight = firstFrame.height + barHeight;
  let captionCanvas = null;
  if (caption) {
    captionCanvas = createCanvas(outWidth, barHeight);
    drawCaptionBar(captionCanvas.getContext('2d'), outWidth, barHeight, caption);
  }

  const canvas = createCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d');

  const renderFrame = async (frameBuf) => {
    const img = await loadImage(frameBuf);
    ctx.clearRect(0, 0, outWidth, outHeight);
    if (captionCanvas) ctx.drawImage(captionCanvas, 0, 0);
    ctx.drawImage(img, 0, barHeight, outWidth, firstFrame.height);
    return ctx.getImageData(0, 0, outWidth, outHeight).data;
  };

  // ── Build ONE shared 256-color palette from a handful of sample frames ──
  // instead of quantizing every single frame — this is the main speed win.
  log('building shared color palette');
  const sampleCount = Math.min(5, frameBuffers.length);
  const step = Math.max(1, Math.floor(frameBuffers.length / sampleCount));
  const sampleIndices = [...new Set(
    Array.from({ length: sampleCount }, (_, i) => Math.min(i * step, frameBuffers.length - 1))
  )];
  const samplePixels = [];
  for (const idx of sampleIndices) samplePixels.push(await renderFrame(frameBuffers[idx]));
  const mergedLength = samplePixels.reduce((sum, arr) => sum + arr.length, 0);
  const merged = new Uint8ClampedArray(mergedLength);
  let mergeOffset = 0;
  for (const arr of samplePixels) { merged.set(arr, mergeOffset); mergeOffset += arr.length; }
  const palette = quantize(merged, 256);

  log(`palette ready, encoding ${frameBuffers.length} frames`);
  const gif = GIFEncoder();
  const delayMs = Math.round(1000 / fps);
  for (let i = 0; i < frameBuffers.length; i++) {
    const data = await renderFrame(frameBuffers[i]);
    frameBuffers[i] = null; // release the encoded PNG bytes as soon as we've decoded them
    const index = applyPalette(data, palette);
    gif.writeFrame(index, outWidth, outHeight, { palette, delay: delayMs });
    if (i % 30 === 0) log(`encoded frame ${i + 1}/${frameBuffers.length}`);
  }
  gif.finish();
  const out = Buffer.from(gif.bytes());
  log(`done — ${(out.length / 1024 / 1024).toFixed(2)}MB`);
  if (out.length > MAX_OUTPUT_BYTES) {
    throw new Error(`The resulting GIF is too large (${(out.length / 1024 / 1024).toFixed(1)}MB). Try a shorter clip with start/end times, e.g. \`,gif <url> 0:00 0:05\`.`);
  }
  return out;
}

// ── Static image → GIF ──
async function makeStaticGif(imageUrl, caption) {
  const log = makeLogger('static');
  log('fetching source image');
  const buf = await fetchBuffer(imageUrl);
  log(`fetched (${(buf.length / 1024).toFixed(0)}KB)`);

  // Check if it's an animated WebP or APNG
  if (isAnimatedWebP(buf) || isAnimatedPNG(buf)) {
    if (cloudinary?.cloudName) {
      try {
        const gifBuf = await makeGifViaCloudinary(imageUrl, { resourceType: 'image' }, log);
        return caption ? captionGifBuffer(gifBuf, caption, 'static-caption') : gifBuf;
      } catch (err) {
        console.error('[makeStaticGif] Cloudinary conversion failed, falling back to local ffmpeg:', err.message);
      }
    }
    try {
      // Local fallback (caption not supported in this path)
      const gifBuf = await convertAnimatedToGifWithFfmpeg(buf);
      return gifBuf;
    } catch (err) {
      console.error('[makeStaticGif] FFmpeg conversion failed:', err);
      throw new Error('Failed to convert animated WebP/APNG to GIF. Try using a static image instead.');
    }
  }

  // Validate image type
  const header = buf.toString('hex', 0, 8);
  const isPNG = header.startsWith('89504e47');
  const isJPEG = header.startsWith('ffd8ffe0') || header.startsWith('ffd8ffe1');
  const isGIF = header.startsWith('47494638');
  const isWebP = header.startsWith('52494646') && buf.toString('ascii', 8, 12) === 'WEBP';

  if (!isPNG && !isJPEG && !isGIF && !isWebP) {
    const firstChars = buf.toString('ascii', 0, 200);
    if (firstChars.trim().startsWith('<svg') || firstChars.trim().startsWith('<?xml')) {
      throw new Error('SVG images are not supported. Please use PNG, JPEG, GIF, or WebP.');
    }
    if (firstChars.includes('<!DOCTYPE') || firstChars.includes('<html')) {
      throw new Error('Received an HTML page instead of an image. The URL might be invalid or require authentication.');
    }
    throw new Error(`Unsupported image format. Header: ${header.slice(0, 8)}`);
  }

  let img;
  try {
    img = await loadImage(buf);
  } catch (err) {
    console.warn('[makeStaticGif] Buffer load failed, trying temp file...');
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `gifmaker_img_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
    fs.writeFileSync(tmpFile, buf);
    try {
      img = await loadImage(tmpFile);
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    } catch (fileErr) {
      console.error('[makeStaticGif] Temp file load failed:', fileErr.message);
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      try {
        img = await loadImage(imageUrl);
      } catch (urlErr) {
        console.error('[makeStaticGif] URL load also failed:', urlErr.message);
        throw new Error(`Failed to load image: ${err.message}`);
      }
    }
  }

  if (!img || !img.width || !img.height) {
    throw new Error('Image has invalid dimensions.');
  }

  const barHeight = caption ? barHeightFor(img.width) : 0;
  const canvas = createCanvas(img.width, img.height + barHeight);
  const ctx = canvas.getContext('2d');

  if (caption) drawCaptionBar(ctx, img.width, barHeight, caption);
  ctx.drawImage(img, 0, barHeight, img.width, img.height);

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);

  const gif = GIFEncoder();
  gif.writeFrame(index, width, height, { palette });
  gif.finish();
  const out = Buffer.from(gif.bytes());
  if (out.length > MAX_OUTPUT_BYTES) {
    throw new Error(`The resulting GIF is too large (${(out.length / 1024 / 1024).toFixed(1)}MB). Try a smaller image.`);
  }
  return out;
}

// ── Core: caption an in-memory GIF buffer (used for both user-provided GIFs
//    and GIFs that Cloudinary already generated/downscaled for us) ──
function captionGifBuffer(buf, caption, logLabel = 'regif') {
  const log = makeLogger(logLabel);
  let parsed, frames;
  try {
    parsed = parseGIF(buf);
    frames = decompressFrames(parsed, true);
  } catch (err) {
    console.error('[captionGifBuffer] GIF parsing failed:', err.message);
    throw new Error(`Failed to parse GIF: ${err.message}`);
  }
  if (!frames || !frames.length) {
    throw new Error('Could not decode any frames from that GIF.');
  }
  log(`decoded ${frames.length} source frames`);
  const { width, height } = parsed.lsd ?? { width: frames[0].dims.width, height: frames[0].dims.height };
  // Guard against absurdly large source GIFs blowing up memory the same way videos did.
  const scale = width > MAX_GIF_WIDTH ? MAX_GIF_WIDTH / width : 1;
  const barHeight = caption ? barHeightFor(width * scale) : 0;
  const outWidth = Math.round(width * scale);
  const outHeight = Math.round(height * scale) + barHeight;
  let captionCanvas = null;
  if (caption) {
    captionCanvas = createCanvas(outWidth, barHeight);
    drawCaptionBar(captionCanvas.getContext('2d'), outWidth, barHeight, caption);
  }
  const canvas = createCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d');
  const frameList = frames.slice(0, MAX_FRAMES);

  const renderFrame = (frame) => {
    ctx.clearRect(0, 0, outWidth, outHeight);
    if (captionCanvas) ctx.drawImage(captionCanvas, 0, 0);
    const frameCanvas = createCanvas(frame.dims.width, frame.dims.height);
    const frameCtx = frameCanvas.getContext('2d');
    const imageData = frameCtx.createImageData(frame.dims.width, frame.dims.height);
    imageData.data.set(frame.patch);
    frameCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(
      frameCanvas,
      Math.round(frame.dims.left * scale),
      Math.round(frame.dims.top * scale) + barHeight,
      Math.round(frame.dims.width * scale),
      Math.round(frame.dims.height * scale)
    );
    return ctx.getImageData(0, 0, outWidth, outHeight).data;
  };

  // ── One shared palette from a handful of sample frames instead of per-frame quantize ──
  log('building shared color palette');
  const sampleCount = Math.min(5, frameList.length);
  const step = Math.max(1, Math.floor(frameList.length / sampleCount));
  const sampleIndices = [...new Set(
    Array.from({ length: sampleCount }, (_, i) => Math.min(i * step, frameList.length - 1))
  )];
  const samplePixels = sampleIndices.map((idx) => renderFrame(frameList[idx]));
  const mergedLength = samplePixels.reduce((sum, arr) => sum + arr.length, 0);
  const merged = new Uint8ClampedArray(mergedLength);
  let mergeOffset = 0;
  for (const arr of samplePixels) { merged.set(arr, mergeOffset); mergeOffset += arr.length; }
  const palette = quantize(merged, 256);

  log(`palette ready, encoding ${frameList.length} frames`);
  const gif = GIFEncoder();
  for (let i = 0; i < frameList.length; i++) {
    const frame = frameList[i];
    const data = renderFrame(frame);
    const index = applyPalette(data, palette);
    const delayMs = Math.max(20, (frame.delay ?? 10) * 10);
    gif.writeFrame(index, outWidth, outHeight, { palette, delay: delayMs });
    if (i % 30 === 0) log(`encoded frame ${i + 1}/${frameList.length}`);
  }
  gif.finish();
  const out = Buffer.from(gif.bytes());
  log(`done — ${(out.length / 1024 / 1024).toFixed(2)}MB`);
  if (out.length > MAX_OUTPUT_BYTES) {
    throw new Error(`The resulting GIF is too large (${(out.length / 1024 / 1024).toFixed(1)}MB). Try a shorter or smaller source GIF.`);
  }
  return out;
}

// ── Animated GIF → re‑encoded animated GIF with caption ──
async function makeCaptionedAnimatedGif(imageUrl, caption) {
  const log = makeLogger('regif');
  log('fetching source gif');
  const buf = await fetchBuffer(imageUrl);
  if (!isGifBuffer(buf)) {
    throw new Error('NOT_A_GIF');
  }
  return captionGifBuffer(buf, caption, 'regif');
}

function parseTimeToSeconds(str) {
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  const parts = str.split(':').map(p => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

// ── Upload a finished GIF to Cloudinary for a URL that never expires ──
// Discord attachment links (and most third-party CDN links) carry a signed,
// time-limited signature once copied out of their original message context —
// they're fine for the message we just sent, but go dead if reused later.
// This does a real, permanent upload (not the `fetch`-transform trick used
// elsewhere in this file), so the returned URL keeps working indefinitely.
// Requires CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET in .env; if either is
// missing this just returns null and callers fall back to Discord-only.
async function uploadPermanentGif(buffer, filenameHint = "gif") {
  if (!cloudinary?.cloudName || !cloudinary?.apiKey || !cloudinary?.apiSecret) return null;

  try {
    const crypto = require("crypto");
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHash("sha1")
      .update(`timestamp=${timestamp}${cloudinary.apiSecret}`)
      .digest("hex");

    const boundary = `----gifUpload${Date.now()}`;
    const parts = [];
    const field = (name, value) =>
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    field("api_key", cloudinary.apiKey);
    field("timestamp", String(timestamp));
    field("signature", signature);
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filenameHint}.gif"\r\nContent-Type: image/gif\r\n\r\n`
    );
    const head = Buffer.from(parts.join(""), "utf8");
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const body = Buffer.concat([head, buffer, tail]);

    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          method: "POST",
          hostname: "api.cloudinary.com",
          path: `/v1_1/${cloudinary.cloudName}/image/upload`,
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": body.length,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              if (res.statusCode >= 200 && res.statusCode < 300 && parsed.secure_url) resolve(parsed);
              else reject(new Error(parsed.error?.message || `Cloudinary upload HTTP ${res.statusCode}`));
            } catch (e) { reject(e); }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    return result.secure_url;
  } catch (err) {
    console.warn("[gifMaker] permanent upload failed, keeping Discord-only copy:", err.message);
    return null;
  }
}

module.exports = {
  makeStaticGif,
  makeCaptionedAnimatedGif,
  makeGifFromVideo,
  isGifBuffer,
  isVideoBuffer,
  fetchBuffer,
  parseTimeToSeconds,
  uploadPermanentGif,
};