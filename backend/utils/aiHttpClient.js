const http = require("http");
const https = require("https");

const jsonResponse = (status, bodyText) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => bodyText,
  json: async () => {
    try {
      return JSON.parse(bodyText || "{}");
    } catch {
      return {};
    }
  },
});

const request = (urlString, { method = "GET", headers = {}, body = null } = {}) =>
  new Promise((resolve, reject) => {
    const targetUrl = new URL(urlString);
    const client = targetUrl.protocol === "https:" ? https : http;

    const req = client.request(
      targetUrl,
      {
        method,
        headers,
      },
      (res) => {
        const chunks = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve(jsonResponse(res.statusCode || 500, Buffer.concat(chunks).toString("utf8")));
        });
      }
    );

    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });

const buildMultipartBody = ({ fields = {}, file }) => {
  const boundary = `----accident-ai-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const chunks = [];

  Object.entries(fields).forEach(([key, value]) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value ?? "")}\r\n`,
        "utf8"
      )
    );
  });

  if (file?.buffer) {
    const safeFilename = String(file.filename || "upload.bin").replace(/"/g, "");
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName || "file"}"; filename="${safeFilename}"\r\nContent-Type: ${file.contentType || "application/octet-stream"}\r\n\r\n`,
        "utf8"
      )
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
};

exports.postJson = async (url, payload) => {
  const body = Buffer.from(JSON.stringify(payload || {}), "utf8");

  return request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(body.length),
    },
    body,
  });
};

exports.postMultipart = async (url, { fields = {}, file }) => {
  const multipart = buildMultipartBody({ fields, file });

  return request(url, {
    method: "POST",
    headers: {
      "Content-Type": multipart.contentType,
      "Content-Length": String(multipart.body.length),
    },
    body: multipart.body,
  });
};
