import { mulberry32, SYMBOLS } from "./symbols.js";

export const PAPERS = {
  oatmeal: { key: "oatmeal", name: "燕麦纸", base: "#d8cebd" },
  linen: { key: "linen", name: "亚麻灰", base: "#cdc8bd" },
  kraft: { key: "kraft", name: "暖卡纸", base: "#c9b79c" },
  khaki: { key: "khaki", name: "浅卡其", base: "#c7c1ad" },
  clay: { key: "clay", name: "陶土米", base: "#d1bdab" },
};

export const PAPER_ORDER = ["oatmeal", "linen", "kraft", "khaki", "clay"];

function clamp(v, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hex(r, g, b) {
  const h = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张图片，请换一张试试。"));
    };
    img.src = url;
  });
}

function kmeans(pixels, k, seed) {
  const rng = mulberry32(seed);
  const centers = [];
  centers.push(pixels[Math.floor(rng() * pixels.length)].slice(0, 3));
  while (centers.length < k) {
    let best = null;
    let bestDist = -1;
    for (let t = 0; t < 80; t++) {
      const p = pixels[Math.floor(rng() * pixels.length)];
      let d = Infinity;
      for (const c of centers) {
        const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (dd < d) d = dd;
      }
      if (d > bestDist) {
        bestDist = d;
        best = p;
      }
    }
    centers.push(best.slice(0, 3));
  }

  const labels = new Uint8Array(pixels.length);
  for (let iter = 0; iter < 9; iter++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const cc = centers[c];
        const d = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      labels[i] = bi;
      const s = sums[bi];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centers[c][0] = sums[c][0] / sums[c][3];
        centers[c][1] = sums[c][1] / sums[c][3];
        centers[c][2] = sums[c][2] / sums[c][3];
      }
    }
  }
  return { centers, labels };
}

function sobel(luma, w, h) {
  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -luma[i - w - 1] - 2 * luma[i - 1] - luma[i + w - 1] +
        luma[i - w + 1] + 2 * luma[i + 1] + luma[i + w + 1];
      const gy =
        -luma[i - w - 1] - 2 * luma[i - w] - luma[i - w + 1] +
        luma[i + w - 1] + 2 * luma[i + w] + luma[i + w + 1];
      edge[i] = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 7.5);
    }
  }
  return edge;
}

function components(labels, w, h, bin) {
  const visited = new Uint8Array(w * h);
  const result = [];
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (visited[start] || labels[start] !== bin) continue;
    let count = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    let sx = 0;
    let sy = 0;
    visited[start] = 1;
    stack.push(start);
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % w;
      const y = (idx / w) | 0;
      count++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0) {
        const n = idx - 1;
        if (!visited[n] && labels[n] === bin) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (x < w - 1) {
        const n = idx + 1;
        if (!visited[n] && labels[n] === bin) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y > 0) {
        const n = idx - w;
        if (!visited[n] && labels[n] === bin) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y < h - 1) {
        const n = idx + w;
        if (!visited[n] && labels[n] === bin) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    result.push({ count, minX, maxX, minY, maxY, sx, sy });
  }
  return result;
}

function regionCandidates(region, stats) {
  const out = [];
  const { h, s, v, aspect, fill, cx, cy, edge, area, touchTop, touchBottom } = region;
  const push = (key, score) => out.push({ key, score });

  const isGreen = h > 65 && h < 175 && s > 0.1;
  const isBlue = h > 175 && h < 265 && s > 0.09;
  const isWarm = (h < 55 || h > 330) && s > 0.16;
  const isSkin = h > 5 && h < 42 && s > 0.15 && s < 0.66 && v > 0.32;
  const isNeutral = s < 0.14;

  if (isGreen) {
    if (aspect < 0.92 && area > 0.015) {
      push("tree", 0.95 + edge * 0.18);
      if (fill < 0.62) push("pine", 0.8);
    } else if (aspect < 1.45) {
      push("plantPot", 0.78);
      push("leaf", 0.72);
    } else {
      push("grass", 0.8);
      push("leaf", 0.62);
    }
    if (area < 0.04) push("leaf", 0.86);
  }

  if (isBlue) {
    if (cy < 0.42 || touchTop) {
      push("cloud", 0.78);
      if (area < 0.06) push("bird", 0.6);
    } else {
      push("wave", 0.9);
      if (fill > 0.55) push("fish", 0.5);
    }
  }

  if (isWarm && v > 0.42 && stats.warmRatio > 0.18 && stats.blueRatio < 0.35) {
    if (fill > 0.58 && aspect > 0.62 && aspect < 1.55 && area < 0.12) {
      push("cup", 0.86);
      push("fruit", 0.72);
      push("bowl", 0.66);
    } else if (aspect < 0.72) {
      push("bottle", 0.7);
      push("lamp", 0.66);
    }
  }

  if (isSkin && area < 0.3) {
    if (aspect > 1.35) push("twoPeople", 0.82);
    else push("person", 0.88);
  }

  if (isNeutral && stats.edge > 0.035 && area < 0.2) {
    if (aspect < 0.68 && area > 0.02) {
      push("window", 0.62);
      push("arch", 0.58);
    }
  }

  if (v < 0.22 && area > 0.06) {
    push("formColumn", 0.6);
  }
  // deep blue night sky
  if (stats.night && v < 0.4 && cy < 0.35) {
    push("moon", 0.7);
    push("lamp", 0.55);
  }

  if (touchBottom && area > 0.2 && stats.greenRatio > 0.15) {
    push("grass", 0.66);
  }

  return out;
}

export function analyzeImage(img) {
  const w = 128;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;

  const pixels = [];
  const luma = new Float32Array(w * h);
  const sats = new Float32Array(w * h);
  let sumL = 0;
  let sumS = 0;
  let sumWarm = 0;
  let green = 0;
  let blue = 0;
  let warm = 0;
  let skin = 0;
  let bright = 0;
  let dark = 0;
  let topBlue = 0;
  let bottomBlue = 0;
  let topGreen = 0;
  let bottomGreen = 0;
  let topBright = 0;
  const topCount = w * Math.round(h * 0.42);
  const bottomCount = topCount;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const gg = data[i + 1];
      const b = data[i + 2];
      const l = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
      luma[y * w + x] = l;
      sumL += l;
      const hsl = rgbToHsl(r, gg, b);
      sats[y * w + x] = hsl.s;
      sumS += hsl.s;
      sumWarm += (r - b) / 255;
      if (hsl.h > 65 && hsl.h < 175 && hsl.s > 0.13) green++;
      if (hsl.h > 175 && hsl.h < 265 && hsl.s > 0.1) blue++;
      if ((hsl.h < 55 || hsl.h > 330) && hsl.s > 0.18) warm++;
      if (hsl.h > 5 && hsl.h < 42 && hsl.s > 0.16 && hsl.s < 0.66 && l > 0.32) skin++;
      if (l > 0.82) bright++;
      if (l < 0.2) dark++;
      if (y < h * 0.42) {
        if (hsl.h > 175 && hsl.h < 265 && hsl.s > 0.1) topBlue++;
        if (hsl.h > 65 && hsl.h < 175 && hsl.s > 0.13) topGreen++;
        if (l > 0.7) topBright++;
      }
      if (y > h * 0.58) {
        if (hsl.h > 165 && hsl.h < 280 && hsl.s > 0.1) bottomBlue++;
        if (hsl.h > 65 && hsl.h < 175 && hsl.s > 0.13) bottomGreen++;
      }
      if ((x % 3 === 0 && y % 3 === 0) || x === w - 1) pixels.push([r, gg, b]);
    }
  }

  const brightness = sumL / (w * h);
  const saturation = sumS / (w * h);
  const warmth = sumWarm / (w * h);
  let variance = 0;
  for (let i = 0; i < luma.length; i++) variance += (luma[i] - brightness) ** 2;
  const contrast = Math.sqrt(variance / luma.length);

  const edge = sobel(luma, w, h);
  let edgeSum = 0;
  for (let i = 0; i < edge.length; i++) edgeSum += edge[i];
  const edgeDensity = edgeSum / edge.length;

  const { centers, labels } = kmeans(pixels, 6, 1187);

  // palette from the quantised centres, weighted by occurrence
  const counts = new Array(6).fill(0);
  for (let i = 0; i < labels.length; i++) counts[labels[i]]++;
  const totalPx = labels.length;
  const palette = centers
    .map((c, i) => {
      const hsl = rgbToHsl(c[0], c[1], c[2]);
      return {
        rgb: c.map((n) => Math.round(n)),
        hex: hex(c[0], c[1], c[2]),
        weight: counts[i] / totalPx,
        h: hsl.h,
        s: hsl.s,
        l: hsl.l,
      };
    })
    .filter((c) => c.weight > 0.008)
    .sort((a, b) => b.weight - a.weight);

  const stats = {
    brightness,
    saturation,
    warmth,
    contrast,
    edge: edgeDensity,
    greenRatio: green / (w * h),
    blueRatio: blue / (w * h),
    warmRatio: warm / (w * h),
    skinRatio: skin / (w * h),
    brightRatio: bright / (w * h),
    darkRatio: dark / (w * h),
    night: brightness < 0.3 || dark / (w * h) > 0.55,
    topBlue: topBlue / topCount,
    bottomBlue: bottomBlue / bottomCount,
    topGreen: topGreen / topCount,
    bottomGreen: bottomGreen / bottomCount,
    topBright: topBright / topCount,
  };

  // edge-weighted focal point
  let fx = 0;
  let fy = 0;
  let fw = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = edge[y * w + x];
      const dx = (x / (w - 1) - 0.5) * 0.9;
      const dy = (y / (h - 1) - 0.5) * 0.9;
      const central = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const wgt = e * (0.6 + central * 0.8) + 0.02;
      fx += (x / (w - 1)) * wgt;
      fy += (y / (h - 1)) * wgt;
      fw += wgt;
    }
  }
  const focus = { x: clamp(fx / fw, 0.22, 0.78), y: clamp(fy / fw, 0.22, 0.78) };

  // colour regions
  const regions = [];
  for (let bin = 0; bin < 6; bin++) {
    const comps = components(labels, w, h, bin).filter(
      (c) => c.count > w * h * 0.006 && c.count < w * h * 0.7
    );
    for (const c of comps) {
      const bw = c.maxX - c.minX + 1;
      const bh = c.maxY - c.minY + 1;
      if (bw < 6 || bh < 6) continue;
      const area = c.count / (w * h);
      const fill = c.count / (bw * bh);
      const cx = (c.sx / c.count) / (w - 1);
      const cy = (c.sy / c.count) / (h - 1);
      let eSum = 0;
      for (let y = c.minY; y <= c.maxY; y += 2) {
        for (let x = c.minX; x <= c.maxX; x += 2) {
          if (labels[y * w + x] === bin) eSum += edge[y * w + x];
        }
      }
      const eAvg = eSum / Math.max(1, (bw / 2) * (bh / 2));
      const col = centers[bin];
      const hsl = rgbToHsl(col[0], col[1], col[2]);
      const region = {
        x: c.minX / w,
        y: c.minY / h,
        w: bw / w,
        h: bh / h,
        cx,
        cy,
        area,
        fill,
        aspect: bw / bh,
        h: hsl.h,
        s: hsl.s,
        v: hsl.l,
        edge: eAvg,
        touchTop: c.minY <= 1,
        touchBottom: c.maxY >= h - 2,
      };
      const centrality = 1 - Math.min(1, Math.hypot(cx - 0.5, cy - 0.5) * 1.5);
      region.salience = clamp(
        eAvg * 2.4 + area * 1.6 + centrality * 0.32 - (area > 0.4 ? 0.55 : 0) - (fill > 0.9 ? 0.12 : 0)
      );
      region.candidates = regionCandidates(region, stats);
      regions.push(region);
    }
  }
  regions.sort((a, b) => b.salience - a.salience);

  // small bright desaturated blobs read as sun / moon highlights
  const highlight = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (luma[i] > 0.86 && sats[i] < 0.2) highlight[i] = 1;
  }
  const blobs = components(highlight, w, h, 1).filter((c) => {
    const area = c.count / (w * h);
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    return area > 0.0012 && area < 0.06 && bw / bh > 0.55 && bw / bh < 1.8;
  });
  for (const c of blobs) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const area = c.count / (w * h);
    const cx = c.sx / c.count / (w - 1);
    const cy = c.sy / c.count / (h - 1);
    regions.unshift({
      x: c.minX / w,
      y: c.minY / h,
      w: bw / w,
      h: bh / h,
      cx,
      cy,
      area,
      fill: c.count / (bw * bh),
      aspect: bw / bh,
      h: 40,
      s: 0.08,
      v: 0.95,
      edge: 0.1,
      salience: 0.8,
      touchTop: false,
      touchBottom: false,
      candidates: [{ key: stats.night ? "moon" : "sun", score: 0.98 }],
    });
  }

  // scene tags
  const tags = new Set();
  if (stats.greenRatio > 0.035) tags.add("green");
  if (stats.greenRatio > 0.24) tags.add("garden");
  if (stats.blueRatio > 0.16) tags.add("blue");
  if (stats.warmRatio > 0.22) tags.add("warm");
  if (stats.skinRatio > 0.035) tags.add("portrait");
  if (stats.night) tags.add("night");
  if (brightness > 0.66) tags.add("bright");
  if (saturation > 0.32) tags.add("vivid");
  const skyish = stats.topBlue > 0.16 || (stats.topBright > 0.45 && stats.topBlue > 0.06);
  const watery = stats.bottomBlue > 0.18 && stats.bottomBlue > stats.topBlue * 0.55;
  if (skyish) tags.add("sky");
  if (watery) tags.add("water");
  if (watery && skyish) tags.add("coast");
  if (brightness > 0.58 && stats.topBright > 0.2 && edgeDensity > 0.02 && stats.blueRatio < 0.35) tags.add("mountain");
  if (edgeDensity > 0.035 && stats.warmRatio > 0.2 && brightness < 0.62 && stats.blueRatio < 0.3) tags.add("indoor");
  if (edgeDensity > 0.05 && stats.greenRatio < 0.1 && stats.warmRatio > 0.12) tags.add("urban");
  if (stats.warmRatio > 0.3 && stats.saturation > 0.32 && brightness < 0.68) tags.add("food");

  const timeOfDay = stats.night ? "night" : brightness > 0.7 ? "morning" : warmth > 0.11 && brightness < 0.56 ? "dusk" : "afternoon";
  const sceneLabel = sceneName(tags, stats);
  const paper = choosePaper(tags, stats);

  return {
    width: img.width,
    height: img.height,
    ratio: img.width / img.height,
    orientation: img.width > img.height * 1.08 ? "landscape" : img.height > img.width * 1.08 ? "portrait" : "square",
    focus,
    palette,
    stats,
    tags: [...tags],
    timeOfDay,
    sceneLabel,
    paper,
    regions: regions.slice(0, 14),
  };
}

function sceneName(tags, stats) {
  if (tags.has("coast")) return "岸边 · 远水";
  if (tags.has("water")) return "水边";
  if (tags.has("green") && tags.has("sky")) return "有风的地方";
  if (tags.has("green")) return "绿意";
  if (tags.has("portrait")) return "人物";
  if (tags.has("food")) return "桌面";
  if (tags.has("indoor")) return "室内一角";
  if (tags.has("urban")) return "街角";
  if (stats.night) return "夜里";
  return "一段日常";
}

function choosePaper(tags, stats) {
  if (stats.warmth > 0.1) return "clay";
  if (tags.has("green")) return "khaki";
  if (tags.has("water") || tags.has("sky")) return "linen";
  if (stats.brightness > 0.62) return "oatmeal";
  return "kraft";
}

const SCENE_POOLS = {
  green: [
    ["tree", 0.92], ["leaf", 0.84], ["plantPot", 0.78], ["grass", 0.7], ["flower", 0.62], ["bird", 0.58],
  ],
  water: [
    ["wave", 0.95], ["boat", 0.8], ["fish", 0.66], ["stone", 0.62], ["bird", 0.62], ["sun", 0.56],
  ],
  sky: [
    ["cloud", 0.9], ["bird", 0.78], ["sun", 0.72], ["moon", 0.5],
  ],
  mountain: [
    ["mountain", 0.95], ["pine", 0.82], ["stone", 0.6], ["cloud", 0.55],
  ],
  indoor: [
    ["window", 0.86], ["cup", 0.84], ["table", 0.76], ["chair", 0.72], ["lamp", 0.68], ["book", 0.64], ["plantPot", 0.62],
  ],
  portrait: [
    ["person", 0.96], ["cup", 0.52], ["window", 0.5], ["cat", 0.44],
  ],
  urban: [
    ["window", 0.84], ["house", 0.78], ["arch", 0.72], ["bike", 0.68], ["stairs", 0.6], ["fence", 0.54],
  ],
  food: [
    ["cup", 0.92], ["bowl", 0.88], ["fruit", 0.78], ["bottle", 0.6], ["book", 0.4],
  ],
  night: [
    ["moon", 0.9], ["lamp", 0.84], ["window", 0.7], ["cat", 0.5],
  ],
};

export function pickSymbols(analysis, seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  const scores = new Map();
  const confidence = new Map();

  const bump = (key, score, conf = 0.5) => {
    if (!SYMBOLS[key]) return;
    if (!scores.has(key) || scores.get(key) < score) scores.set(key, score);
    confidence.set(key, Math.max(confidence.get(key) ?? 0, conf));
  };

  for (const region of analysis.regions) {
    const regionWeight = 0.3 + region.salience * 0.9;
    for (const cand of region.candidates) {
      bump(cand.key, cand.score * regionWeight, 0.85);
    }
  }

  const pools = new Set();
  if (analysis.tags.includes("green")) pools.add("green");
  if (analysis.tags.includes("water")) pools.add("water");
  if (analysis.tags.includes("sky")) pools.add("sky");
  if (analysis.tags.includes("coast")) pools.add("water");
  if (analysis.tags.includes("indoor")) pools.add("indoor");
  if (analysis.tags.includes("portrait")) pools.add("portrait");
  if (analysis.tags.includes("urban")) pools.add("urban");
  if (analysis.tags.includes("food")) pools.add("food");
  if (analysis.tags.includes("night")) pools.add("night");
  if (analysis.tags.includes("mountain")) pools.add("mountain");
  if (analysis.tags.includes("bright") && analysis.tags.includes("sky")) pools.add("sky");
  if (!pools.size) pools.add("indoor");

  for (const poolKey of pools) {
    const pool = SCENE_POOLS[poolKey] || [];
    for (const [key, base] of pool) {
      bump(key, base * 0.72 + rng() * 0.06, 0.45);
    }
  }

  // A bright frame with no readable objects still yields a couple of form
  // studies so the paper field never feels empty.
  const forms = ["formRound", "formColumn", "formArc", "formFan"];
  for (const key of forms) bump(key, 0.34 + rng() * 0.05, 0.25);

  const ranked = [...scores.entries()].sort((a, b) => {
    const sa = a[1] + (confidence.get(a[0]) >= 0.8 ? 0.14 : 0);
    const sb = b[1] + (confidence.get(b[0]) >= 0.8 ? 0.14 : 0);
    return sb - sa;
  });

  const CONFLICT = {
    tree: ["pine"],
    pine: ["tree"],
    leaf: ["flower"],
    flower: ["leaf"],
    wave: ["fish"],
    fish: ["wave"],
    sun: ["moon"],
    moon: ["sun"],
    person: ["twoPeople"],
    twoPeople: ["person"],
    cup: ["teapot"],
    teapot: ["cup"],
  };

  const chosen = [];
  const isForm = (key) => SYMBOLS[key]?.group === "form";
  const objectCount = () => chosen.filter((c) => !isForm(c.key)).length;
  for (const [key, score] of ranked) {
    const def = SYMBOLS[key];
    if (!def) continue;
    if (chosen.some((c) => c.key === key)) continue;
    if (isForm(key) && objectCount() >= 4) continue;
    if (CONFLICT[key]?.some((k) => chosen.some((c) => c.key === k))) continue;
    chosen.push({ key, score });
    if (chosen.length >= 5) break;
  }

  // ensure at least four samples, preferring scene-appropriate objects
  if (chosen.length < 4) {
    for (const [key, score] of ranked) {
      if (chosen.some((c) => c.key === key)) continue;
      if (CONFLICT[key]?.some((k) => chosen.some((c) => c.key === k))) continue;
      chosen.push({ key, score });
      if (chosen.length >= 4) break;
    }
  }

  const weights = [1, 0.8, 0.7, 0.62, 0.56, 0.5, 0.46, 0.42];
  return chosen.map((c, i) => ({
    key: c.key,
    seed: Math.floor(rng() * 1e9),
    weight: weights[i] ?? 0.55,
    confidence: confidence.get(c.key) ?? 0.4,
    primary: i === 0,
  }));
}

export function defaultCopy(analysis) {
  const titleByTime = {
    morning: "MORNING, SOFTLY",
    afternoon: "A QUIET MOMENT",
    dusk: "LIGHT, LEAVING",
    night: "AFTER HOURS",
  };
  const subByScene = {
    "岸边 · 远水": "风把水面翻成一页",
    "水边": "坐一会儿，听水",
    "有风的地方": "云走得很慢",
    "绿意": "把绿色留在纸上",
    "人物": "此刻，你在这里",
    "桌面": "日常的小小秩序",
    "室内一角": "光落在房间里",
    "街角": "路过的都算风景",
    "夜里": "让灯再亮一会儿",
    "一段日常": "把平常留成纪念",
  };
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const code = 40 + (analysis.palette.length * 7 + Math.round(analysis.stats.brightness * 40)) % 59;
  return {
    kicker: "POCKET ARCHIVE",
    title: titleByTime[analysis.timeOfDay] || "A QUIET MOMENT",
    subtitle: subByScene[analysis.sceneLabel] || "把平常留成纪念",
    place: "HERE / 此地",
    date,
    code: `NO. ${String(code).padStart(3, "0")}`,
  };
}
