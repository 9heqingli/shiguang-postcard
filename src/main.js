import {
  analyzeImage,
  defaultCopy,
  loadImageFile,
  PAPERS,
  PAPER_ORDER,
  pickSymbols,
} from "./analysis.js";
import { renderPoster, specFor } from "./compose.js";
import { drawSymbolInk } from "./ink.js";
import { makeArchive } from "./memoryArchive.js";
import { buildPrompt } from "./prompt.js";
import { makeWorld } from "./secondWorld.js";
import { SYMBOLS, SYMBOL_KEYS } from "./symbols.js";

const $ = (sel) => document.querySelector(sel);
const canvas = $("#poster");
const fileInput = $("#fileInput");
const cameraInput = $("#cameraInput");
const PREVIEW_SCALE = 1;
const EXPORT_SCALE = 2;
const PREVIEW_DELAY = 45;

const state = {
  img: null,
  url: null,
  fileName: "",
  analysis: null,
  layoutChoice: "auto",
  layout: "top-bottom",
  style: "healing",
  paper: "oatmeal",
  ink: "#7F0019",
  inkName: "MUJI 红",
  inkNameEn: "MUJI deep red",
  symbols: [],
  text: {
    kicker: "POCKET ARCHIVE",
    title: "A QUIET MOMENT",
    subtitle: "",
    place: "HERE / 此地",
    date: "",
    code: "NO. 001",
    caption: "",
  },
  seed: Math.floor(Math.random() * 100000),
  worldSeed: 0,
  world: null,
  archiveSeed: 0,
  archive: null,
  titles: { healing: "", "memory-archive": "" },
  scale: EXPORT_SCALE,
  previewScale: PREVIEW_SCALE,
  exportScale: EXPORT_SCALE,
  meta: null,
};

const INKS = [
  { hex: "#7F0019", name: "MUJI 红", en: "MUJI deep red" },
  { hex: "#8E2632", name: "胭脂", en: "rouge red" },
  { hex: "#8C3428", name: "朱砂", en: "cinnabar red" },
  { hex: "#734029", name: "赭石", en: "ochre brown" },
  { hex: "#4E3B5C", name: "黛紫", en: "dusty violet" },
  { hex: "#1F5B6B", name: "石青", en: "mineral blue" },
  { hex: "#2D4671", name: "藏青", en: "navy blue" },
  { hex: "#3F5641", name: "竹青", en: "bamboo green" },
  { hex: "#41474C", name: "墨灰", en: "ink gray" },
  { hex: "#302D2B", name: "玄色", en: "charcoal black" },
];

let renderTimer = null;
let renderDeferred = false;
let renderPending = false;
let exportInProgress = false;
let scrollStageAfterRender = false;
let toastTimer = null;
let inputTimer = null;

function toast(message, ms = 2400) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), ms);
}

function setBusy(on) {
  document.body.classList.toggle("busy", on);
}

function autoLayout(analysis) {
  if (analysis.orientation === "portrait") return "left-right";
  if (analysis.orientation === "square" && analysis.tags.includes("portrait")) return "left-right";
  return "top-bottom";
}

/* ----------------------------------------------------------------------- */
/* Controls                                                                */
/* ----------------------------------------------------------------------- */

function buildPaperControl() {
  const wrap = $("#paperControl");
  wrap.innerHTML = "";
  for (const key of PAPER_ORDER) {
    const paper = PAPERS[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (key === state.paper ? " on" : "");
    btn.dataset.paper = key;
    btn.innerHTML = `<i style="--sw:${paper.base}"></i><span>${paper.name}</span>`;
    btn.addEventListener("click", () => {
      state.paper = key;
      wrap.querySelectorAll(".swatch").forEach((el) => el.classList.toggle("on", el.dataset.paper === key));
      $("#paperHint").textContent = paper.name;
      scheduleRender();
    });
    wrap.appendChild(btn);
  }
}

function buildInkControl() {
  const wrap = $("#inkControl");
  wrap.innerHTML = "";
  for (const ink of INKS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ink-chip" + (ink.hex === state.ink ? " on" : "");
    btn.dataset.ink = ink.hex;
    btn.title = `${ink.name} · ${ink.hex}`;
    btn.setAttribute("aria-label", `${ink.name}，${ink.hex}`);
    btn.setAttribute("aria-pressed", String(ink.hex === state.ink));
    btn.innerHTML = `<i style="--c:${ink.hex}"></i><span>${ink.name}</span>`;
    btn.addEventListener("click", () => {
      state.ink = ink.hex;
      state.inkName = ink.name;
      state.inkNameEn = ink.en;
      wrap.querySelectorAll(".ink-chip").forEach((el) => {
        const on = el.dataset.ink === ink.hex;
        el.classList.toggle("on", on);
        el.setAttribute("aria-pressed", String(on));
      });
      $("#inkHint").textContent = ink.name;
      scheduleRender();
    });
    wrap.appendChild(btn);
  }
  const current = INKS.find((ink) => ink.hex === state.ink) || INKS[0];
  $("#inkHint").textContent = current.name;
}

function updatePaperUI() {
  document.querySelectorAll(".swatch").forEach((el) => el.classList.toggle("on", el.dataset.paper === state.paper));
  $("#paperHint").textContent = PAPERS[state.paper]?.name || "燕麦纸";
}

function updateLayoutUI() {
  document.querySelectorAll("#layoutControl button").forEach((el) => {
    el.classList.toggle("on", el.dataset.layout === state.layoutChoice);
  });
  const name = state.layout === "left-right" ? "左图右文" : "上图下文";
  $("#layoutHint").textContent = state.layoutChoice === "auto" ? `自动 · ${name}` : name;
}

function updateStyleUI() {
  const second = state.style === "second-world";
  const archive = state.style === "memory-archive";
  document.querySelectorAll("[data-style]").forEach((el) => {
    const on = el.dataset.style === state.style;
    el.classList.toggle("on", on);
    el.setAttribute("aria-pressed", String(on));
  });
  $("#styleHint").textContent = second ? "3:4 摄影二创" : archive ? "照片 + 水彩记忆页" : "照片与居中的纸";
  $("#layoutBlock").hidden = second || archive;
  $("#symbolBlock").hidden = second || archive;
  $("#inkBlock").hidden = second || archive;
  $("#worldBlock").hidden = !second;
  $("#archiveBlock").hidden = !archive;
  $("#titleField").hidden = second;
  $("#subtitleField").hidden = second || archive;
  $("#captionField").hidden = !second;
  $("#placeDateFields").hidden = archive;
  $("#titleFieldLabel").textContent = archive ? "英文档案标题" : "标题";
  $("#titleInput").maxLength = archive ? 36 : 28;
  $("#worldHint").textContent = second ? `${state.world?.label || "一页小世界"} · ${state.world?.figureCount ?? 1} 位使用者` : "";
  $("#worldDescription").textContent = second
    ? "照片底部的结构继续延伸进纸里：水会变成可牵动的涟漪，山路会变成可攀折的脊线，光也会被借走一小段。"
    : "";
  $("#archiveHint").textContent = archive ? `${state.text.title || state.archive?.title || "SMALL PAUSE"} · 3 色记忆` : "";
  $("#archiveDescription").textContent = archive
    ? "原照片完整保留，另一侧是一整页水彩记忆：留白、手写标题、三枚色块和三行空白的日记线。"
    : "";
  $("#shuffleLabel").textContent = second ? "换一个世界" : archive ? "换一页记忆" : "换一组";
  $("#copyHint").textContent = second ? "一句英文旁白" : archive ? "2–5 个英文词" : "可留空";
}

function ensureWorld(force = false) {
  if (!state.analysis) return;
  if (!force && state.world) return;
  const previous = state.world;
  state.worldSeed = force ? state.worldSeed + 1 : state.worldSeed;
  state.world = makeWorld(state.analysis, state.seed + state.worldSeed * 1031);
  if (!state.text.caption || state.text.caption === previous?.caption) {
    state.text.caption = state.world.caption;
  }
}

function ensureArchive(force = false) {
  if (!state.analysis) return;
  if (!force && state.archive) return;
  const previous = state.archive;
  state.archiveSeed = force ? state.archiveSeed + 1 : state.archiveSeed;
  state.archive = makeArchive(state.analysis, state.seed + state.archiveSeed * 8269);
  if (force || !state.text.title || state.text.title === previous?.title) {
    state.text.title = state.archive.title;
    state.titles["memory-archive"] = state.archive.title;
  }
}

function applyStyle(style) {
  if (!["healing", "second-world", "memory-archive"].includes(style)) return;
  if (state.style === "healing" || state.style === "memory-archive") {
    state.titles[state.style] = state.text.title;
  }
  state.style = style;
  if (style === "second-world" && state.analysis) {
    ensureWorld();
    if (!state.text.caption) state.text.caption = state.world.caption;
    fillTextFields();
  }
  if (style === "memory-archive" && state.analysis) {
    ensureArchive();
    state.text.title = state.titles["memory-archive"] || state.archive.title;
    state.titles["memory-archive"] = state.text.title;
    fillTextFields();
  } else if (style === "healing" && state.analysis) {
    state.text.title = state.titles.healing || state.text.title;
    fillTextFields();
  }
  scrollStageAfterRender = Boolean(state.analysis && window.matchMedia("(max-width: 900px)").matches);
  updateStyleUI();
  updateMeta();
  scheduleRender({ immediate: true });
}

function fillTextFields() {
  $("#titleInput").value = state.text.title || "";
  $("#subtitleInput").value = state.text.subtitle || "";
  $("#captionInput").value = state.text.caption || "";
  $("#placeInput").value = state.text.place || "";
  $("#dateInput").value = state.text.date || "";
}

function previewCanvas(key, size, seed) {
  const c = document.createElement("canvas");
  const dpr = 2;
  c.width = size * dpr;
  c.height = size * dpr;
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  g.fillStyle = PAPERS[state.paper]?.base || "#d8cebd";
  g.fillRect(0, 0, size, size);
  drawSymbolInk(g, key, { x: size * 0.08, y: size * 0.08, w: size * 0.84, h: size * 0.84 }, seed, dpr);
  return c;
}

function renderSymbolGrid() {
  const grid = $("#symbolGrid");
  grid.innerHTML = "";
  state.symbols.forEach((symbol, index) => {
    const def = SYMBOLS[symbol.key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "symbol-chip on";
    btn.title = `移除「${def?.zh || symbol.key}」`;
    const c = previewCanvas(symbol.key, 76, symbol.seed ?? index + 3);
    btn.appendChild(c);
    const name = document.createElement("span");
    name.className = "chip-name";
    name.textContent = def?.zh || symbol.key;
    btn.appendChild(name);
    const x = document.createElement("span");
    x.className = "chip-x";
    x.textContent = "×";
    btn.appendChild(x);
    btn.addEventListener("click", () => {
      if (state.symbols.length <= 1) {
        toast("至少保留一枚符号");
        return;
      }
      state.symbols = state.symbols.filter((s) => s !== symbol);
      renderSymbolGrid();
      scheduleRender();
    });
    grid.appendChild(btn);
  });
  if (state.symbols.length < 8) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "symbol-chip symbol-add";
    add.title = "从符号库添加";
    add.innerHTML = `<span class="add-plus">+</span><span class="add-label">添加</span>`;
    add.addEventListener("click", openLibrary);
    grid.appendChild(add);
  }
  $("#symbolCount").textContent = String(state.symbols.length);
  updateLibraryAdded();
}

function openLibrary() {
  const dialog = $("#libraryDialog");
  const grid = $("#libraryGrid");
  if (!grid.childElementCount) {
    const fragment = document.createDocumentFragment();
    SYMBOL_KEYS.forEach((key) => {
      const def = SYMBOLS[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lib-item";
      btn.dataset.key = key;
      btn.appendChild(previewCanvas(key, 64, 29 + SYMBOL_KEYS.indexOf(key) * 3));
      const span = document.createElement("span");
      span.textContent = def.zh;
      btn.appendChild(span);
      btn.addEventListener("click", () => {
        if (state.symbols.length >= 8) {
          toast("最多 8 枚符号，先去掉一枚吧");
          return;
        }
        if (state.symbols.some((s) => s.key === key)) return;
        const base = state.symbols.find((s) => s.primary)?.weight ?? 1;
        state.symbols.push({
          key,
          seed: Math.floor(Math.random() * 1e9),
          weight: Math.max(0.45, base * 0.62),
          confidence: 0.3,
          primary: false,
        });
        renderSymbolGrid();
        scheduleRender();
        toast(`已加入「${def.zh}」`);
      });
      fragment.appendChild(btn);
    });
    grid.appendChild(fragment);
  }
  updateLibraryAdded();
  dialog.showModal();
}

function updateLibraryAdded() {
  document.querySelectorAll(".lib-item").forEach((el) => {
    el.classList.toggle("added", state.symbols.some((s) => s.key === el.dataset.key));
  });
}

function updateMeta() {
  if (!state.analysis) return;
  const second = state.style === "second-world";
  const archive = state.style === "memory-archive";
  const spec = specFor(state.analysis, state.layout, state.style);
  const n = state.symbols.length;
  $("#stageBar").hidden = false;
  $("#analysisStrip").hidden = false;
  $("#metaLayout").textContent = spec.name;
  const exportScale = state.exportScale ?? state.scale ?? EXPORT_SCALE;
  $("#metaSize").textContent = `${spec.w * exportScale} × ${spec.h * exportScale}`;
  $("#metaPaper").textContent = PAPERS[state.paper]?.name || "";
  $("#analysisStrip").innerHTML = second
    ? `<span>STYLE <b>第二世界</b></span><i></i>` +
      `<span>${state.world?.label || "一页小世界"}</span><i></i>` +
      `<span>${PAPERS[state.paper]?.name || ""}</span><i></i>` +
      `<span>LOCAL RENDER</span>`
    : archive
      ? `<span>STYLE <b>记忆档案</b></span><i></i>` +
        `<span>${state.text.title || state.archive?.title || "SMALL PAUSE"}</span><i></i>` +
        `<span>${PAPERS[state.paper]?.name || ""}</span><i></i>` +
        `<span>LOCAL RENDER</span>`
    : `<span>SCENE <b>${state.analysis.sceneLabel}</b></span><i></i>` +
      `<span>${n} SYMBOLS</span><i></i>` +
      `<span>${PAPERS[state.paper]?.name || ""}</span><i></i>` +
      `<span>LOCAL RENDER</span>`;
  $("#exportHint").textContent = `${spec.w * exportScale} px 长边`;
  $("#sourceDims").textContent = `${state.analysis.width} × ${state.analysis.height}`;
}

function activeDialog() {
  return document.querySelector("dialog[open]");
}

function scheduleRender(options = {}) {
  if (!state.analysis) return;
  if (activeDialog()) {
    renderDeferred = true;
    return;
  }
  clearTimeout(renderTimer);
  renderTimer = setTimeout(runRender, options.immediate ? 0 : PREVIEW_DELAY);
}

function runRender() {
  if (!state.analysis || activeDialog()) {
    renderDeferred = Boolean(state.analysis);
    return;
  }
  if (renderPending) {
    renderDeferred = true;
    return;
  }
  renderPending = true;
  try {
    state.meta = renderPoster(canvas, state, { scale: PREVIEW_SCALE });
    canvas.classList.remove("is-empty");
    updateMeta();
    if (scrollStageAfterRender) {
      scrollStageAfterRender = false;
      requestAnimationFrame(() => {
        $("#stage").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  } catch (err) {
    console.error(err);
    toast("生成时出了点问题，请换一张照片试试");
  } finally {
    renderPending = false;
    if (renderDeferred) {
      renderDeferred = false;
      scheduleRender({ immediate: true });
    }
  }
}

/* ----------------------------------------------------------------------- */
/* Photo intake                                                            */
/* ----------------------------------------------------------------------- */

async function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("请选择一张图片文件");
    return;
  }
  if (file.size > 40 * 1024 * 1024) {
    toast("图片有点大，请选择 40MB 以内的照片");
    return;
  }
  setBusy(true);
  try {
    const { img, url } = await loadImageFile(file);
    if (state.url) URL.revokeObjectURL(state.url);
    state.img = img;
    state.url = url;
    state.fileName = file.name || "camera.jpg";
    state.analysis = analyzeImage(img);
    state.layoutChoice = "auto";
    state.layout = autoLayout(state.analysis);
    state.paper = state.analysis.paper;
    state.ink = "#7F0019";
    state.inkName = "MUJI 红";
    state.inkNameEn = "MUJI deep red";
    state.seed = Math.floor(Math.random() * 100000);
    state.symbols = pickSymbols(state.analysis, state.seed);
    state.text = defaultCopy(state.analysis);
    state.worldSeed = 0;
    state.world = makeWorld(state.analysis, state.seed);
    state.text.caption = state.world.caption;
    state.archiveSeed = 0;
    state.archive = makeArchive(state.analysis, state.seed);
    state.titles.healing = state.text.title;
    state.titles["memory-archive"] = state.archive.title;
    if (state.style === "memory-archive") state.text.title = state.archive.title;

    $("#emptyState").hidden = true;
    $("#introBlock").hidden = true;
    $("#editor").hidden = false;
    $("#sourceImg").src = url;
    $("#sourceName").textContent = state.fileName;
    $("#sourceDims").textContent = `${state.analysis.width} × ${state.analysis.height}`;

    buildPaperControl();
    buildInkControl();
    updateStyleUI();
    updatePaperUI();
    updateLayoutUI();
    fillTextFields();
    renderSymbolGrid();
    scheduleRender();
    updateMeta();

    if (window.matchMedia("(max-width: 900px)").matches) {
      scrollStageAfterRender = true;
    }
  } catch (err) {
    console.error(err);
    toast(err.message || "这张图片读不出来，换一张试试");
  } finally {
    setBusy(false);
  }
}

function pickFile() {
  fileInput.value = "";
  fileInput.click();
}

function shoot() {
  cameraInput.value = "";
  cameraInput.click();
}

function reset() {
  if (state.url) URL.revokeObjectURL(state.url);
  state.img = null;
  state.url = null;
  state.analysis = null;
  state.symbols = [];
  state.world = null;
  state.worldSeed = 0;
  state.archive = null;
  state.archiveSeed = 0;
  state.titles = { healing: "", "memory-archive": "" };
  state.text = {
    kicker: "POCKET ARCHIVE",
    title: "",
    subtitle: "",
    place: "HERE / 此地",
    date: "",
    code: "",
    caption: "",
  };
  canvas.classList.add("is-empty");
  $("#emptyState").hidden = false;
  $("#editor").hidden = true;
  $("#introBlock").hidden = false;
  $("#stageBar").hidden = true;
  $("#analysisStrip").hidden = true;
  $("#libraryGrid").innerHTML = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ----------------------------------------------------------------------- */
/* Export                                                                  */
/* ----------------------------------------------------------------------- */

function download() {
  if (!state.analysis) {
    toast("先选一张照片吧");
    return;
  }
  if (exportInProgress) return;
  exportInProgress = true;
  setBusy(true);
  toast("正在生成高清明信片…", 8000);

  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        state.meta = renderPoster(canvas, state, { scale: EXPORT_SCALE });
        canvas.toBlob((blob) => {
          if (!blob) {
            toast("导出失败，请再试一次");
            finishExport();
            return;
          }
          const stamp = new Date();
          const pad = (n) => String(n).padStart(2, "0");
          const name = `拾光明信片-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
            stamp.getDate()
          )}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.png`;
          const a = document.createElement("a");
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          toast("明信片已保存");
          finishExport();
        }, "image/png");
      } catch (err) {
        console.error(err);
        toast("导出失败，请再试一次");
        finishExport();
      }
    }, 0);
  });
}

function finishExport() {
  exportInProgress = false;
  setBusy(false);
  scheduleRender({ immediate: true });
}

async function copyPrompt() {
  if (!state.analysis) {
    toast("先选一张照片吧");
    return;
  }
  const prompt = buildPrompt(state, state.analysis, state.meta);
  try {
    await navigator.clipboard.writeText(prompt);
    toast("Prompt 已复制，可交给图像模型再生成一版");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = prompt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("Prompt 已复制");
    } catch {
      toast("复制失败，请手动选择文本");
    }
    ta.remove();
  }
}

/* ----------------------------------------------------------------------- */
/* Wiring                                                                  */
/* ----------------------------------------------------------------------- */

$("#pickBtn").addEventListener("click", pickFile);
$("#emptyPickBtn").addEventListener("click", pickFile);
$("#cameraBtn").addEventListener("click", shoot);
$("#emptyCameraBtn").addEventListener("click", shoot);
$("#replaceBtn").addEventListener("click", pickFile);
fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
cameraInput.addEventListener("change", () => handleFile(cameraInput.files[0]));

$("#layoutControl").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-layout]");
  if (!btn) return;
  state.layoutChoice = btn.dataset.layout;
  state.layout = state.layoutChoice === "auto" ? autoLayout(state.analysis) : state.layoutChoice;
  updateLayoutUI();
  scheduleRender();
});

$("#resampleBtn").addEventListener("click", () => {
  if (!state.analysis) return;
  state.seed = (state.seed + 7919) % 1000000;
  state.symbols = pickSymbols(state.analysis, state.seed);
  renderSymbolGrid();
  scheduleRender();
  toast(`重新拾取了 ${state.symbols.length} 枚符号`);
});

$("#shuffleBtn").addEventListener("click", () => {
  if (!state.analysis) return;
  if (state.style === "second-world") {
    ensureWorld(true);
    fillTextFields();
    updateStyleUI();
    scheduleRender({ immediate: true });
    updateMeta();
    toast("换了一个第二世界");
    return;
  }
  if (state.style === "memory-archive") {
    ensureArchive(true);
    fillTextFields();
    updateStyleUI();
    scheduleRender({ immediate: true });
    updateMeta();
    toast("换了一页记忆");
    return;
  }
  state.seed = (state.seed + 3571) % 1000000;
  state.symbols = pickSymbols(state.analysis, state.seed);
  renderSymbolGrid();
  scheduleRender();
  toast("换了一组取样与排布");
});

$("#worldShuffleBtn").addEventListener("click", () => {
  if (!state.analysis) return;
  ensureWorld(true);
  fillTextFields();
  updateStyleUI();
  scheduleRender({ immediate: true });
  updateMeta();
  toast("换了一个第二世界");
});

$("#archiveShuffleBtn").addEventListener("click", () => {
  if (!state.analysis) return;
  ensureArchive(true);
  fillTextFields();
  updateStyleUI();
  scheduleRender({ immediate: true });
  updateMeta();
  toast("换了一页记忆");
});

$("#libraryBtn").addEventListener("click", openLibrary);
$("#downloadBtn").addEventListener("click", download);
$("#stageDownloadBtn").addEventListener("click", download);
$("#promptBtn").addEventListener("click", copyPrompt);
$("#resetBtn").addEventListener("click", reset);
$("#helpBtn").addEventListener("click", () => $("#helpDialog").showModal());

document.querySelectorAll("dialog [data-close]").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const dialog = btn.closest("dialog");
    if (dialog?.open) dialog.close();
  });
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && dialog.open) dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (renderDeferred) {
      renderDeferred = false;
      scheduleRender({ immediate: true });
    }
  });
});

const bindText = (id, key) => {
  const el = $(id);
  el.addEventListener("input", () => {
    state.text[key] = el.value;
    if (key === "title" && (state.style === "healing" || state.style === "memory-archive")) {
      state.titles[state.style] = el.value;
    }
    clearTimeout(inputTimer);
    inputTimer = setTimeout(scheduleRender, 140);
  });
};
bindText("#titleInput", "title");
bindText("#subtitleInput", "subtitle");
bindText("#captionInput", "caption");
bindText("#placeInput", "place");
bindText("#dateInput", "date");

document.querySelectorAll("[data-style]").forEach((btn) => {
  btn.addEventListener("click", () => applyStyle(btn.dataset.style));
});

// drag & drop anywhere on the stage
const dropFrame = $("#dropFrame");
["dragenter", "dragover"].forEach((ev) => {
  document.addEventListener(ev, (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dropFrame?.classList.add("drag");
  });
});
["dragleave", "drop"].forEach((ev) => {
  document.addEventListener(ev, (e) => {
    if (ev === "dragleave" && e.relatedTarget) return;
    dropFrame?.classList.remove("drag");
  });
});
document.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  e.preventDefault();
  handleFile(file);
});

document.addEventListener("paste", (e) => {
  const items = [...(e.clipboardData?.items || [])];
  const item = items.find((i) => i.type.startsWith("image/"));
  if (item) {
    e.preventDefault();
    handleFile(item.getAsFile());
  }
});

// initial UI
canvas.classList.add("is-empty");
buildPaperControl();
buildInkControl();

window.__shiguang = { state, handleFile, scheduleRender, renderPoster };

const demo = new URLSearchParams(location.search).get("demo");
if (demo) {
  fetch(demo)
    .then((r) => {
      if (!r.ok) throw new Error("demo not found");
      return r.blob();
    })
    .then((blob) => {
      const ext = blob.type.split("/")[1] || "jpg";
      handleFile(new File([blob], `demo.${ext}`, { type: blob.type }));
    })
    .catch(() => {});
}

if (new URLSearchParams(location.search).has("debug")) {
  const timer = setInterval(() => {
    if (!state.analysis) return;
    clearInterval(timer);
    const pre = document.createElement("pre");
    pre.id = "debugOut";
    pre.style.display = "none";
    pre.textContent = JSON.stringify(
      {
        orientation: state.analysis.orientation,
        tags: state.analysis.tags,
        scene: state.analysis.sceneLabel,
        time: state.analysis.timeOfDay,
        stats: state.analysis.stats,
        palette: state.analysis.palette.map((p) => ({ hex: p.hex, w: +p.weight.toFixed(3), h: Math.round(p.h) })),
        regions: state.analysis.regions.map((r) => ({
          area: +r.area.toFixed(3),
          aspect: +r.aspect.toFixed(2),
          h: Math.round(r.h),
          s: +r.s.toFixed(2),
          v: +r.v.toFixed(2),
          cx: +r.cx.toFixed(2),
          cy: +r.cy.toFixed(2),
          salience: +r.salience.toFixed(2),
          candidates: r.candidates.map((c) => [c.key, +c.score.toFixed(2)]),
        })),
        symbols: state.symbols.map((s) => [s.key, +s.weight.toFixed(2)]),
      },
      null,
      1
    );
    document.body.appendChild(pre);
  }, 300);
}
