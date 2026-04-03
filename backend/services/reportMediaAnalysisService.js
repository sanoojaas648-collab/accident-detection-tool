const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const repoRoot = path.join(__dirname, "..", "..");
const imageAiRoot = path.join(repoRoot, "image-ai");
const runnerPath = path.join(imageAiRoot, "app", "report_runner.py");
const sitePackagesPath = path.join(imageAiRoot, ".venv", "Lib", "site-packages");

const parseJsonPayload = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
};

const buildPythonCandidates = () => {
  const configuredPath = String(process.env.IMAGE_AI_PYTHON || "").trim();
  return [
    configuredPath ? { command: configuredPath, args: [] } : null,
    { command: path.join(imageAiRoot, ".venv", "Scripts", "python.exe"), args: [] },
    { command: path.join(imageAiRoot, ".venv", "bin", "python"), args: [] },
    { command: "py", args: ["-3.11"] },
    { command: "python", args: [] },
    { command: "python3", args: [] },
  ].filter(Boolean);
};

const looksLikePath = (candidate) =>
  path.isAbsolute(candidate) || candidate.includes("/") || candidate.includes("\\");

const buildPythonEnv = () => {
  const extraPaths = [imageAiRoot];
  if (fs.existsSync(sitePackagesPath)) {
    extraPaths.push(sitePackagesPath);
  }

  const existingPythonPath = String(process.env.PYTHONPATH || "").trim();
  if (existingPythonPath) {
    extraPaths.push(existingPythonPath);
  }

  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONPATH: extraPaths.join(path.delimiter),
  };
};

const toRunnerError = (message, retryable = false) => {
  const runnerError = new Error(message);
  runnerError.retryable = retryable;
  return runnerError;
};

const executeRunner = ({ command, args }, { filePath, mimeType = "", timeoutMs }) =>
  new Promise((resolve, reject) => {
    if (!fs.existsSync(runnerPath)) {
      reject(toRunnerError("image-ai report runner is missing"));
      return;
    }

    if (looksLikePath(command) && !fs.existsSync(command)) {
      reject(toRunnerError(`Python executable not found: ${command}`, true));
      return;
    }

    try {
      execFile(
        command,
        [...args, runnerPath, "--file", path.resolve(filePath), "--mime-type", mimeType],
        {
          cwd: imageAiRoot,
          timeout: Number.isFinite(timeoutMs) ? timeoutMs : 20000,
          maxBuffer: 1024 * 1024,
          env: buildPythonEnv(),
        },
        (error, stdout, stderr) => {
          const stderrPayload = parseJsonPayload(stderr);
          const stdoutPayload = parseJsonPayload(stdout);

          if (error) {
            reject(
              toRunnerError(
                stderrPayload?.message ||
                  stdoutPayload?.message ||
                  String(stderr || "").trim() ||
                  error.message,
                error.code === "ENOENT" ||
                  error.code === "EPERM" ||
                  /No Python at/i.test(error.message) ||
                  /Python executable not found/i.test(error.message)
              )
            );
            return;
          }

          if (!stdoutPayload?.success || !stdoutPayload.analysis) {
            reject(toRunnerError(stdoutPayload?.message || "image-ai did not return an analysis result"));
            return;
          }

          resolve(stdoutPayload.analysis);
        }
      );
    } catch (error) {
      reject(
        toRunnerError(
          error.message,
          error.code === "ENOENT" ||
            error.code === "EPERM" ||
            /No Python at/i.test(error.message) ||
            /Python executable not found/i.test(error.message)
        )
      );
    }
  });

exports.analyzeCitizenReportMedia = async ({ filePath, mimeType = "" }) => {
  const timeoutMs = Number(process.env.IMAGE_AI_TIMEOUT_MS || 20000);
  const candidates = buildPythonCandidates();
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await executeRunner(candidate, { filePath, mimeType, timeoutMs });
    } catch (error) {
      lastError = error;
      if (!error.retryable) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Could not start image-ai analysis");
};
