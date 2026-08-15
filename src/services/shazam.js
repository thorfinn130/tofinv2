const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const FormData = require("form-data");
const { fetchBuffer } = require("../util/mp3Maker");

const ACR_HOST = process.env.ACR_HOST;
const ACR_ACCESS_KEY = process.env.ACR_ACCESS_KEY;
const ACR_SECRET_KEY = process.env.ACR_SECRET_KEY;

function buildStringToSign(httpMethod, uri, accessKey, dataType, signatureVersion, timestamp) {
  return [httpMethod, uri, accessKey, dataType, signatureVersion, timestamp].join("\n");
}

function signString(str, secret) {
  const crypto = require("crypto");
  return crypto.createHmac("sha1", secret).update(str).digest("base64");
}

// Recognise a song from a Buffer
async function recognizeSong(buffer, extension = "mp3") {
  if (!ACR_HOST || !ACR_ACCESS_KEY || !ACR_SECRET_KEY) {
    throw new Error("ACRCloud credentials missing. Set ACR_HOST, ACR_ACCESS_KEY, ACR_SECRET_KEY in .env");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const httpMethod = "POST";
  const uri = "/v1/identify";
  const dataType = "audio";
  const signatureVersion = "1";

  const stringToSign = buildStringToSign(httpMethod, uri, ACR_ACCESS_KEY, dataType, signatureVersion, timestamp);
  const signature = signString(stringToSign, ACR_SECRET_KEY);

  const form = new FormData();
  form.append("access_key", ACR_ACCESS_KEY);
  form.append("data_type", dataType);
  form.append("signature_version", signatureVersion);
  form.append("signature", signature);
  form.append("timestamp", timestamp.toString());
  form.append("sample", buffer, { filename: `sample.${extension}`, contentType: `audio/${extension}` });

  const url = `https://${ACR_HOST}${uri}`;
  const response = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
    },
    timeout: 30000,
  });

  if (response.status === 200 && response.data.status && response.data.status.code === 0) {
    const data = response.data;
    if (data.metadata && data.metadata.music && data.metadata.music.length > 0) {
      return data.metadata.music[0];
    }
    return null;
  } else {
    const errMsg = response.data?.status?.msg || "Unknown error";
    throw new Error(`ACRCloud error: ${errMsg}`);
  }
}

// Helper: download from URL and recognise
async function recognizeFromUrl(url) {
  const buffer = await fetchBuffer(url);
  // Detect file extension from URL or just use mp3
  let ext = "mp3";
  if (url.match(/\.(mp4|mov|avi|mkv|webm)/i)) ext = "mp4";
  else if (url.match(/\.(mp3|ogg|wav|flac)/i)) ext = "mp3";
  return recognizeSong(buffer, ext);
}

// Helper: recognise from an uploaded file attachment
async function recognizeFromAttachment(attachment) {
  const buffer = await fetchBuffer(attachment.url);
  const ext = attachment.name.split(".").pop() || "mp3";
  return recognizeSong(buffer, ext);
}

module.exports = {
  recognizeSong,
  recognizeFromUrl,
  recognizeFromAttachment,
};