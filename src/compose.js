import { PAPERS } from "./analysis.js";
import {
  drawCropCover,
  drawSymbolInk,
  inkText,
  measureText,
  paperTexture,
} from "./ink.js";
import { memoryArchiveSpec, renderMemoryArchive } from "./memoryArchive.js";
import { renderSecondWorld, SECOND_WORLD_SPEC } from "./secondWorld.js";
import { SYMBOLS, mulberry32, symbolAspect } from "./symbols.js";

const SPECS = {
  topLandscape: {
    w: 1600, h: 1200,
    photo: { x: 0, y: 0, w: 1600, h: 600 },
    field: { x: 0, y: 600, w: 1600, h: 600 },
    name: "上图下文",
  },
  leftLandscape: {
    w: 1600, h: 1200,
    photo: { x: 0, y: 0, w: 800, h: 1200 },
    field: { x: 800, y: 0, w: 800, h: 1200 },
    name: "左图右文",
  },
  topPortrait: {
    w: 1200, h: 1500,
    photo: { x: 0, y: 0, w: 1200, h: 750 },
    field: { x: 0, y: 750, w: 1200, h: 750 },
    name: "上图下文",
  },
  leftPortrait: {
    w: 1200, h: 1600,
    photo: { x: 0, y: 0, w: 600, h: 1600 },
    field: { x: 600, y: 0, w: 600, h: 1600 },
    name: "左图右文",
  },
  topSquare: {
    w: 1400, h: 1400,
    photo: { x: 0, y: 0, w: 1400, h: 700 },
    field: { x: 0, y: 700, w: 1400, h: 700 },
    name: "上图下文",
  },
  leftSquare: {
    w: 1400, h: 1400,
    photo: { x: 0, y: 0, w: 700, h: 1400 },
    field: { x: 700, y: 0, w: 700, h: 1400 },
    name: "左图右文",
  },
};

export function specFor(analysis, layout, style = "healing") {
  if (style === "second-world") return SECOND_WORLD_SPEC;
  if (style === "memory-archive") return memoryArchiveSpec(analysis);
  const o = analysis?.orientation ?? "landscape";
  if (layout === "left-right") {
    if (o === "portrait") return SPECS.leftPortrait;
    if (o === "square") return SPECS.leftSquare;
    return SPECS.leftLandscape;
  }
  if (o === "portrait") return SPECS.topPortrait;
  if (o === "square") return SPECS.topSquare;
  return SPECS.topLandscape;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function fontSerif(size) {
  return `600 ${size}px "Iowan Old Style", Georgia, "Times New Roman", "Songti SC", "STSong", "SimSun", serif`;
}

function fontMono(size) {
  return `400 ${size}px "SFMono-Regular", "Cascadia Mono", "Consolas", "Courier New", monospace`;
}

function wrapText(text, font, maxWidth, tracking = 0, maxLines = 3) {
  if (!text) return [];
  const spaceTokens = text.includes(" ");
  const tokens = spaceTokens ? text.split(/\s+/) : [...text];
  const lines = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current ? (spaceTokens ? `${current} ${token}` : current + token) : token;
    if (measureText(font, candidate, tracking) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = spaceTokens ? token : token;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

function drawRegistration(g, x, y, color, size = 7, alpha = 0.55) {
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = 1;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dx * size, y + dy * size);
    g.stroke();
  }
  g.restore();
}

function typeLayout(g, spec, text, ink, seed, scale) {
  const field = spec.field;
  const vertical = spec.field.h > spec.field.w * 1.3;
  const base = Math.min(field.w, field.h);
  const pad = clamp(Math.round(base * 0.07), 34, 52);
  const titleSize = clamp(Math.round(base * 0.075), 38, 56);
  const kickerSize = clamp(Math.round(base * 0.026), 14, 18);
  const subSize = clamp(Math.round(base * 0.034), 18, 24);
  const metaSize = clamp(Math.round(base * 0.031), 16, 20);
  const titleFont = fontSerif(titleSize);
  const kickerFont = fontMono(kickerSize);
  const subFont = fontSerif(subSize);
  const metaFont = fontMono(metaSize);

  const x0 = field.x + pad;
  const y0 = field.y + pad;
  const titleMax = field.w - pad * 2 - (vertical ? 10 : field.w * 0.16);
  const kicker = [text.kicker || "POCKET ARCHIVE", "拾光"].join(" · ");
  const kickerTrack = kickerSize * 0.2;
  inkText(g, {
    text: kicker, font: kickerFont, size: kickerSize, color: ink,
    x: x0, y: y0 + kickerSize, tracking: kickerTrack, seed: seed + 1, scale,
  });

  const titleY = y0 + kickerSize + titleSize * 1.24;
  const titleLines = wrapText(text.title || "", titleFont, titleMax, 0, 2);
  let yy = titleY;
  titleLines.forEach((line, i) => {
    inkText(g, {
      text: line, font: titleFont, size: titleSize, color: ink,
      x: x0, y: yy, tracking: titleSize * 0.04, seed: seed + 7 + i, scale,
    });
    yy += titleSize * 1.16;
  });

  if (text.subtitle) {
    const subLines = wrapText(text.subtitle, subFont, titleMax, 0, 2);
    subLines.forEach((line, i) => {
      inkText(g, {
        text: line, font: subFont, size: subSize, color: ink,
        x: x0, y: yy + subSize * 0.3, tracking: subSize * 0.02,
        seed: seed + 20 + i, scale, alpha: 0.9,
      });
      yy += subSize * 1.5;
    });
  }

  // broken rule under the label
  g.save();
  g.fillStyle = ink;
  g.globalAlpha = 0.75;
  g.fillRect(x0, yy + 6, 46, 1.4);
  g.fillRect(x0 + 56, yy + 6, 12, 1.4);
  g.restore();

  const rightX = field.x + field.w - pad;
  const bottomY = field.y + field.h - pad * 1.15;
  const footLines = [
    text.place || "HERE / 此地",
    text.date || "",
    text.code || "",
  ].filter(Boolean);
  let fy = bottomY - (footLines.length - 1) * metaSize * 1.6;
  footLines.forEach((line, i) => {
    inkText(g, {
      text: line, font: metaFont, size: metaSize, color: ink,
      x: rightX, y: fy, align: "right", tracking: metaSize * 0.12,
      seed: seed + 40 + i, scale, alpha: i === 0 ? 0.94 : 0.82,
    });
    fy += metaSize * 1.6;
  });

  g.save();
  g.fillStyle = ink;
  g.globalAlpha = 0.6;
  g.fillRect(rightX - 34, bottomY - footLines.length * metaSize * 1.6 - 10, 34, 1.1);
  g.restore();

  drawRegistration(g, field.x + pad - 12, field.y + field.h - pad + 4, ink, 6, 0.4);

  const labelW = Math.max(
    measureText(kickerFont, kicker, kickerTrack),
    ...titleLines.map((l) => measureText(titleFont, l, titleSize * 0.04)),
    120
  );
  const labelH = yy - y0 + 34;
  const zones = [
    { x: x0 - 18, y: y0 - 22, w: labelW + 36, h: labelH },
    { x: rightX - 300, y: bottomY - footLines.length * metaSize * 1.6 - 26, w: 316, h: footLines.length * metaSize * 1.6 + 40 },
  ];

  return { zones, vertical, pad, titleSize, metaSize };
}

function anchorsFor(spec, seed, count) {
  const vertical = spec.field.h > spec.field.w * 1.3;
  const base = vertical
    ? [
        [0.45, 0.44], [0.26, 0.23], [0.71, 0.3], [0.29, 0.61], [0.68, 0.69],
        [0.45, 0.82], [0.17, 0.73], [0.82, 0.5],
      ]
    : [
        [0.45, 0.52], [0.21, 0.44], [0.68, 0.32], [0.82, 0.58], [0.57, 0.75],
        [0.14, 0.68], [0.34, 0.83], [0.88, 0.41],
      ];
  return { anchors: base, family: vertical ? "diagonal" : "floating" };
}

function intersect(a, b, margin = 0) {
  return !(
    a.x + a.w + margin < b.x ||
    b.x + b.w + margin < a.x ||
    a.y + a.h + margin < b.y ||
    b.y + b.h + margin < a.y
  );
}

function layoutSymbols(spec, symbols, zones, seed) {
  const field = spec.field;
  const vertical = field.h > field.w * 1.3;
  const targetArea = field.w * field.h * 0.32;
  const weights = symbols.map((s) => s.weight ?? 0.6);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const { anchors, family } = anchorsFor(spec, seed, symbols.length);
  const rng = mulberry32(seed + 99);
  const placed = [];

  symbols.forEach((symbol, i) => {
    const aspect = symbolAspect(symbol.key);
    const area = (targetArea * weights[i]) / totalWeight;
    let w = Math.sqrt(area * aspect);
    let h = w / aspect;
    const maxW = field.w * (vertical ? 0.36 : 0.3);
    const maxH = field.h * (vertical ? 0.24 : 0.4);
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }

    const anchor = anchors[i] || [0.5, 0.5];
    let best = null;
    for (let attempt = 0; attempt < 46; attempt++) {
      const shrink = attempt > 28 ? 0.88 : attempt > 14 ? 0.94 : 1;
      const ww = w * shrink;
      const hh = h * shrink;
      const cx = field.x + clamp(anchor[0] + (rng() - 0.5) * (vertical ? 0.16 : 0.09), 0.1, 0.9) * field.w;
      const cy = field.y + clamp(anchor[1] + (rng() - 0.5) * (vertical ? 0.08 : 0.14), 0.1, 0.9) * field.h;
      const box = { x: cx - ww / 2, y: cy - hh / 2, w: ww, h: hh };
      if (box.x < field.x + 16 || box.y < field.y + 16) continue;
      if (box.x + box.w > field.x + field.w - 16) continue;
      if (box.y + box.h > field.y + field.h - 16) continue;
      if (zones.some((z) => intersect(box, z, 8))) continue;
      if (placed.some((p) => intersect(box, p.box, vertical ? 20 : 26))) continue;
      best = { ...box, rotate: (rng() - 0.5) * 7, shrink };
      break;
    }
    if (!best) {
      const ww = w * 0.72;
      const hh = h * 0.72;
      best = {
        x: field.x + anchor[0] * field.w - ww / 2,
        y: field.y + anchor[1] * field.h - hh / 2,
        w: ww,
        h: hh,
        rotate: (rng() - 0.5) * 5,
        shrink: 0.8,
      };
    }
    placed.push({ symbol, box: best, index: i });
  });

  return { placed, family };
}

export function renderPoster(canvas, state, options = {}) {
  const { analysis, img } = state;
  if (!analysis || !img) return null;
  if (state.style === "second-world") return renderSecondWorld(canvas, state, options);
  if (state.style === "memory-archive") return renderMemoryArchive(canvas, state, options);
  const spec = specFor(analysis, state.layout, state.style);
  const scale = options.scale ?? state.scale ?? 2;
  const dpr = 1;
  canvas.width = Math.round(spec.w * scale * dpr);
  canvas.height = Math.round(spec.h * scale * dpr);
  const g = canvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.scale(scale * dpr, scale * dpr);
  g.imageSmoothingQuality = "high";

  const paper = PAPERS[state.paper] || PAPERS.oatmeal;

  // photo half, kept photographic
  drawCropCover(
    g, img,
    spec.photo.x, spec.photo.y, spec.photo.w, spec.photo.h,
    analysis.focus || { x: 0.5, y: 0.5 }
  );

  // paper half
  const field = spec.field;
  const texture = paperTexture(
    field.w * scale,
    field.h * scale,
    paper,
    state.seed ?? 1
  );
  g.drawImage(texture, field.x, field.y, field.w, field.h);

  // keep the photographic edge crisp: hairline on the paper side only
  g.save();
  g.strokeStyle = "rgba(60, 48, 36, 0.16)";
  g.lineWidth = 1;
  g.beginPath();
  if (field.y > 0) {
    g.moveTo(field.x, field.y + 0.5);
    g.lineTo(field.x + field.w, field.y + 0.5);
  } else {
    g.moveTo(field.x + 0.5, field.y);
    g.lineTo(field.x + 0.5, field.y + field.h);
  }
  g.stroke();
  g.restore();

  const type = typeLayout(g, spec, state.text, state.ink, state.seed ?? 1, scale);

  const { placed, family } = layoutSymbols(spec, state.symbols, type.zones, state.seed ?? 1);
  for (const item of placed) {
    drawSymbolInk(
      g,
      item.symbol.key,
      { ...item.box, rotate: item.box.rotate },
      item.symbol.seed ?? item.index + 17,
      scale,
      0.97
    );
  }

  return {
    spec,
    family,
    scale,
    width: canvas.width,
    height: canvas.height,
    displaySize: `${spec.w} × ${spec.h}`,
  };
}

export function symbolEnglishList(symbols) {
  return symbols.map((s) => SYMBOLS[s.key]?.en).filter(Boolean);
}
