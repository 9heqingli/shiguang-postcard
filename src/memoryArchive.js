import { PAPERS } from "./analysis.js";
import { inkText, measureText, paperTexture } from "./ink.js";
import { mulberry32 } from "./symbols.js";

const TITLES = {
  coast: ["SEA, HELD CLOSE", "A QUIET SHORE", "SALT AND LIGHT"],
  water: ["QUIET WATER", "A SMALL POND", "LIGHT ON WATER"],
  mountain: ["SLOW RIDGE", "A HIGH MOMENT", "SOFT HORIZON"],
  green: ["GREEN AFTERNOON", "A LEAF REMEMBERED", "WIND IN LEAVES"],
  urban: ["CITY, SOFTLY", "ONE STREET", "AFTER THE RAIN"],
  indoor: ["ROOM IN LIGHT", "A QUIET CORNER", "SUNDAY AT HOME"],
  food: ["TABLE FOR ONE", "A SMALL MEAL", "STILL WARM"],
  portrait: ["SOMEONE, HERE", "A GENTLE PAUSE", "YOU, THEN"],
  night: ["ONE LIGHT ON", "AFTER HOURS", "NIGHT, KEPT"],
  ordinary: ["SMALL PAUSE", "A DAY REMEMBERED", "JUST THIS"],
};

function chooseKey(tags = []) {
  if (tags.includes("coast")) return "coast";
  if (tags.includes("water")) return "water";
  if (tags.includes("mountain")) return "mountain";
  if (tags.includes("urban")) return "urban";
  if (tags.includes("indoor")) return "indoor";
  if (tags.includes("food")) return "food";
  if (tags.includes("green")) return "green";
  if (tags.includes("portrait")) return "portrait";
  if (tags.includes("night")) return "night";
  return "ordinary";
}

export function memoryArchiveSpec(analysis) {
  const ratio = analysis?.ratio || analysis?.width / analysis?.height || 1.5;
  const longEdge = 1200;
  if (ratio >= 0.95) {
    const w = longEdge;
    const h = Math.max(520, Math.round(longEdge / ratio));
    return {
      w,
      h: h * 2,
      photo: { x: 0, y: 0, w, h },
      field: { x: 0, y: h, w, h },
      name: ratio > 1.08 ? "记忆档案 · 上图下文" : "记忆档案 · 上下双联",
    };
  }
  const h = longEdge;
  const w = Math.max(520, Math.round(longEdge * ratio));
  return {
    w: w * 2,
    h,
    photo: { x: 0, y: 0, w, h },
    field: { x: w, y: 0, w, h },
    name: "记忆档案 · 左右双联",
  };
}

export function makeArchive(analysis, seed = 1) {
  const key = chooseKey(analysis?.tags);
  const rng = mulberry32((seed >>> 0) + key.length * 6151);
  const palette = [...(analysis?.palette || [])]
    .filter((entry) => Array.isArray(entry.rgb))
    .sort((a, b) => a.l - b.l)
    .slice(0, 3);
  const fallback = [
    { rgb: [196, 188, 174], l: 0.72 },
    { rgb: [138, 156, 150], l: 0.58 },
    { rgb: [78, 76, 70], l: 0.3 },
  ];
  while (palette.length < 3) palette.push(fallback[palette.length]);
  const titles = TITLES[key];
  return {
    key,
    title: titles[Math.floor(rng() * titles.length)],
    colors: palette.slice(0, 3),
    side: rng() > 0.5 ? 1 : -1,
    seed: Math.floor(rng() * 1e9),
  };
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function smoothShape(g, points, fill, stroke, alpha, rng) {
  const dense = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    dense.push([p[0] + (rng() - 0.5) * 7, p[1] + (rng() - 0.5) * 7]);
    const t = 0.42 + rng() * 0.18;
    dense.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
  }
  g.save();
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = alpha;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(dense[0][0], dense[0][1]);
  for (let i = 1; i < dense.length; i++) {
    const prev = dense[i - 1];
    const cur = dense[i];
    g.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
  }
  g.closePath();
  g.fill();
  if (stroke) {
    g.globalAlpha = alpha * 0.7;
    g.strokeStyle = stroke;
    g.lineWidth = 1.4;
    g.stroke();
  }
  g.restore();
}

function washBlob(g, cx, cy, rx, ry, rgb, rng, alpha = 0.16) {
  for (let pass = 0; pass < 3; pass++) {
    const points = [];
    const count = 18;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const wob = 0.88 + rng() * 0.2;
      points.push([
        cx + Math.cos(a) * rx * wob + (rng() - 0.5) * 12,
        cy + Math.sin(a) * ry * wob + (rng() - 0.5) * 10,
      ]);
    }
    const grad = g.createRadialGradient(
      cx - rx * 0.18,
      cy - ry * 0.22,
      Math.min(rx, ry) * 0.05,
      cx,
      cy,
      Math.max(rx, ry) * 1.08
    );
    grad.addColorStop(0, rgba(rgb, alpha * 1.45));
    grad.addColorStop(0.55, rgba(rgb, alpha * 0.82));
    grad.addColorStop(0.84, rgba(rgb, alpha * 0.3));
    grad.addColorStop(1, rgba(rgb, 0.01));
    smoothShape(g, points, grad, rgba(rgb, alpha * 0.76), 0.9 + pass * 0.03, rng);
  }
}

function washPolygon(g, cx, cy, width, height, rgb, rng, alpha = 0.17) {
  const points = [
    [cx - width * 0.48, cy + height * 0.16],
    [cx - width * 0.34, cy - height * 0.32],
    [cx + width * 0.05, cy - height * 0.5],
    [cx + width * 0.44, cy - height * 0.2],
    [cx + width * 0.5, cy + height * 0.25],
    [cx + width * 0.12, cy + height * 0.48],
    [cx - width * 0.26, cy + height * 0.42],
  ];
  for (let pass = 0; pass < 2; pass++) {
    const grad = g.createRadialGradient(
      cx - width * 0.12,
      cy - height * 0.16,
      Math.min(width, height) * 0.05,
      cx,
      cy,
      Math.max(width, height) * 0.64
    );
    grad.addColorStop(0, rgba(rgb, alpha * 1.35));
    grad.addColorStop(0.62, rgba(rgb, alpha * 0.72));
    grad.addColorStop(1, rgba(rgb, 0.01));
    smoothShape(
      g,
      points.map(([x, y]) => [x + (rng() - 0.5) * 18, y + (rng() - 0.5) * 14]),
      grad,
      rgba(rgb, alpha * 0.65),
      0.92,
      rng
    );
  }
}

function drawMotif(g, panel, archive, analysis, rng) {
  const [light, mid, dark] = archive.colors;
  const side = archive.side;
  const cx = panel.x + panel.w * (side > 0 ? 0.68 : 0.32);
  const cy = panel.y + panel.h * 0.54;
  const w = panel.w * 0.56;
  const h = panel.h * 0.62;
  const focusShift = ((analysis?.focus?.x ?? 0.5) - 0.5) * panel.w * 0.12;

  if (archive.key === "coast" || archive.key === "water") {
    washBlob(g, cx + focusShift, cy, w * 0.45, h * 0.22, mid.rgb, rng, 0.15);
    washBlob(g, cx + focusShift * 0.5, cy + h * 0.08, w * 0.38, h * 0.13, light.rgb, rng, 0.12);
    washPolygon(g, cx - w * 0.2, cy - h * 0.3, w * 0.48, h * 0.25, light.rgb, rng, 0.12);
    g.save();
    g.strokeStyle = rgba(dark.rgb, 0.24);
    g.lineWidth = 2;
    g.setLineDash([34, 18, 10, 22]);
    g.beginPath();
    g.moveTo(cx - w * 0.44, cy - h * 0.02);
    g.quadraticCurveTo(cx, cy - h * 0.08, cx + w * 0.42, cy - h * 0.02);
    g.stroke();
    g.restore();
  } else if (archive.key === "mountain") {
    washPolygon(g, cx - w * 0.12, cy - h * 0.08, w * 0.5, h * 0.52, mid.rgb, rng, 0.14);
    washPolygon(g, cx + w * 0.24, cy + h * 0.04, w * 0.34, h * 0.4, dark.rgb, rng, 0.09);
    washBlob(g, cx, cy - h * 0.3, w * 0.3, h * 0.12, light.rgb, rng, 0.1);
  } else if (archive.key === "green") {
    washBlob(g, cx, cy - h * 0.1, w * 0.36, h * 0.3, mid.rgb, rng, 0.15);
    washBlob(g, cx - w * 0.16, cy - h * 0.22, w * 0.18, h * 0.2, light.rgb, rng, 0.1);
    g.save();
    g.strokeStyle = rgba(dark.rgb, 0.22);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx, cy + h * 0.15);
    g.quadraticCurveTo(cx - w * 0.04, cy + h * 0.38, cx + w * 0.02, cy + h * 0.48);
    g.stroke();
    g.restore();
  } else if (archive.key === "urban" || archive.key === "indoor") {
    washPolygon(g, cx - w * 0.18, cy, w * 0.34, h * 0.52, light.rgb, rng, 0.11);
    washPolygon(g, cx + w * 0.22, cy + h * 0.06, w * 0.3, h * 0.44, dark.rgb, rng, 0.08);
    washBlob(g, cx + w * 0.03, cy + h * 0.14, w * 0.22, h * 0.13, mid.rgb, rng, 0.1);
  } else if (archive.key === "portrait") {
    washBlob(g, cx, cy - h * 0.14, w * 0.16, h * 0.2, light.rgb, rng, 0.12);
    washBlob(g, cx, cy + h * 0.16, w * 0.31, h * 0.2, mid.rgb, rng, 0.14);
    g.save();
    g.strokeStyle = rgba(dark.rgb, 0.19);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - w * 0.26, cy + h * 0.28);
    g.quadraticCurveTo(cx, cy + h * 0.04, cx + w * 0.26, cy + h * 0.28);
    g.stroke();
    g.restore();
  } else if (archive.key === "night") {
    washBlob(g, cx + w * 0.12, cy, w * 0.32, h * 0.3, dark.rgb, rng, 0.11);
    washBlob(g, cx - w * 0.22, cy - h * 0.12, w * 0.13, h * 0.16, light.rgb, rng, 0.13);
  } else if (archive.key === "food") {
    washBlob(g, cx, cy + h * 0.02, w * 0.34, h * 0.18, mid.rgb, rng, 0.12);
    washBlob(g, cx + w * 0.08, cy - h * 0.06, w * 0.16, h * 0.11, light.rgb, rng, 0.15);
    washBlob(g, cx - w * 0.18, cy + h * 0.11, w * 0.14, h * 0.08, dark.rgb, rng, 0.08);
  } else {
    washBlob(g, cx + focusShift, cy, w * 0.3, h * 0.26, light.rgb, rng, 0.13);
    washBlob(g, cx - w * 0.18, cy + h * 0.12, w * 0.2, h * 0.18, mid.rgb, rng, 0.1);
  }
}

function fitTitle(text, maxWidth) {
  let size = 56;
  while (size > 25) {
    const font = `400 ${size}px "Segoe Print", "Bradley Hand", "Kaiti SC", KaiTi, cursive`;
    if (measureText(font, text, 0.7) <= maxWidth) return { size, font };
    size -= 2;
  }
  return { size: 24, font: `400 24px "Segoe Print", "Bradley Hand", "Kaiti SC", KaiTi, cursive` };
}

function drawArchiveElements(g, panel, archive, title, seed) {
  const [light, mid, dark] = archive.colors;
  const textOnLeft = archive.side > 0;
  const baseX = panel.x + panel.w * (textOnLeft ? 0.08 : 0.55);
  const baseY = panel.y + panel.h * 0.18;
  const maxTitleWidth = panel.w * 0.35;
  const fitted = fitTitle(title, maxTitleWidth);
  const ink = "#393530";

  g.save();
  g.translate(baseX, baseY);
  g.rotate((textOnLeft ? -0.6 : 0.6) * (Math.PI / 180));
  inkText(g, {
    text: title,
    font: fitted.font,
    size: fitted.size,
    color: ink,
    x: 0,
    y: 0,
    tracking: 0.7,
    seed: archive.seed + 11,
    scale: 2,
    alpha: 0.8,
    baselineJitter: 1.2,
  });
  g.restore();

  const lineX = panel.x + panel.w * (textOnLeft ? 0.08 : 0.55);
  const lineTop = panel.y + panel.h * 0.52;
  const lineWidth = panel.w * 0.3;
  g.save();
  g.strokeStyle = rgba(dark.rgb, 0.22);
  g.lineWidth = 1.2;
  for (let line = 0; line < 3; line++) {
    const y = lineTop + line * Math.max(28, panel.h * 0.075);
    g.beginPath();
    g.moveTo(lineX, y);
    g.quadraticCurveTo(lineX + lineWidth * 0.52, y - 1.5, lineX + lineWidth, y + (line % 2 ? 1.2 : -0.8));
    g.stroke();
  }
  g.restore();

  const swatchY = lineTop + Math.max(28, panel.h * 0.075) * 3 + 22;
  const swatchX = lineX + 7;
  const swatches = [
    { color: dark, r: 19 },
    { color: mid, r: 23 },
    { color: light, r: 27 },
  ];
  let cursor = swatchX;
  for (const swatch of swatches) {
    washBlob(g, cursor + swatch.r, swatchY, swatch.r, swatch.r * 0.72, swatch.color.rgb, mulberry32(seed + cursor), 0.3);
    cursor += swatch.r * 2 + 12;
  }
}

export function renderMemoryArchive(canvas, state, options = {}) {
  const { analysis, img } = state;
  if (!analysis || !img) return null;
  const spec = memoryArchiveSpec(analysis);
  const scale = options.scale ?? state.scale ?? 2;
  const paper = PAPERS[state.paper] || PAPERS.oatmeal;
  const archive = state.archive || makeArchive(analysis, state.seed ?? 1);
  const seed = archive.seed ?? state.seed ?? 1;
  const panel = spec.field;
  const rng = mulberry32(seed + 37);

  canvas.width = Math.round(spec.w * scale);
  canvas.height = Math.round(spec.h * scale);
  const g = canvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.scale(scale, scale);
  g.imageSmoothingQuality = "high";

  // The original photo keeps its exact aspect ratio and all of its pixels.
  g.drawImage(img, spec.photo.x, spec.photo.y, spec.photo.w, spec.photo.h);

  const texture = paperTexture(panel.w * scale, panel.h * scale, paper, seed);
  g.drawImage(texture, panel.x, panel.y, panel.w, panel.h);

  const [light] = archive.colors;
  washBlob(g, panel.x + panel.w * 0.2, panel.y + panel.h * 0.12, panel.w * 0.28, panel.h * 0.14, light.rgb, rng, 0.05);
  drawMotif(g, panel, archive, analysis, rng);

  const title = (state.text.title || archive.title || "SMALL PAUSE").trim();
  drawArchiveElements(g, panel, archive, title, seed);

  return {
    spec,
    archive,
    scale,
    width: canvas.width,
    height: canvas.height,
    displaySize: `${spec.w} × ${spec.h}`,
  };
}
