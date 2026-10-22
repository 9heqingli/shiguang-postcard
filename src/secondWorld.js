import { PAPERS } from "./analysis.js";
import { drawCropCover, inkText, paperTexture } from "./ink.js";
import { mulberry32 } from "./symbols.js";

export const SECOND_WORLD_SPEC = {
  w: 1500,
  h: 2000,
  photo: { x: 0, y: 0, w: 1500, h: 1400 },
  field: { x: 0, y: 1400, w: 1500, h: 600 },
  name: "第二世界 · 3:4",
};

const THEMES = {
  coast: {
    label: "借一条海平线",
    action: "hold",
    captions: [
      "I borrowed the horizon for the afternoon.",
      "The tide kept the sky on hold.",
      "The sea came home with me.",
    ],
  },
  water: {
    label: "借一片水",
    action: "pull",
    captions: [
      "I borrowed the pond for the afternoon.",
      "The water kept the sky for me.",
      "I taught the ripples to come closer.",
    ],
  },
  mountain: {
    label: "把山脊折进纸里",
    action: "climb",
    captions: [
      "The mountain took the long way down.",
      "I folded the ridge into the page.",
      "The peak came along quietly.",
    ],
  },
  green: {
    label: "把枝条牵回家",
    action: "hold",
    captions: [
      "The leaves kept a little wind.",
      "I brought the branch indoors.",
      "The garden followed me home.",
    ],
  },
  urban: {
    label: "让街道再走一会儿",
    action: "walk",
    captions: [
      "The street remembered our footsteps.",
      "I kept one corner of the city.",
      "The road came along for the walk.",
    ],
  },
  indoor: {
    label: "留下下午的一角",
    action: "reach",
    captions: [
      "The afternoon stayed for one more cup.",
      "The light found a seat.",
      "We saved the quiet part.",
    ],
  },
  food: {
    label: "把这一口留到以后",
    action: "reach",
    captions: [
      "We saved a little afternoon for later.",
      "The table kept the good part.",
      "One more bite, one more minute.",
    ],
  },
  portrait: {
    label: "借一点光",
    action: "hold",
    captions: [
      "The light came with us.",
      "We kept this little pause.",
      "The moment agreed to stay.",
    ],
  },
  night: {
    label: "给夜色留一盏灯",
    action: "switch",
    captions: [
      "The night left one light on.",
      "I borrowed a little moonlight.",
      "The dark made room for us.",
    ],
  },
  ordinary: {
    label: "打开一个平行小世界",
    action: "open",
    captions: [
      "The ordinary came back extraordinary.",
      "A small world opened here.",
      "The day left a door open.",
    ],
  },
};

function chooseTheme(tags = []) {
  if (tags.includes("coast")) return "coast";
  if (tags.includes("water")) return "water";
  if (tags.includes("mountain")) return "mountain";
  if (tags.includes("urban")) return "urban";
  if (tags.includes("food")) return "food";
  if (tags.includes("indoor")) return "indoor";
  if (tags.includes("green")) return "green";
  if (tags.includes("portrait")) return "portrait";
  if (tags.includes("night")) return "night";
  return "ordinary";
}

export function makeWorld(analysis, seed = 1) {
  const key = chooseTheme(analysis?.tags);
  const theme = THEMES[key];
  const rng = mulberry32((seed >>> 0) + key.length * 7919);
  const caption = theme.captions[Math.floor(rng() * theme.captions.length)];
  const side = rng() > 0.5 ? 1 : -1;
  const figureCount = analysis?.tags?.includes("portrait") ? (rng() > 0.7 ? 1 : 0) : rng() > 0.78 ? 2 : 1;
  return {
    key,
    label: theme.label,
    action: theme.action,
    caption,
    side,
    figureCount,
    seed: Math.floor(rng() * 1e9),
  };
}

function stroke(g, points, width, color, rng, alpha = 0.88) {
  if (points.length < 2) return;
  const jittered = points.map(([x, y]) => [x + (rng() - 0.5) * 2.4, y + (rng() - 0.5) * 2.4]);
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  g.lineWidth = width;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(jittered[0][0], jittered[0][1]);
  for (let i = 1; i < jittered.length - 1; i++) {
    const midX = (jittered[i][0] + jittered[i + 1][0]) / 2;
    const midY = (jittered[i][1] + jittered[i + 1][1]) / 2;
    g.quadraticCurveTo(jittered[i][0], jittered[i][1], midX, midY);
  }
  const last = jittered[jittered.length - 1];
  g.lineTo(last[0], last[1]);
  g.stroke();
  g.globalAlpha = alpha * 0.34;
  g.lineWidth = Math.max(1, width * 0.42);
  g.translate(0.9, -0.5);
  g.stroke();
  g.restore();
}

function drawFigure(g, x, baseY, height, action, rng, color, target) {
  const head = Math.max(8, height * 0.075);
  const headY = baseY - height + head;
  const shoulderY = headY + head * 1.8;
  const hipY = baseY - height * 0.34;
  const facing = target[0] >= x ? 1 : -1;

  g.save();
  g.strokeStyle = color;
  g.globalAlpha = 0.9;
  g.lineWidth = Math.max(2.4, height * 0.025);
  g.lineCap = "round";
  g.lineJoin = "round";

  g.beginPath();
  g.ellipse(x, headY, head * 0.82, head, -0.08 * facing, 0, Math.PI * 2);
  g.stroke();

  stroke(g, [[x, headY + head], [x + facing * 2, hipY]], 2.8, color, rng, 0.9);

  const shoulder = [x + facing * 1.5, shoulderY];
  const reachArm = [
    [shoulder[0], shoulder[1]],
    [shoulder[0] + facing * height * 0.13, shoulderY + height * 0.05],
    [target[0] - facing * 4, target[1]],
  ];
  stroke(g, reachArm, 2.7, color, rng, 0.92);

  if (action === "climb") {
    stroke(g, [shoulder, [x - facing * height * 0.11, shoulderY - height * 0.2]], 2.4, color, rng, 0.82);
  } else if (action === "walk") {
    stroke(g, [shoulder, [x - facing * height * 0.16, shoulderY + height * 0.18]], 2.4, color, rng, 0.82);
  } else {
    stroke(g, [shoulder, [x - facing * height * 0.12, shoulderY + height * 0.22]], 2.4, color, rng, 0.82);
  }

  const legSpread = action === "walk" ? height * 0.18 : height * 0.13;
  stroke(g, [[x, hipY], [x - legSpread, baseY]], 2.6, color, rng, 0.9);
  stroke(g, [[x, hipY], [x + legSpread * (action === "climb" ? 0.55 : 1), baseY]], 2.6, color, rng, 0.9);
  g.restore();
}

function drawWaterWorld(g, spec, world, rng, color) {
  const y0 = spec.photo.y + spec.photo.h - 24;
  const startX = spec.w * (0.34 + rng() * 0.32);
  const endX = startX + world.side * spec.w * 0.2;
  const endY = spec.photo.h + 260 + rng() * 120;
  for (let line = 0; line < 3; line++) {
    const points = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      points.push([
        startX + (endX - startX) * t + Math.sin(t * Math.PI * 2.8 + line) * (22 + line * 7),
        y0 + (endY - y0) * t + line * 16,
      ]);
    }
    stroke(g, points, line === 0 ? 4.2 : 2.7, color, rng, 0.64 - line * 0.11);
  }
  drawFigure(g, endX + world.side * 92, endY + 115, 132, "pull", rng, color, [endX, endY + 8]);
}

function drawMountainWorld(g, spec, world, rng, color) {
  const y0 = spec.photo.y + spec.photo.h - 18;
  const x0 = spec.w * (0.24 + rng() * 0.22);
  const ridge = [
    [x0, y0],
    [x0 + 110, y0 + 82],
    [x0 + 210, y0 + 34],
    [x0 + 320, y0 + 150],
    [x0 + 455, y0 + 92],
    [x0 + 535, y0 + 232],
  ];
  stroke(g, ridge, 4.2, color, rng, 0.72);
  stroke(g, ridge.map(([x, y]) => [x + world.side * 28, y + 18]), 2.2, color, rng, 0.35);
  const target = ridge[ridge.length - 1];
  drawFigure(g, target[0] + world.side * 36, target[1] + 104, 124, "climb", rng, color, [target[0], target[1]]);
}

function drawGreenWorld(g, spec, world, rng, color) {
  const y0 = spec.photo.y + spec.photo.h - 24;
  const x0 = spec.w * (0.3 + rng() * 0.35);
  const branch = [
    [x0, y0],
    [x0 + world.side * 18, y0 + 92],
    [x0 + world.side * 66, y0 + 170],
    [x0 + world.side * 48, y0 + 268],
    [x0 + world.side * 116, y0 + 348],
  ];
  stroke(g, branch, 4, color, rng, 0.76);
  stroke(g, [branch[2], [branch[2][0] + world.side * 72, branch[2][1] - 34]], 2.4, color, rng, 0.54);
  stroke(g, [branch[3], [branch[3][0] - world.side * 58, branch[3][1] - 22]], 2.4, color, rng, 0.5);
  const target = branch[branch.length - 1];
  drawFigure(g, target[0] + world.side * 78, target[1] + 78, 118, "hold", rng, color, target);
}

function drawUrbanWorld(g, spec, world, rng, color) {
  const y0 = spec.photo.y + spec.photo.h - 16;
  const x0 = spec.w * (0.28 + rng() * 0.26);
  const path = [
    [x0, y0],
    [x0 + world.side * 30, y0 + 100],
    [x0 + world.side * 74, y0 + 210],
    [x0 + world.side * 95, y0 + 330],
  ];
  stroke(g, path, 4.4, color, rng, 0.72);
  stroke(g, path.map(([x, y]) => [x + world.side * 85, y - 8]), 2.2, color, rng, 0.32);
  const target = path[path.length - 1];
  drawFigure(g, target[0] + world.side * 42, target[1] + 86, 122, "walk", rng, color, target);
}

function drawRoomWorld(g, spec, world, rng, color) {
  const y0 = spec.photo.y + spec.photo.h - 22;
  const x0 = spec.w * (0.18 + rng() * 0.24);
  const table = [
    [x0, y0],
    [x0 + 150, y0 + 38],
    [x0 + 330, y0 + 36],
    [x0 + 490, y0 + 92],
  ];
  stroke(g, table, 4.1, color, rng, 0.68);
  stroke(g, [[table[1][0], table[1][1]], [table[1][0] + 16, table[1][1] + 126]], 2.6, color, rng, 0.52);
  const target = table[table.length - 1];
  drawFigure(g, target[0] + world.side * 74, target[1] + 108, 120, "reach", rng, color, target);
}

function drawLightWorld(g, spec, world, rng, color, analysis) {
  const focusX = (analysis?.focus?.x ?? 0.5) * spec.w;
  const y0 = spec.photo.y + spec.photo.h - 30;
  const target = [focusX + world.side * (70 + rng() * 60), spec.photo.h + 210 + rng() * 80];
  stroke(g, [[focusX, y0], [target[0] - world.side * 36, target[1] - 90], target], 3.6, color, rng, 0.58);
  stroke(g, [[focusX + world.side * 22, y0 - 10], [target[0] - world.side * 92, target[1] - 46]], 2.1, color, rng, 0.27);
  drawFigure(g, target[0] + world.side * 56, target[1] + 108, 126, "hold", rng, color, target);
}

function drawNightWorld(g, spec, world, rng, color) {
  const y0 = spec.photo.y + spec.photo.h - 20;
  const x0 = spec.w * (0.24 + rng() * 0.28);
  const target = [x0 + world.side * 120, spec.photo.h + 240 + rng() * 72];
  stroke(g, [[x0, y0], [target[0] - world.side * 52, target[1] - 62], target], 3.8, color, rng, 0.66);
  stroke(g, [[target[0], target[1]], [target[0] + world.side * 36, target[1] - 18]], 2.2, color, rng, 0.44);
  drawFigure(g, target[0] + world.side * 74, target[1] + 108, 124, "switch", rng, color, target);
}

function drawOrdinaryWorld(g, spec, world, rng, color) {
  const y0 = spec.photo.y + spec.photo.h - 18;
  const x0 = spec.w * (0.3 + rng() * 0.26);
  const door = [
    [x0, y0],
    [x0 + world.side * 50, y0 + 60],
    [x0 + world.side * 64, y0 + 190],
    [x0 + world.side * 12, y0 + 278],
    [x0 - world.side * 12, y0 + 176],
    [x0 + world.side * 8, y0 + 46],
  ];
  stroke(g, door, 3.8, color, rng, 0.65);
  const target = door[2];
  drawFigure(g, target[0] + world.side * 84, target[1] + 118, 128, "open", rng, color, target);
}

function drawBleed(g, spec, analysis, seed) {
  const palette = analysis?.palette || [];
  const rng = mulberry32(seed + 43);
  for (let i = 0; i < Math.min(3, palette.length); i++) {
    const c = palette[i].rgb;
    const x = spec.w * (0.18 + rng() * 0.64);
    const y = spec.photo.h + 48 + rng() * 250;
    const r = 110 + rng() * 220;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.075)`);
    grad.addColorStop(0.55, `rgba(${c[0]},${c[1]},${c[2]},0.026)`);
    grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function renderSecondWorld(canvas, state, options = {}) {
  const { analysis, img } = state;
  if (!analysis || !img) return null;
  const spec = SECOND_WORLD_SPEC;
  const scale = options.scale ?? state.scale ?? 2;
  const paper = PAPERS[state.paper] || PAPERS.linen;
  const world = state.world || makeWorld(analysis, state.seed ?? 1);
  const seed = state.seed ?? 1;
  const rng = mulberry32((world.seed ?? seed) + 19);
  const color = "#292521";

  canvas.width = Math.round(spec.w * scale);
  canvas.height = Math.round(spec.h * scale);
  const g = canvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.scale(scale, scale);
  g.imageSmoothingQuality = "high";

  const paperY = spec.photo.h;
  const paperTextureCanvas = paperTexture(spec.w * scale, (spec.h - paperY) * scale, paper, seed);
  g.fillStyle = paper.base;
  g.fillRect(0, paperY, spec.w, spec.h - paperY);
  g.drawImage(paperTextureCanvas, 0, paperY, spec.w, spec.h - paperY);

  drawCropCover(g, img, spec.photo.x, spec.photo.y, spec.photo.w, spec.photo.h, analysis.focus || { x: 0.5, y: 0.35 });

  const dissolve = 210;
  const overlayHeight = spec.h - paperY + dissolve;
  const overlay = document.createElement("canvas");
  overlay.width = spec.w;
  overlay.height = Math.round(overlayHeight);
  const og = overlay.getContext("2d");
  const dissolveTexture = paperTexture(spec.w * scale, overlayHeight * scale, paper, seed);
  og.drawImage(dissolveTexture, 0, 0, spec.w, overlayHeight);
  og.globalCompositeOperation = "destination-in";
  const mask = og.createLinearGradient(0, 0, 0, overlayHeight);
  mask.addColorStop(0, "rgba(0,0,0,0)");
  mask.addColorStop(0.34, "rgba(0,0,0,0.24)");
  mask.addColorStop(0.66, "rgba(0,0,0,0.82)");
  mask.addColorStop(1, "rgba(0,0,0,1)");
  og.fillStyle = mask;
  og.fillRect(0, 0, overlay.width, overlay.height);
  g.drawImage(overlay, 0, paperY - dissolve, spec.w, overlayHeight);

  drawBleed(g, spec, analysis, world.seed ?? seed);

  const worldY = paperY - 16;
  if (world.key === "coast") {
    const focusX = (analysis.focus?.x ?? 0.5) * spec.w;
    const target = [focusX + world.side * 168, worldY + 230];
    stroke(g, [[focusX, worldY], [target[0] - world.side * 56, target[1] - 60], target], 4.2, color, rng, 0.62);
    drawFigure(g, target[0] + world.side * 78, target[1] + 112, 128, "hold", rng, color, target);
  } else if (world.key === "water") {
    drawWaterWorld(g, spec, world, rng, color);
  } else if (world.key === "mountain") {
    drawMountainWorld(g, spec, world, rng, color);
  } else if (world.key === "green") {
    drawGreenWorld(g, spec, world, rng, color);
  } else if (world.key === "urban") {
    drawUrbanWorld(g, spec, world, rng, color);
  } else if (world.key === "indoor" || world.key === "food") {
    drawRoomWorld(g, spec, world, rng, color);
  } else if (world.key === "portrait") {
    drawLightWorld(g, spec, world, rng, color, analysis);
  } else if (world.key === "night") {
    drawNightWorld(g, spec, world, rng, color);
  } else {
    drawOrdinaryWorld(g, spec, world, rng, color);
  }

  if (world.figureCount > 1) {
    const x = spec.w * (world.side > 0 ? 0.72 : 0.28);
    const y = paperY + 350;
    drawFigure(g, x, y, 92, "reach", rng, color, [x - world.side * 46, y - 56]);
  }

  const smallFont = `400 20px "SFMono-Regular", "Cascadia Mono", Consolas, monospace`;
  g.save();
  g.globalAlpha = 0.58;
  inkText(g, {
    text: "SECOND WORLD · 02",
    font: smallFont,
    size: 20,
    color,
    x: 92,
    y: paperY + 92,
    tracking: 1.2,
    seed: (world.seed ?? seed) + 3,
    scale,
  });
  g.restore();
  stroke(g, [[92, paperY + 112], [178, paperY + 112]], 1.5, color, rng, 0.36);

  const caption = (!state.text.caption || !state.text.caption.trim() ? world.caption : state.text.caption).trim();
  const captionSize = caption.length > 34 ? 41 : 46;
  const captionX = world.side > 0 ? spec.w * 0.08 : spec.w * 0.92;
  const captionY = paperY + 176 + (world.seed % 42);
  const captionAlign = world.side > 0 ? "left" : "right";
  g.save();
  g.translate(captionX, captionY);
  g.rotate((world.side > 0 ? -1 : 1) * (1.1 + (world.seed % 9) / 10) * (Math.PI / 180));
  inkText(g, {
    text: caption,
    font: `400 ${captionSize}px "Segoe Print", "Bradley Hand", "Kaiti SC", KaiTi, cursive`,
    size: captionSize,
    color,
    x: 0,
    y: 0,
    align: captionAlign,
    tracking: 0.2,
    seed: (world.seed ?? seed) + 17,
    scale,
    alpha: 0.94,
    baselineJitter: 1.1,
  });
  g.restore();

  const place = state.text.place || "";
  const date = state.text.date || "";
  if (place || date) {
    const meta = [place, date].filter(Boolean).join("  /  ");
    inkText(g, {
      text: meta,
      font: smallFont,
      size: 18,
      color,
      x: spec.w - 96,
      y: spec.h - 82,
      align: "right",
      tracking: 0.4,
      seed: (world.seed ?? seed) + 31,
      scale,
      alpha: 0.52,
    });
  }

  return {
    spec,
    world,
    scale,
    width: canvas.width,
    height: canvas.height,
    displaySize: `${spec.w} × ${spec.h}`,
  };
}
