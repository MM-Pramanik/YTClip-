const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execFile } = require("child_process");

app.setName("YTClip");

let mainWindow;
const jobs = new Map();
let jobCounter = 0;

function getExecutableCandidates(name) {
  const pathEntries = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((entry) => path.join(entry, name));

  return [
    ...pathEntries,
    `/opt/homebrew/bin/${name}`,
    `/opt/homebrew/opt/${name}/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/local/opt/${name}/bin/${name}`,
    `/usr/bin/${name}`,
    `/bin/${name}`,
    path.join(os.homedir(), "bin", name),
  ];
}

function findExecutable(name) {
  const seen = new Set();
  for (const candidate of getExecutableCandidates(name)) {
    const normalized = path.normalize(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
      return normalized;
    }
  }
  return null;
}

function createWindow() {
  const iconPath = path.join(__dirname, "build", process.platform === "darwin" ? "icon.icns" : "icon.png");
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 760,
    minWidth: 850,
    minHeight: 650,
    title: "YTClip | Video Downloader",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function getMissingDependencies() {
  const result = [];
  if (!findExecutable("yt-dlp")) result.push("yt-dlp");
  if (!findExecutable("ffmpeg")) result.push("ffmpeg");
  return result;
}

function warnMissingDependencies() {
  const missing = getMissingDependencies();
  if (!missing.length || !mainWindow || mainWindow.isDestroyed()) return;

  dialog
    .showMessageBox(mainWindow, {
      type: "warning",
      title: "YTClip setup required",
      message: "Required tools are missing.",
      detail: `YTClip needs ${missing.join(" and ")} installed to download media.\n\nInstall with: brew install ${missing.join(" ")}`,
      buttons: ["OK"],
    })
    .catch(() => undefined);
}

app.whenReady().then(() => {
  ipcMain.handle("tools:detect", () => ({
    ytdlp: findExecutable("yt-dlp"),
    ffmpeg: findExecutable("ffmpeg"),
    ffprobe: findExecutable("ffprobe"),
  }));

  ipcMain.handle("dialog:folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("job:start", async (_, spec) => startJob(spec));
  ipcMain.handle("job:cancel", (_, id) => cancelJob(id));
  ipcMain.handle("folder:open", (_, folder) => shell.openPath(folder));

  createWindow();
  warnMissingDependencies();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

async function startJob(spec) {
  const ytdlp = findExecutable("yt-dlp");
  const ffmpeg = findExecutable("ffmpeg");
  if (!ytdlp)
    throw new Error(
      "yt-dlp was not found. Install it with: brew install yt-dlp",
    );
  if (!ffmpeg)
    throw new Error(
      "ffmpeg was not found. Install it with: brew install ffmpeg",
    );
  if (!isHttpUrl(spec.url))
    throw new Error("Only http(s) video URLs are supported.");

  const title = await getVideoTitle(ytdlp, spec.url);
  const baseName =
    spec.name || (spec.clip && !spec.useVideoTitle ? "clip" : title);
  const resolvedName = spec.clip
    ? `${baseName}_${String(spec.clipNumber || 1).padStart(2, "0")}`
    : baseName;
  const id = `job-${++jobCounter}`;
  const outputDir = spec.outputDir || path.join(os.homedir(), "Downloads");
  fs.mkdirSync(outputDir, { recursive: true });

  const ext = spec.audioOnly ? spec.audioFormat || "mp3" : "mp4";
  const safeTitle = safeFilename(resolvedName);
  const outputTemplate = path.join(outputDir, `${safeTitle}.%(ext)s`);

  const args = [];

  if (spec.clip && spec.start && spec.end) {
    args.push(
      "--download-sections",
      `*${normalizeTime(spec.start)}-${normalizeTime(spec.end)}`,
    );
  }

  if (spec.audioOnly) {
    args.push(
      "-x",
      "--audio-format",
      spec.audioFormat || "mp3",
      "--audio-quality",
      "0",
    );
  } else {
    let format;
    if (spec.quality === "best") {
      format = "bv*+ba/b";
    } else {
      const height = Number(spec.quality);
      format = `bv*[height<=${height}]+ba/b[height<=${height}]`;
    }
    args.push("-f", format, "--merge-output-format", "mp4");
  }

  args.push(
    "--newline",
    "--continue",
    "--no-part",
    "--no-playlist",
    "-o",
    outputTemplate,
    spec.url,
  );

  const child = spawn(ytdlp, args, {
    cwd: outputDir,
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`,
    },
  });

  jobs.set(id, child);
  send("job:event", { id, type: "start", spec: { ...spec, name: safeTitle } });

  let buffer = "";
  child.stdout.on("data", (d) => {
    const text = d.toString();
    buffer += text;
    send("job:event", { id, type: "log", text });

    const m = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (m) send("job:event", { id, type: "progress", value: Number(m[1]) });

    const tm = text.match(/\[download\]\s+.*?at\s+(.+?)\s+ETA\s+(.+?)(?:\s|$)/);
    if (tm) send("job:event", { id, type: "speed", value: tm[1], eta: tm[2] });
  });

  child.stderr.on("data", (d) => {
    const text = d.toString();
    buffer += text;
    send("job:event", { id, type: "log", text });
  });

  child.on("error", (err) => {
    jobs.delete(id);
    send("job:event", { id, type: "error", message: err.message });
  });

  child.on("close", (code) => {
    jobs.delete(id);
    send("job:event", {
      id,
      type: code === 0 ? "done" : "failed",
      code,
      log: buffer,
    });
  });

  return { id, name: safeTitle };
}

function cancelJob(id) {
  const child = jobs.get(id);
  if (!child) return false;
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 2500);
  return true;
}

function normalizeTime(value) {
  const s = String(value).trim();
  const parts = s.split(":").map(Number);
  if (parts.some(Number.isNaN)) throw new Error(`Invalid timestamp: ${value}`);
  if (parts.length === 2)
    return `00:${String(parts[0]).padStart(2, "0")}:${String(parts[1]).padStart(2, "0")}`;
  if (parts.length === 3)
    return parts.map((x, i) => String(x).padStart(2, "0")).join(":");
  throw new Error(`Invalid timestamp: ${value}`);
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function safeFilename(value) {
  const result = String(value)
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 120);
  return result || "download";
}

function getVideoTitle(ytdlp, url) {
  return new Promise((resolve) => {
    execFile(
      ytdlp,
      ["--no-playlist", "--skip-download", "--print", "%(title)s", url],
      { timeout: 120000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        const title = stdout && stdout.trim().split("\n")[0];
        resolve(title || "download");
      },
    );
  });
}
