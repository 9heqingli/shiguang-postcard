// Hand-drawn pictogram library. Every symbol is authored in a 100 x 100 field.
// The ink rasteriser in ink.js composites these white marks with a silkscreen
// texture, so shapes stay deliberately imperfect rather than polished vectors.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

export class Pen {
  constructor(ctx, rng) {
    this.ctx = ctx;
    this.rng = rng;
    this.ctx.lineJoin = "round";
    this.ctx.lineCap = "round";
  }

  _jitter(amount) {
    return (this.rng() * 2 - 1) * amount;
  }

  _densify(points, amp = 0.7) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      out.push([p[0] + this._jitter(amp), p[1] + this._jitter(amp)]);
      if (i < points.length - 1) {
        const q = points[i + 1];
        const t = 0.34 + this.rng() * 0.32;
        out.push([
          p[0] + (q[0] - p[0]) * t + this._jitter(amp * 1.2),
          p[1] + (q[1] - p[1]) * t + this._jitter(amp * 1.2),
        ]);
        const t2 = 0.67;
        out.push([
          p[0] + (q[0] - p[0]) * t2 + this._jitter(amp * 1.2),
          p[1] + (q[1] - p[1]) * t2 + this._jitter(amp * 1.2),
        ]);
      }
    }
    return out;
  }

  _path(points, smooth = true) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    if (!smooth) {
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      return;
    }
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i][0] + points[i + 1][0]) / 2;
      const my = (points[i][1] + points[i + 1][1]) / 2;
      ctx.quadraticCurveTo(points[i][0], points[i][1], mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1]);
  }

  line(points, width = 5, opts = {}) {
    const ctx = this.ctx;
    const jittered = this._densify(points, opts.amp ?? 0.85);
    ctx.save();
    ctx.lineCap = opts.cap || "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.lineWidth = width;
    this._path(jittered, opts.smooth !== false);
    ctx.stroke();
    // secondary pressure pass gives the stroke an uneven inked edge
    ctx.globalAlpha = (opts.alpha ?? 1) * 0.5;
    ctx.lineWidth = Math.max(0.9, width * 0.42);
    ctx.translate(this._jitter(0.5), this._jitter(0.5));
    this._path(jittered, opts.smooth !== false);
    ctx.stroke();
    ctx.restore();
  }

  shape(points, opts = {}) {
    const ctx = this.ctx;
    const amp = opts.amp ?? 0.9;
    const dense = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const q = points[(i + 1) % points.length];
      dense.push([p[0] + this._jitter(amp), p[1] + this._jitter(amp)]);
      const t = 0.35 + this.rng() * 0.3;
      dense.push([
        p[0] + (q[0] - p[0]) * t + this._jitter(amp * 1.1),
        p[1] + (q[1] - p[1]) * t + this._jitter(amp * 1.1),
      ]);
    }
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.beginPath();
    ctx.moveTo(dense[0][0], dense[0][1]);
    for (let i = 1; i < dense.length; i++) {
      const prev = dense[i - 1];
      const cur = dense[i];
      ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ellipse(cx, cy, rx, ry, opts = {}) {
    const n = opts.n ?? 18;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const wob = 1 + this._jitter(opts.rough ?? 0.045);
      pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
    }
    if (opts.fill === false) this.line([...pts, pts[0]], opts.w ?? 4, { smooth: true, amp: 0.4 });
    else this.shape(pts, { amp: opts.amp ?? 0.5 });
  }

  circle(cx, cy, r, opts = {}) {
    this.ellipse(cx, cy, r, r, opts);
  }

  ring(cx, cy, r, width = 4, opts = {}) {
    const n = 22;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const wob = 1 + this._jitter(0.03);
      pts.push([cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * wob]);
    }
    pts.push(pts[0]);
    this.line(pts, width, { smooth: true, amp: 0.35 });
  }

  arc(cx, cy, r, a0, a1, width = 4) {
    const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * 12));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const wob = 1 + this._jitter(0.02);
      pts.push([cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * wob]);
    }
    this.line(pts, width, { amp: 0.35 });
  }

  rect(x, y, w, h, opts = {}) {
    const pts = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    if (opts.fill === false) this.line([...pts, pts[0]], opts.w ?? 4, { smooth: false, amp: 0.5 });
    else this.shape(pts, { amp: opts.amp ?? 0.6 });
  }

  erase() {
    this.ctx.save();
    this.ctx.globalCompositeOperation = "destination-out";
    this.ctx.fillStyle = "#000";
    this.ctx.strokeStyle = "#000";
    return this;
  }

  ink() {
    this.ctx.restore();
    return this;
  }

  cutCircle(cx, cy, r, rx = r) {
    this.erase();
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, r, 0, 0, TAU);
    this.ctx.fill();
    this.ink();
  }

  cutRect(x, y, w, h) {
    this.erase();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.fill();
    this.ink();
  }

  cutLine(points, width = 2.4) {
    this.erase();
    this.ctx.lineCap = "round";
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i][0], points[i][1]);
    this.ctx.stroke();
    this.ink();
  }
}

// ---------------------------------------------------------------------------
// Symbol definitions
// ---------------------------------------------------------------------------

const D = {};

D.tree = (p) => {
  p.line([[50, 60], [49, 91]], 6.2);
  p.line([[50, 71], [40, 64]], 3.4);
  p.line([[50, 78], [59, 71]], 3.2);
  p.ellipse(36, 45, 16, 15);
  p.ellipse(55, 36, 18, 17);
  p.ellipse(62, 52, 14, 13);
  p.ellipse(45, 54, 15, 13);
  p.cutLine([[35, 53], [42, 50], [48, 53], [55, 50], [63, 54]], 2.4);
  p.cutCircle(49, 38, 1.5);
  p.cutCircle(56, 47, 1.1);
  p.arc(36, 45, 15, 2.6, 4.1, 2.2);
  p.arc(55, 36, 17, -0.4, 1.1, 2.1);
};

D.pine = (p) => {
  p.line([[50, 58], [50, 92]], 5.6);
  p.shape([[50, 10], [28, 42], [72, 42]]);
  p.shape([[50, 29], [22, 61], [78, 61]]);
  p.shape([[50, 48], [17, 76], [83, 76]]);
  p.cutLine([[30, 50], [70, 50]], 1.8);
  p.cutLine([[25, 68], [75, 68]], 1.8);
};

D.leaf = (p) => {
  p.line([[50, 92], [49, 52]], 3.8);
  p.shape([[50, 10], [69, 31], [68, 49], [50, 58], [32, 49], [31, 31]]);
  p.line([[50, 16], [50, 55]], 2.4);
  p.line([[50, 33], [61, 25]], 1.9);
  p.line([[50, 43], [39, 35]], 1.9);
};

D.plantPot = (p) => {
  p.line([[50, 62], [44, 34]], 3.2);
  p.line([[50, 62], [58, 26]], 3.2);
  p.line([[50, 62], [37, 45]], 2.9);
  p.line([[50, 62], [64, 48]], 2.9);
  p.ellipse(44, 32, 7, 5.5);
  p.ellipse(58, 24, 7, 5.5);
  p.ellipse(36, 44, 7.5, 5.5);
  p.ellipse(64, 47, 7, 5);
  p.shape([[32, 66], [68, 66], [64, 92], [36, 92]]);
  p.rect(29, 60, 42, 8);
  p.cutLine([[38, 74], [62, 74]], 2.2);
};

D.flower = (p) => {
  p.line([[50, 92], [50, 47]], 3.4);
  p.line([[50, 72], [41, 65]], 2.6);
  p.ellipse(41, 62, 6, 4);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * TAU;
    p.ellipse(50 + Math.cos(a) * 11, 34 + Math.sin(a) * 11, 8.5, 7.2);
  }
  p.cutCircle(50, 34, 4.6);
  p.circle(50, 34, 2.4);
};

D.grass = (p) => {
  p.line([[18, 90], [21, 48], [15, 38]], 3.2);
  p.line([[28, 91], [31, 58], [36, 46]], 3.4);
  p.line([[40, 92], [40, 52], [44, 39]], 3.6);
  p.line([[50, 92], [51, 40], [55, 30]], 3.8);
  p.line([[61, 92], [61, 55], [57, 45]], 3.2);
  p.line([[71, 91], [69, 60], [74, 48]], 3.2);
  p.line([[81, 90], [80, 52], [85, 42]], 3.4);
  p.line([[10, 91], [92, 91]], 3, { amp: 0.6 });
};

D.mountain = (p) => {
  p.shape([[6, 88], [36, 39], [52, 68], [62, 52], [94, 88]]);
  p.line([[36, 39], [44, 54], [49, 47], [52, 68]], 2.2);
  p.cutLine([[30, 50], [39, 57], [45, 52]], 2.2);
  p.line([[6, 88], [94, 88]], 2.6, { amp: 0.5 });
};

D.wave = (p) => {
  const wave = (y, amp, w) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const x = 4 + (i / 16) * 92;
      pts.push([x, y + Math.sin((i / 16) * Math.PI * 2.15) * amp]);
    }
    p.line(pts, w, { amp: 0.6 });
  };
  wave(36, 11, 7);
  wave(58, 12, 7);
  wave(80, 10, 7);
  p.arc(88, 30, 9, -1.2, 2.4, 5.4);
};

D.sun = (p) => {
  p.circle(50, 50, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.12;
    p.line(
      [
        [50 + Math.cos(a) * 24, 50 + Math.sin(a) * 24],
        [50 + Math.cos(a) * 35, 50 + Math.sin(a) * 35],
      ],
      3.6
    );
  }
};

D.moon = (p) => {
  p.circle(46, 50, 26);
  p.cutCircle(59, 42, 24);
};

D.cloud = (p) => {
  p.ellipse(34, 52, 15, 13);
  p.ellipse(50, 43, 19, 16);
  p.ellipse(66, 52, 14, 12);
  p.rect(33, 50, 34, 15);
  p.line([[20, 70], [78, 70]], 2.6);
};

D.bird = (p) => {
  p.line([[12, 62], [30, 43], [50, 56], [70, 41], [88, 60]], 5.6, { amp: 1.1 });
  p.ellipse(50, 56, 5.6, 3.6);
  p.line([[50, 59], [46, 68]], 2.6);
  p.line([[53, 59], [58, 67]], 2.6);
};

D.person = (p) => {
  p.circle(50, 15, 8.6);
  p.shape([[41, 27], [59, 27], [63, 56], [55, 58], [54, 89], [48, 89], [47, 58], [38, 56]]);
  p.line([[41, 33], [32, 52]], 4);
  p.line([[59, 33], [68, 48]], 4);
};

D.twoPeople = (p) => {
  const fig = (x, y, s) => {
    p.circle(x, y + 12 * s, 6.6 * s);
    p.shape([
      [x - 7 * s, y + 21 * s],
      [x + 7 * s, y + 21 * s],
      [x + 9 * s, y + 44 * s],
      [x + 3 * s, y + 45 * s],
      [x + 2 * s, y + 66 * s],
      [x - 3 * s, y + 66 * s],
      [x - 4 * s, y + 45 * s],
      [x - 9 * s, y + 44 * s],
    ]);
  };
  fig(36, 18, 0.92);
  fig(64, 24, 0.86);
};

D.cup = (p) => {
  p.shape([[31, 40], [67, 40], [63, 72], [35, 72]]);
  p.arc(68, 53, 10, -1.4, 1.4, 5);
  p.line([[25, 79], [76, 79]], 4.4);
  p.line([[43, 31], [41, 22], [44, 14]], 2.4);
  p.line([[53, 31], [55, 22], [52, 13]], 2.2);
  p.cutLine([[36, 49], [62, 49]], 2.2);
};

D.teapot = (p) => {
  p.circle(48, 56, 21);
  p.line([[39, 37], [57, 37]], 4);
  p.circle(48, 32, 4.2);
  p.line([[68, 49], [83, 41], [88, 46]], 5.4);
  p.arc(27, 55, 14, 1.4, 5.1, 4.2);
  p.line([[32, 80], [64, 80]], 4.2);
  p.cutLine([[36, 53], [60, 53]], 2.4);
};

D.bowl = (p) => {
  p.shape([[20, 48], [80, 48], [72, 76], [60, 83], [40, 83], [28, 76]]);
  p.line([[16, 47], [84, 47]], 5.4);
  p.line([[38, 38], [54, 10]], 2.6);
  p.line([[48, 38], [66, 12]], 2.6);
};

D.chair = (p) => {
  p.rect(27, 16, 7, 52);
  p.rect(62, 24, 7, 44);
  p.rect(27, 55, 42, 6);
  p.line([[31, 63], [29, 92]], 3.6);
  p.line([[64, 63], [66, 92]], 3.6);
  p.line([[46, 62], [45, 91]], 3.2);
};

D.table = (p) => {
  p.rect(12, 39, 76, 7);
  p.line([[22, 47], [24, 90]], 4.6);
  p.line([[78, 47], [76, 90]], 4.6);
  p.line([[24, 72], [76, 72]], 2.4);
};

D.window = (p) => {
  p.rect(24, 12, 52, 70, { fill: false, w: 5.4 });
  p.line([[50, 12], [50, 82]], 3.6);
  p.line([[24, 44], [76, 44]], 3.6);
  p.line([[17, 84], [83, 84]], 4.6);
  p.line([[20, 10], [24, 12]], 2.4);
  p.line([[80, 10], [76, 12]], 2.4);
};

D.house = (p) => {
  p.shape([[16, 48], [50, 16], [84, 48]]);
  p.line([[24, 47], [24, 86]], 4.8);
  p.line([[76, 47], [76, 86]], 4.8);
  p.line([[20, 86], [80, 86]], 4.4);
  p.rect(42, 60, 16, 26);
  p.rect(31, 52, 10, 9);
  p.rect(62, 52, 7, 9);
};

D.boat = (p) => {
  p.shape([[14, 70], [84, 70], [72, 85], [27, 85]]);
  p.line([[50, 71], [50, 20]], 3.6);
  p.shape([[54, 25], [54, 64], [79, 64]]);
  p.line([[50, 20], [58, 24]], 2.6);
};

D.bike = (p) => {
  p.ring(25, 70, 14, 3.6);
  p.ring(75, 70, 14, 3.6);
  p.line([[25, 70], [42, 42], [62, 42], [75, 70]], 3.4);
  p.line([[42, 42], [50, 70], [25, 70]], 3.2);
  p.line([[58, 42], [62, 42]], 2.2);
  p.line([[58, 38], [67, 38]], 3.4);
  p.line([[62, 42], [60, 34]], 2.6);
  p.line([[75, 70], [70, 34]], 2.8);
  p.line([[65, 32], [76, 30]], 3.2);
};

D.lamp = (p) => {
  p.shape([[28, 20], [72, 20], [62, 46], [38, 46]]);
  p.line([[50, 46], [50, 84]], 4.2);
  p.rect(32, 84, 36, 6);
  p.line([[50, 52], [42, 58]], 1.8);
};

D.book = (p) => {
  p.shape([[10, 30], [48, 35], [48, 78], [11, 71]]);
  p.shape([[52, 35], [90, 30], [89, 71], [52, 78]]);
  p.line([[48, 34], [52, 35]], 2.2);
  for (let i = 0; i < 3; i++) {
    p.cutLine([[18, 44 + i * 8], [40, 46 + i * 8]], 1.8);
    p.cutLine([[60, 46 + i * 8], [82, 44 + i * 8]], 1.8);
  }
};

D.camera = (p) => {
  p.shape([[14, 33], [84, 33], [86, 78], [12, 78]]);
  p.rect(32, 24, 22, 11);
  p.cutCircle(50, 56, 14);
  p.circle(50, 56, 7.4);
  p.cutRect(66, 40, 9, 5);
};

D.bag = (p) => {
  p.shape([[26, 40], [74, 40], [70, 88], [30, 88]]);
  p.arc(38, 39, 13, Math.PI, TAU, 3.6);
  p.arc(63, 39, 13, Math.PI, TAU, 3.4);
  p.cutLine([[40, 52], [60, 52]], 2);
};

D.cat = (p) => {
  p.circle(46, 39, 13);
  p.shape([[34, 31], [36, 15], [46, 25]]);
  p.shape([[54, 25], [64, 15], [62, 32]]);
  p.ellipse(54, 65, 18, 23);
  p.line([[38, 78], [36, 92]], 4);
  p.line([[62, 82], [64, 92]], 4);
  p.line([[70, 74], [84, 64], [83, 48]], 5.2);
  p.cutCircle(41, 38, 1.6);
  p.cutCircle(51, 38, 1.6);
  p.line([[30, 43], [18, 40]], 1.5);
  p.line([[30, 47], [19, 49]], 1.5);
};

D.bottle = (p) => {
  p.rect(40, 14, 20, 7);
  p.rect(44, 21, 12, 18);
  p.shape([[36, 38], [64, 38], [67, 86], [33, 86]]);
  p.cutRect(39, 54, 22, 11);
  p.cutLine([[39, 76], [61, 76]], 1.8);
};

D.fruit = (p) => {
  p.shape([
    [50, 38], [64, 32], [78, 44], [81, 62], [70, 82], [56, 86], [50, 82],
    [44, 86], [30, 82], [19, 62], [22, 44], [36, 32],
  ]);
  p.line([[50, 38], [52, 24]], 3.4);
  p.ellipse(60, 22, 9, 5);
  p.line([[44, 48], [41, 62]], 2);
};

D.fish = (p) => {
  p.shape([[20, 50], [40, 32], [70, 37], [84, 50], [70, 63], [40, 68]]);
  p.shape([[20, 50], [6, 36], [10, 50], [6, 64]]);
  p.cutCircle(66, 47, 2.2);
  p.line([[40, 38], [46, 50], [40, 62]], 2.1);
};

D.umbrella = (p) => {
  const pts = [[10, 52]];
  for (let i = 0; i <= 8; i++) {
    const x = 10 + (i / 8) * 80;
    pts.push([x, 50 - Math.sin((i / 8) * Math.PI) * 32]);
  }
  pts.push([90, 52]);
  p.shape(pts);
  p.line([[50, 52], [50, 88], [57, 92], [62, 87]], 4);
  p.line([[50, 22], [50, 8]], 3);
};

D.fence = (p) => {
  const post = (x) => {
    p.rect(x, 30, 7, 58);
    p.shape([[x, 30], [x + 3.5, 19], [x + 7, 30]]);
  };
  post(16);
  post(45);
  post(74);
  p.rect(8, 42, 84, 6);
  p.rect(8, 62, 84, 6);
};

D.stairs = (p) => {
  p.line(
    [[12, 88], [36, 88], [36, 68], [58, 68], [58, 48], [78, 48], [78, 28], [90, 28]],
    8,
    { smooth: false }
  );
  p.line([[10, 94], [10, 82]], 3);
};

D.arch = (p) => {
  p.line([[26, 88], [26, 48]], 6);
  p.arc(50, 48, 24, Math.PI, TAU, 6);
  p.line([[74, 48], [74, 88]], 6);
  p.line([[16, 88], [84, 88]], 5);
  p.arc(50, 48, 16, Math.PI, TAU, 2.2);
  p.line([[34, 88], [34, 52]], 2);
  p.line([[66, 88], [66, 52]], 2);
};

D.stone = (p) => {
  p.shape([[18, 74], [24, 48], [40, 36], [62, 38], [78, 56], [82, 78], [58, 86], [32, 84]]);
  p.line([[34, 52], [46, 48], [54, 54]], 2.1);
  p.line([[52, 72], [64, 64]], 1.9);
};

// Abstract visual samples used when a region is geometry without a confident
// object reading. They are still derived from the photograph, never invented.

D.formRound = (p) => {
  p.ellipse(50, 50, 25, 24);
  p.ring(50, 50, 34, 2.2);
  p.cutCircle(58, 42, 5);
  p.ellipse(78, 74, 5, 4.6);
};

D.formColumn = (p) => {
  p.shape([[38, 16], [62, 22], [58, 82], [32, 86]]);
  p.line([[24, 30], [76, 34]], 2.4);
  p.line([[22, 70], [74, 66]], 2.2);
  p.ellipse(66, 54, 4, 4);
};

D.formArc = (p) => {
  p.arc(48, 62, 30, Math.PI * 1.1, Math.PI * 1.92, 7);
  p.arc(48, 62, 21, Math.PI * 1.14, Math.PI * 1.86, 2.4);
  p.circle(74, 34, 4.4);
  p.line([[16, 86], [52, 86]], 2.6);
};

D.formFan = (p) => {
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * 0.78 + (i / 4) * Math.PI * 0.56;
    p.line([[50, 78], [50 + Math.cos(a) * 36, 78 + Math.sin(a) * 36]], 3.2);
  }
  p.arc(50, 78, 36, -Math.PI * 0.78, -Math.PI * 0.22, 3.4);
};

export const SYMBOLS = {
  tree: { zh: "树", en: "single tree", aspect: 0.95, group: "nature", tags: ["green", "plant", "outdoor", "garden"] },
  pine: { zh: "松树", en: "pine tree", aspect: 0.74, group: "nature", tags: ["green", "plant", "forest", "cold"] },
  leaf: { zh: "叶子", en: "single leaf", aspect: 0.7, group: "nature", tags: ["green", "plant", "detail", "garden"] },
  plantPot: { zh: "盆栽", en: "potted plant", aspect: 0.86, group: "nature", tags: ["green", "plant", "indoor", "home"] },
  flower: { zh: "花", en: "single flower", aspect: 0.62, group: "nature", tags: ["flower", "garden", "plant", "soft"] },
  grass: { zh: "草", en: "clump of grass", aspect: 1.3, group: "nature", tags: ["green", "plant", "field", "outdoor"] },
  mountain: { zh: "山", en: "mountain ridge", aspect: 1.55, group: "place", tags: ["mountain", "outdoor", "travel", "cold"] },
  wave: { zh: "水波", en: "water wave", aspect: 1.62, group: "nature", tags: ["water", "sea", "blue", "travel"] },
  sun: { zh: "太阳", en: "sun", aspect: 1, group: "nature", tags: ["sun", "sky", "warm", "light"] },
  moon: { zh: "月亮", en: "crescent moon", aspect: 0.85, group: "nature", tags: ["night", "sky", "moon", "quiet"] },
  cloud: { zh: "云", en: "cloud", aspect: 1.42, group: "nature", tags: ["sky", "cloud", "outdoor", "soft"] },
  bird: { zh: "鸟", en: "flying bird", aspect: 1.5, group: "nature", tags: ["bird", "sky", "outdoor", "animal"] },
  person: { zh: "人", en: "single standing figure", aspect: 0.5, group: "figure", tags: ["person", "portrait", "travel", "street"] },
  twoPeople: { zh: "两个人", en: "two standing figures", aspect: 0.95, group: "figure", tags: ["person", "people", "portrait", "together"] },
  cup: { zh: "杯子", en: "cup with saucer", aspect: 1.0, group: "object", tags: ["cup", "coffee", "indoor", "table", "food"] },
  teapot: { zh: "茶壶", en: "teapot", aspect: 1.16, group: "object", tags: ["tea", "indoor", "table", "food"] },
  bowl: { zh: "碗", en: "bowl with chopsticks", aspect: 1.25, group: "object", tags: ["food", "indoor", "table", "meal"] },
  chair: { zh: "椅子", en: "chair", aspect: 0.72, group: "object", tags: ["chair", "indoor", "furniture", "home"] },
  table: { zh: "桌子", en: "table", aspect: 1.4, group: "object", tags: ["table", "indoor", "furniture", "home"] },
  window: { zh: "窗", en: "window", aspect: 0.86, group: "place", tags: ["window", "indoor", "light", "home", "architecture"] },
  house: { zh: "房子", en: "small house", aspect: 0.95, group: "place", tags: ["architecture", "house", "street", "travel"] },
  boat: { zh: "小船", en: "small sailboat", aspect: 1.15, group: "object", tags: ["boat", "water", "sea", "travel"] },
  bike: { zh: "自行车", en: "bicycle", aspect: 1.5, group: "object", tags: ["bike", "street", "travel", "city"] },
  lamp: { zh: "灯", en: "table lamp", aspect: 0.72, group: "object", tags: ["light", "indoor", "home", "warm"] },
  book: { zh: "书", en: "open book", aspect: 1.22, group: "object", tags: ["book", "indoor", "table", "quiet"] },
  camera: { zh: "相机", en: "camera", aspect: 1.38, group: "object", tags: ["camera", "travel", "detail", "memory"] },
  bag: { zh: "包", en: "tote bag", aspect: 0.86, group: "object", tags: ["bag", "travel", "street", "detail"] },
  cat: { zh: "猫", en: "sitting cat", aspect: 0.82, group: "animal", tags: ["cat", "animal", "home", "soft"] },
  bottle: { zh: "瓶子", en: "bottle", aspect: 0.48, group: "object", tags: ["bottle", "table", "indoor", "detail"] },
  fruit: { zh: "果子", en: "single fruit", aspect: 0.9, group: "object", tags: ["fruit", "food", "table", "warm"] },
  fish: { zh: "鱼", en: "fish", aspect: 1.5, group: "animal", tags: ["fish", "water", "food", "sea"] },
  umbrella: { zh: "伞", en: "umbrella", aspect: 0.95, group: "object", tags: ["rain", "street", "travel", "weather"] },
  fence: { zh: "栅栏", en: "fence", aspect: 1.65, group: "place", tags: ["fence", "garden", "street", "rural"] },
  stairs: { zh: "台阶", en: "steps", aspect: 1.2, group: "place", tags: ["stairs", "architecture", "city", "street"] },
  arch: { zh: "拱门", en: "arched doorway", aspect: 0.9, group: "place", tags: ["architecture", "door", "street", "travel"] },
  stone: { zh: "石头", en: "small stone", aspect: 1.05, group: "nature", tags: ["stone", "ground", "outdoor", "quiet"] },
  formRound: { zh: "圆形取样", en: "round visual sample", aspect: 1, group: "form", tags: ["abstract", "round"] },
  formColumn: { zh: "竖向取样", en: "columnar visual sample", aspect: 0.52, group: "form", tags: ["abstract", "vertical"] },
  formArc: { zh: "弧线取样", en: "arc visual sample", aspect: 1.2, group: "form", tags: ["abstract", "arc"] },
  formFan: { zh: "扇形取样", en: "fan visual sample", aspect: 1.1, group: "form", tags: ["abstract", "fan"] },
};

export const SYMBOL_KEYS = Object.keys(SYMBOLS);

export function drawSymbol(g, key, rng) {
  const def = D[key];
  if (!def) return;
  const pen = new Pen(g, rng);
  g.save();
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  def(pen, rng);
  g.restore();
}

export function symbolAspect(key) {
  return SYMBOLS[key]?.aspect ?? 1;
}
