import { mulberry32, drawSymbol, symbolAspect } from "./symbols.js";

const TAU = Math.PI * 2;
const spriteCache = new Map();
const paperCache = new Map();
const textCache = new Map();

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 69069) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function applyInkTexture(g, seed, strength = 1) {
  const { width: w, height: h } = g.canvas;
  const img = g.getImageData(0, 0, w, h);
  const data = img.data;
  const rng = mulberry32(seed);
  const coarseFreq = 0.055 / Math.max(0.6, strength);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      const a = data[i];
      if (a === 0) continue;
      const coarse = valueNoise(x * coarseFreq, y * coarseFreq, seed);
      const fine = valueNoise(x * 0.62, y * 0.62, seed + 11);
      const blotch = valueNoise(x * 0.012, y * 0.012, seed + 29);
      let alpha = a / 255;

      // silkscreen misses: clusters of ink that never transferred
      let loss = 0;
      if (coarse > 0.72) loss += (coarse - 0.72) * 1.7 * strength;
      if (blotch > 0.76) loss += (blotch - 0.76) * 1.1 * strength;
      if (fine > 0.8) loss += (fine - 0.8) * 0.7 * strength;
      if (rng() < 0.008 * strength) loss += 0.35 + rng() * 0.5;

      // ragged edge: semi-transparent antialiased pixels break up more
      if (a < 210 && rng() < 0.22 * strength) loss += 0.3 + rng() * 0.4;

      alpha *= Math.max(0.05, 1 - Math.min(0.92, loss));
      alpha *= 0.93 + fine * 0.07;
      data[i] = Math.max(0, Math.min(255, alpha * 255));
    }
  }
  g.putImageData(img, 0, 0);
}

/**
 * Rasterise a pictogram into a white-ink sprite with silkscreen texture.
 * Returns a canvas sized `width x height` CSS pixels at `scale` device pixels.
 */
export function symbolSprite(key, width, height, seed, scale = 2) {
  const cw = Math.max(12, Math.round(width * scale));
  const ch = Math.max(12, Math.round(height * scale));
  const cacheKey = `${key}|${cw}|${ch}|${seed}`;
  const hit = spriteCache.get(cacheKey);
  if (hit) return hit;

  const off = document.createElement("canvas");
  off.width = cw;
  off.height = ch;
  const g = off.getContext("2d", { willReadFrequently: true });
  g.save();
  g.scale(cw / 100, ch / 100);
  drawSymbol(g, key, mulberry32(seed));
  g.restore();
  applyInkTexture(g, seed, 0.85);

  if (spriteCache.size > 240) {
    const first = spriteCache.keys().next().value;
    spriteCache.delete(first);
  }
  spriteCache.set(cacheKey, off);
  return off;
}

export function drawSymbolInk(g, key, box, seed, scale, alpha = 1) {
  const aspect = symbolAspect(key);
  let w = box.w;
  let h = box.h;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;

  const sprite = symbolSprite(key, w, h, seed, scale);
  g.save();
  g.globalAlpha = alpha;
  if (box.rotate) {
    g.translate(x + w / 2, y + h / 2);
    g.rotate((box.rotate * Math.PI) / 180);
    g.drawImage(sprite, -w / 2, -h / 2, w, h);
  } else {
    g.drawImage(sprite, x, y, w, h);
  }
  g.restore();
}

/**
 * Draws text glyph by glyph, then roughens the raster so it reads as
 * uneven letterpress ink instead of a flat digital overlay.
 */
export function inkText(g, opts) {
  const {
    text,
    font,
    size,
    color,
    x,
    y,
    align = "left",
    tracking = 0,
    seed = 7,
    scale = 2,
    alpha = 1,
    baselineJitter = 0.6,
  } = opts;
  if (!text) return 0;

  const meter = getMeter();
  meter.font = font;
  const chars = [...text];
  const widths = chars.map((c) => meter.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  const pad = Math.ceil(size * 0.42);
  const baseY = pad + size * 1.18;
  const cacheKey = [text, font, size, color, tracking, seed, scale, baselineJitter].join("|");
  let off = textCache.get(cacheKey);
  if (!off) {
    const w = Math.ceil(total + pad * 2);
    const h = Math.ceil(size * 1.8 + pad * 2);
    off = document.createElement("canvas");
    off.width = Math.max(2, Math.round(w * scale));
    off.height = Math.max(2, Math.round(h * scale));
    const og = off.getContext("2d", { willReadFrequently: true });
    const rng = mulberry32(seed);

    og.scale(scale, scale);
    og.font = font;
    og.fillStyle = color;
    og.textBaseline = "alphabetic";
    og.textAlign = "left";

    let cursor = pad;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const jx = (rng() - 0.5) * 0.3;
      const jy = (rng() - 0.5) * baselineJitter * 2;
      const a = 0.9 + rng() * 0.1;
      og.save();
      og.globalAlpha = a;
      og.translate(cursor + jx, baseY + jy);
      og.rotate((rng() - 0.5) * 0.006);
      og.fillText(ch, 0, 0);
      og.restore();
      cursor += widths[i] + tracking;
    }

    og.setTransform(1, 0, 0, 1, 0, 0);
    applyTextTexture(og, seed);
    if (textCache.size > 240) {
      textCache.delete(textCache.keys().next().value);
    }
    textCache.set(cacheKey, off);
  }

  const x0 = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(off, Math.round(x0 - pad), Math.round(y - baseY), off.width / scale, off.height / scale);
  g.restore();
  return total;
}

function applyTextTexture(g, seed) {
  const { width: w, height: h } = g.canvas;
  const img = g.getImageData(0, 0, w, h);
  const data = img.data;
  const rng = mulberry32(seed + 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      const a = data[i];
      if (a === 0) continue;
      const coarse = valueNoise(x * 0.05, y * 0.07, seed + 5);
      const fine = valueNoise(x * 0.9, y * 0.9, seed + 9);
      let alpha = a / 255;
      if (coarse > 0.8) alpha *= 0.45 + (coarse - 0.8) * 2.2;
      if (fine > 0.9 && rng() < 0.3) alpha *= 0.55;
      if (rng() < 0.004) alpha *= 0.2;
      alpha *= 0.9 + fine * 0.1;
      data[i] = Math.max(0, Math.min(255, alpha * 255));
      // tiny tone variation across all channels so non-red inks keep their hue
      const shift = (coarse - 0.5) * 10;
      for (let c = 1; c <= 3; c++) {
        data[i - c] = Math.max(0, Math.min(255, data[i - c] + shift));
      }
    }
  }
  g.putImageData(img, 0, 0);
}

let meterCanvas = null;
function getMeter() {
  if (!meterCanvas) meterCanvas = document.createElement("canvas");
  return meterCanvas.getContext("2d");
}

export function measureText(font, text, tracking = 0) {
  const m = getMeter();
  m.font = font;
  const chars = [...text];
  let w = 0;
  for (const c of chars) w += m.measureText(c).width;
  return w + tracking * Math.max(0, chars.length - 1);
}

function noiseTile(seed, size = 192, strength = 0.5) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const g = tile.getContext("2d");
  const img = g.createImageData(size, size);
  const rng = mulberry32(seed);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (rng() - 0.5) * 255 * strength;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tile;
}

/** Warm, low-saturation cotton paper with mottling, fibres and fine grain. */
export function paperTexture(w, h, paper, seed) {
  const cacheKey = `${w}x${h}|${paper.base}|${seed}`;
  const hit = paperCache.get(cacheKey);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const g = canvas.getContext("2d");
  const rng = mulberry32(seed);

  g.fillStyle = paper.base;
  g.fillRect(0, 0, w, h);

  // soft large-scale cloudiness
  for (let i = 0; i < 26; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = (0.1 + rng() * 0.3) * Math.max(w, h);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    const light = rng() > 0.45;
    grad.addColorStop(0, light ? "rgba(255,251,242,0.055)" : "rgba(94,80,63,0.045)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // cotton-linen fibres
  const fibreCount = Math.round((w * h) / 26000);
  for (let i = 0; i < fibreCount; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 3 + rng() * 16;
    const horizontal = rng() > 0.32;
    g.strokeStyle = rng() > 0.5 ? "rgba(255,252,244,0.07)" : "rgba(92,78,60,0.05)";
    g.lineWidth = 0.6 + rng() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    if (horizontal) g.lineTo(x + len, y + (rng() - 0.5) * 1.6);
    else g.lineTo(x + (rng() - 0.5) * 1.6, y + len);
    g.stroke();
  }

  // fine recycled-paper grain
  const tile = noiseTile(seed + 2, 192, 0.55);
  const pattern = g.createPattern(tile, "repeat");
  g.save();
  g.globalCompositeOperation = "multiply";
  g.globalAlpha = 0.075;
  g.fillStyle = pattern;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "screen";
  g.globalAlpha = 0.05;
  g.fillStyle = pattern;
  g.translate(37, 61);
  g.fillRect(0, 0, w, h);
  g.restore();

  // faint edge darkening, like paper sitting on a table
  const edge = g.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, "rgba(70,58,44,0.035)");
  edge.addColorStop(0.12, "rgba(70,58,44,0)");
  edge.addColorStop(0.88, "rgba(70,58,44,0)");
  edge.addColorStop(1, "rgba(70,58,44,0.04)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);

  if (paperCache.size > 12) {
    const first = paperCache.keys().next().value;
    paperCache.delete(first);
  }
  paperCache.set(cacheKey, canvas);
  return canvas;
}

export function drawCropCover(g, img, dx, dy, dw, dh, focus = { x: 0.5, y: 0.5 }) {
  const iw = img.width;
  const ih = img.height;
  const targetRatio = dw / dh;
  const srcRatio = iw / ih;
  let sw, sh, sx, sy;
  if (srcRatio > targetRatio) {
    sh = ih;
    sw = ih * targetRatio;
    sx = Math.min(iw - sw, Math.max(0, focus.x * iw - sw / 2));
    sy = 0;
  } else {
    sw = iw;
    sh = iw / targetRatio;
    sx = 0;
    sy = Math.min(ih - sh, Math.max(0, focus.y * ih - sh / 2));
  }
  g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function seededShuffle(list, seed) {
  const rng = mulberry32(seed);
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export { TAU };
