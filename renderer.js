const $ = (id) => document.getElementById(id);
const url = $("url");
const type = $("type");
const quality = $("quality");
const audioFormat = $("audioFormat");
const outputDir = $("outputDir");
const prefix = $("prefix");
const clipRows = $("clipRows");
const queue = $("queue");
const log = $("log");
const tools = $("tools");
let clipCount = 0;
const jobs = new Map();
const jobWaiters = new Map();
const terminalJobs = new Map();
const rememberedFolderKey = "ytclip.rememberedOutputFolder";

function addClip(start = "00:00:00", end = "00:00:00") {
  const row = document.createElement("div");
  row.className = "clipRow";
  row.innerHTML = `
    <div class="clipNum"></div>
    <div><label>Start</label><input class="start" placeholder="00:00:00" value="${start}"></div>
    <div><label>End</label><input class="end" placeholder="00:00:00" value="${end}"></div>
    <button class="danger remove" title="Remove">×</button>
  `;
  row.querySelector(".remove").onclick = () => {
    row.remove();
    renumber();
  };
  clipRows.appendChild(row);
  renumber();
}
function renumber() {
  const rows = [...clipRows.children];
  clipCount = rows.length;
  rows.forEach((row, index) => {
    const number = index + 1;
    row.dataset.n = number;
    row.querySelector(".clipNum").textContent = number;
  });
}
function appendLog(text) {
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}
function slug(s) {
  return (s || "download")
    .replace(/[\/\\:*?"<>|]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}
function getBaseName() {
  return slug(prefix.value || "download");
}
function timestampLabel(s, e) {
  return `${s} → ${e}`;
}
function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function detect() {
  const t = await window.ytclip.detectTools();
  const a = t.ytdlp ? "yt-dlp ✓" : "yt-dlp ✕";
  const b = t.ffmpeg ? "ffmpeg ✓" : "ffmpeg ✕";
  tools.textContent = `${a}  ·  ${b}`;
  tools.title = `yt-dlp: ${t.ytdlp || "not found"}\nffmpeg: ${t.ffmpeg || "not found"}`;
}
type.onchange = () => {
  const audio = type.value === "audio";
  $("clipsCard").classList.toggle("hidden", type.value !== "clips");
  $("qualityField").classList.toggle("hidden", audio);
  $("audioField").classList.toggle("hidden", !audio);
};
$("addClip").onclick = () => addClip();
$("clearTimestamps").onclick = () => {
  [...clipRows.children].forEach((row) => {
    row.querySelector(".start").value = "00:00:00";
    row.querySelector(".end").value = "00:00:00";
  });
};
$("chooseFolder").onclick = async () => {
  const p = await window.ytclip.chooseFolder();
  if (p) {
    outputDir.value = p;
    saveFolderPreference();
  }
};
$("rememberFolder").onchange = saveFolderPreference;
$("openFolder").onclick = () =>
  outputDir.value && window.ytclip.openFolder(outputDir.value);
$("clearLog").onclick = () => (log.textContent = "");
$("clearQueue").onclick = () => {
  [...queue.children].forEach((item) => {
    const status = item.querySelector(".status").textContent;
    if (!status.includes("Running") && !status.includes("Starting")) {
      jobs.delete(item.id);
      item.remove();
    }
  });
  updateQueueSummary();
};

$("clear").onclick = () => {
  url.value = "";
  prefix.value = "";
  clipRows.innerHTML = "";
  clipCount = 0;
  addClip();
};

$("download").onclick = async () => {
  if (!isHttpUrl(url.value.trim()))
    return alert("Add a valid http(s) video URL first.");
  if (!outputDir.value) return alert("Choose an output folder first.");

  const specs = [];
  if (type.value === "clips") {
    const rows = [...clipRows.children];
    if (!rows.length) return alert("Add at least one clip.");
    rows.forEach((r, i) => {
      const s = r.querySelector(".start").value.trim();
      const e = r.querySelector(".end").value.trim();
      if (s && e)
        specs.push({
          url: url.value.trim(),
          clip: true,
          start: s,
          end: e,
          quality: quality.value,
          outputDir: outputDir.value,
          name: prefix.value.trim() ? getBaseName() : "",
          useVideoTitle: $("useVideoTitle").checked,
          clipNumber: i + 1,
        });
    });
    if (!specs.length) return alert("Enter at least one Start and End pair.");
  } else {
    specs.push({
      url: url.value.trim(),
      clip: false,
      quality: quality.value,
      audioOnly: type.value === "audio",
      audioFormat: audioFormat.value,
      outputDir: outputDir.value,
      name: prefix.value.trim() ? getBaseName() : "",
    });
  }

  $("download").disabled = true;
  for (const spec of specs) await startSpec(spec);
  $("download").disabled = false;
};

async function startSpec(spec) {
  try {
    const result = await window.ytclip.startJob(spec);
    addQueueItem(result.id, { ...spec, displayName: result.name }, spec);
    await waitForJob(result.id);
  } catch (e) {
    appendLog(`ERROR: ${e.message}\n`);
  }
}

function addQueueItem(id, spec, retrySpec = spec) {
  const item = document.createElement("div");
  item.className = "queueItem";
  item.id = id;
  item.retrySpec = retrySpec;
  const displayName = spec.displayName || spec.name || "download";
  const label = spec.clip
    ? timestampLabel(spec.start, spec.end)
    : spec.audioOnly
      ? "Audio only"
      : "Full video";
  item.innerHTML = `
    <div class="qtop">
      <strong>${displayName}</strong>
      <span class="status">Starting…</span>
    </div>
    <div class="qmeta">${label} · ${spec.audioOnly ? spec.audioFormat.toUpperCase() : spec.quality === "best" ? "Best" : spec.quality + "p"}</div>
    <div class="progress"><div></div></div>
    <button class="secondary small cancel" style="margin-top:8px">Cancel</button>
  `;
  item.querySelector(".cancel").onclick = () => window.ytclip.cancelJob(id);
  queue.prepend(item);
  jobs.set(id, item);
  $("queueSummary").textContent =
    `${jobs.size} job${jobs.size === 1 ? "" : "s"}`;
}

function waitForJob(id) {
  if (terminalJobs.has(id)) {
    terminalJobs.delete(id);
    return Promise.resolve();
  }
  return new Promise((resolve) => jobWaiters.set(id, resolve));
}

function updateQueueSummary() {
  $("queueSummary").textContent =
    `${jobs.size} job${jobs.size === 1 ? "" : "s"}`;
}

function saveFolderPreference() {
  if ($("rememberFolder").checked && outputDir.value) {
    localStorage.setItem(rememberedFolderKey, outputDir.value);
  } else {
    localStorage.removeItem(rememberedFolderKey);
  }
}

window.ytclip.onJobEvent((ev) => {
  if (ev.type === "done" || ev.type === "failed" || ev.type === "error") {
    const resolve = jobWaiters.get(ev.id);
    if (resolve) {
      resolve();
      jobWaiters.delete(ev.id);
    } else {
      terminalJobs.set(ev.id, true);
    }
  }
  const item = jobs.get(ev.id);
  if (ev.type === "log") appendLog(ev.text);
  if (!item) return;
  const status = item.querySelector(".status");
  const bar = item.querySelector(".progress > div");
  if (ev.type === "start") status.textContent = "Running…";
  if (ev.type === "progress") bar.style.width = `${ev.value}%`;
  if (ev.type === "speed")
    item.querySelector(".qmeta").textContent += ` · ${ev.value}`;
  if (ev.type === "done") {
    bar.style.width = "100%";
    status.textContent = "Done ✓";
    item.querySelector(".cancel").remove();
  }
  if (ev.type === "failed") {
    status.textContent = `Failed (${ev.code})`;
    showRetry(item);
  }
  if (ev.type === "error") {
    status.textContent = "Error";
    showRetry(item);
  }
});

function showRetry(item) {
  const button = item.querySelector(".cancel");
  if (!button) return;
  button.textContent = "Retry";
  button.classList.remove("cancel");
  button.classList.add("retry");
  button.onclick = () => startSpec(item.retrySpec);
}

addClip();
const rememberedFolder = localStorage.getItem(rememberedFolderKey);
if (rememberedFolder) {
  outputDir.value = rememberedFolder;
  $("rememberFolder").checked = true;
}
detect();
