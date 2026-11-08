'use strict';
// Philips South engineers video. Every frame is a pure function of time:
// renderAt(t) sets the whole stage for second t, so the recorder can step frame by frame.
(async function () {
  const W = 1920, H = 1080;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  const E = {
    outCubic: (t) => 1 - (1 - t) ** 3,
    inCubic: (t) => t * t * t,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
    outQuint: (t) => 1 - (1 - t) ** 5,
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  };
  // fade-in at a (over fi seconds), fade-out ending at b (over fo seconds)
  const env = (t, a, b, fi = 0.6, fo = 0.5) => Math.min(E.outCubic(seg(t, a, a + fi)), 1 - E.inCubic(seg(t, b - fo, b)));
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  function tf(e, x = 0, y = 0, s = 1, o = 1, r = 0) {
    e.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${s.toFixed(4)})${r ? ` rotate(${r.toFixed(2)}deg)` : ''}`;
    e.style.opacity = o.toFixed(3);
  }
  // Slide/fade an element in at a and out at b. Returns its visibility 0..1.
  function rv(e, t, a, b, o = {}) {
    const { dx = 0, dy = 36, ds = 0, din = 0.7, dout = 0.45, ox = 0, oy = -24, os = 0, ease = E.outCubic } = o;
    const pi = ease(seg(t, a, a + din));
    const po = b == null ? 0 : E.inCubic(seg(t, b - dout, b));
    tf(e, dx * (1 - pi) + ox * po, dy * (1 - pi) + oy * po, 1 + ds * (1 - pi) + os * po, clamp(pi) * (1 - po));
    return clamp(pi) * (1 - po);
  }

  const cfg = await (await fetch('config.json', { cache: 'no-store' })).json();
  const S = cfg.scenes, CAM = cfg.cam, CUE = cfg.cues, D = cfg.data;
  const MOD = D.modalities, OFF = D.offices;
  const PHOTOS = D.photos || {};
  await Promise.all([400, 500, 600, 700, 800, 900].map((w) => document.fonts.load(`${w} 40px Pretendard`, '가나다라 ABC 123')));

  // ---------- icons ----------
  const svgo = (inner, sw = 6) => `<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICON = {
    xray: svgo('<path d="M80 25.4 A40 40 0 1 0 80 94.6"/><rect x="68" y="10" width="24" height="16" rx="3"/><rect x="66" y="93" width="30" height="10" rx="3"/><path d="M80 30 V88" stroke-dasharray="3 8" stroke-width="4"/><path d="M10 66 H110"/>'),
    ct: svgo('<circle cx="66" cy="54" r="42"/><circle cx="66" cy="54" r="17"/><path d="M44.4 18 A42 42 0 0 1 87.6 18" stroke-width="11" opacity=".55"/><path d="M6 54 H54"/><path d="M28 54 V102"/><path d="M14 102 H42"/>'),
    mr: svgo('<rect x="32" y="10" width="82" height="88" rx="20"/><circle cx="73" cy="54" r="21"/><path d="M46 24 V84 M100 24 V84" stroke-width="4" opacity=".6"/><path d="M6 54 H62"/><path d="M24 54 V104"/><path d="M10 104 H38"/>'),
    us: svgo('<path d="M50 12 H70 V48 L80 64 H40 L50 48 Z"/><path d="M60 12 C60 2 82 0 92 8"/><path d="M38 80 Q60 92 82 80"/><path d="M30 94 Q60 110 90 94" opacity=".7"/><path d="M24 108 Q60 124 96 108" opacity=".4"/>'),
  };
  const SIL = '<svg viewBox="0 0 100 100"><circle cx="50" cy="38" r="19" fill="rgba(255,255,255,.93)"/><path d="M12 100 C14 72 30 62 50 62 C70 62 86 72 88 100 Z" fill="rgba(255,255,255,.93)"/></svg>';
  const PINSVG = '<svg viewBox="0 0 24 24"><path d="M12 2C7.6 2 4 5.5 4 9.9 4 15.5 12 22 12 22s8-6.5 8-12.1C20 5.5 16.4 2 12 2z" fill="#45A6FF"/><circle cx="12" cy="10" r="3.2" fill="#fff"/></svg>';
  const avatar = (name, color, size) => `<div class="av" style="width:${size}px;height:${size}px;--c:${color}">${PHOTOS[name] ? `<img src="${PHOTOS[name]}">` : SIL}</div>`;
  const chip = (mod, n) => `<span class="chip" style="--c:${MOD[mod].color}"><i></i>${MOD[mod].name}${n != null ? ` <b>${n}</b>` : ''}</span>`;
  const officeCount = (o) => o.teams.reduce((s, tm) => s + tm.members.length, 0);
  const NDJ = officeCount(OFF.dj), NGJ = officeCount(OFF.gj), NALL = NDJ + NGJ;

  const scenesRoot = $('#scenes');
  const scenes = [];
  function addScene(range, html, update) {
    const root = el(html);
    scenesRoot.appendChild(root);
    scenes.push({ a: range[0], b: range[1], root, update });
    return root;
  }

  // ---------- map ----------
  const proj = (lat, lon) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return { x: ((lon + 180) / 360) * 256, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 };
  };
  const P_DJ = proj(OFF.dj.lat, OFF.dj.lon), P_GJ = proj(OFF.gj.lat, OFF.gj.lon);
  const P_KR = proj(36.15, 125.55);
  const P_MID = { x: (P_DJ.x + P_GJ.x) / 2 - 0.004, y: (P_DJ.y + P_GJ.y) / 2 };
  const Z_OV0 = 7.15, Z_OV1 = 7.4, Z_LAND = 17.3, Z_HOLD = 17.5, Z_MID = 9.0;

  // Zoom from `from` to `to`, keeping the target sliding smoothly to screen centre.
  function fly(from, to, u) {
    const z = lerp(from.z, to.z, E.inOutCubic(u));
    const s0 = 2 ** from.z, s = 2 ** z;
    const k = 1 - E.inOutCubic(clamp(u * 1.18));
    return { x: to.x - ((to.x - from.x) * s0 * k) / s, y: to.y - ((to.y - from.y) * s0 * k) / s, z };
  }
  function cam(t) {
    const f1 = CAM.flyDJ, o1 = CAM.outDJ, f2 = CAM.flyGJ;
    if (t < f1[0]) return { ...P_KR, z: lerp(Z_OV0, Z_OV1, seg(t, S.overview[0], f1[0])) };
    if (t < f1[1]) return fly({ ...P_KR, z: Z_OV1 }, { ...P_DJ, z: Z_LAND }, seg(t, f1[0], f1[1]));
    if (t < o1[0]) return { ...P_DJ, z: lerp(Z_LAND, Z_HOLD, E.outCubic(seg(t, f1[1], f1[1] + 5))) };
    if (t < o1[1]) return fly({ ...P_MID, z: Z_MID }, { ...P_DJ, z: Z_HOLD }, 1 - seg(t, o1[0], o1[1]));
    if (t < f2[0]) return { ...P_MID, z: lerp(Z_MID, Z_MID + 0.12, seg(t, o1[1], f2[0])) };
    if (t < f2[1]) return fly({ ...P_MID, z: Z_MID + 0.12 }, { ...P_GJ, z: Z_LAND }, seg(t, f2[0], f2[1]));
    return { ...P_GJ, z: lerp(Z_LAND, Z_HOLD, E.outCubic(seg(t, f2[1], f2[1] + 5))) };
  }
  const mapOn = (t) => t >= 9.2 && t < 129.3;
  const mapAlpha = (t) => seg(t, 9.2, 10.4) * (1 - seg(t, 128, 129.2));
  function mapLook(t) {
    const k = Math.max(env(t, 22.0, 32.6, 1.0, 0.8), env(t, 42.2, 83.0, 1.0, 0.9), env(t, S.gjTitle[0] + 0.2, 999, 1.0, 1));
    return { b: k, d: 0.06 + 0.56 * k };
  }
  const toScreen = (p, c) => ({ x: (p.x - c.x) * 2 ** c.z + W / 2, y: (p.y - c.y) * 2 ** c.z + H / 2 });

  const MAP = (() => {
    const cv = $('#map'), ctx = cv.getContext('2d');
    const mid = document.createElement('canvas'); mid.width = 480; mid.height = 270;
    const mctx = mid.getContext('2d');
    const cache = new Map();
    function levelTiles(c, L, out) {
      const n = 2 ** L, sc = 2 ** (c.z - L);
      const cx = c.x * n, cy = c.y * n, hw = W / 2 / sc, hh = H / 2 / sc;
      const x0 = Math.floor((cx - hw) / 256), x1 = Math.floor((cx + hw) / 256);
      const y0 = Math.max(0, Math.floor((cy - hh) / 256)), y1 = Math.min(n - 1, Math.floor((cy + hh) / 256));
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++)
          out.push({ key: `${L}/${ty}/${(tx % n + n) % n}`, sx: (tx * 256 - cx) * sc + W / 2, sy: (ty * 256 - cy) * sc + H / 2, sz: 256 * sc });
    }
    function tiles(c) {
      const L = clamp(Math.floor(c.z + 0.5), 4, 18), out = [];
      levelTiles(c, L - 1, out);
      levelTiles(c, L, out);
      return out;
    }
    function get(k) {
      let e = cache.get(k);
      if (e) { cache.delete(k); cache.set(k, e); return e; }
      e = { img: new Image(), ok: false };
      e.p = new Promise((res) => { e.img.onload = () => { e.ok = true; res(); }; e.img.onerror = () => res(); });
      e.img.src = `assets/tiles/${k}.jpg`;
      cache.set(k, e);
      if (cache.size > 1600) cache.delete(cache.keys().next().value);
      return e;
    }
    const ensure = (c) => Promise.all(tiles(c).map((tl) => get(tl.key).p));
    let last = '';
    function draw(c, look) {
      const key = `${c.x.toFixed(7)},${c.y.toFixed(7)},${c.z.toFixed(4)},${look.b.toFixed(3)},${look.d.toFixed(3)}`;
      if (key === last) return;
      last = key;
      ctx.fillStyle = '#0b1a2c';
      ctx.fillRect(0, 0, W, H);
      for (const tl of tiles(c)) {
        const e = cache.get(tl.key);
        if (!e || !e.ok) continue;
        const x0 = Math.floor(tl.sx), y0 = Math.floor(tl.sy);
        ctx.drawImage(e.img, x0, y0, Math.ceil(tl.sx + tl.sz) - x0, Math.ceil(tl.sy + tl.sz) - y0);
      }
      if (look.b > 0.002) {
        mctx.filter = 'blur(6px)';
        mctx.drawImage(cv, -30, -17, 540, 304);
        mctx.filter = 'none';
        ctx.globalAlpha = look.b;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(mid, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = `rgba(4,12,30,${look.d.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    return { tiles, ensure, draw, el: cv };
  })();

  // clouds the camera falls through during each flight
  const CLOUD_SPR = [0, 1, 2, 3].map((k) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 400;
    const g = c.getContext('2d'), r = rng(100 + k);
    for (let i = 0; i < 46; i++) {
      const x = 320 + (r() - 0.5) * 440, sp = 1 - Math.abs(x - 320) / 300;
      const y = 200 + (r() - 0.5) * 170 * sp, rad = 40 + r() * 110 * (0.5 + sp * 0.5);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.24)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    }
    return c;
  });
  const genClouds = (seed) => { const r = rng(seed), a = []; for (let i = 0; i < 18; i++) a.push({ dx: (r() - 0.5) * 2300, dy: (r() - 0.5) * 1400, zi: 9.8 + r() * 2.8, spr: Math.floor(r() * 4), w: 760 + r() * 640 }); return a; };
  const CLOUDS = { dj: genClouds(7), gj: genClouds(23) };

  const fxc = $('#fx').getContext('2d');
  function drawFx(t, c, look) {
    fxc.clearRect(0, 0, W, H);
    const vis = mapAlpha(t) * (1 - look.b);
    if (vis <= 0.001) return;
    fxc.save();
    fxc.globalAlpha = vis;
    // clouds + haze
    const gate = smooth(9.3, 10.0, c.z);
    if (gate > 0) {
      const set = t < 87 ? CLOUDS.dj : CLOUDS.gj;
      for (const cl of set) {
        const k = 2 ** (c.z - cl.zi);
        const a = smooth(0.25, 0.75, k) * (1 - smooth(1.5, 3.4, k)) * gate;
        if (a <= 0.003) continue;
        const w = cl.w * k, h = w * 0.625;
        fxc.globalAlpha = vis * a * 0.78;
        fxc.drawImage(CLOUD_SPR[cl.spr], W / 2 + cl.dx * k - w / 2, H / 2 + cl.dy * k - h / 2, w, h);
      }
      const haze = 0.13 * Math.exp(-(((c.z - 11.1) / 1.25) ** 2)) * gate;
      fxc.globalAlpha = vis;
      fxc.fillStyle = `rgba(235,242,255,${haze.toFixed(3)})`;
      fxc.fillRect(0, 0, W, H);
    }
    // route between offices
    const ro = env(t, CUE.route[0] - 0.4, CAM.flyGJ[0] + 1.4, 0.5, 0.9);
    if (ro > 0) {
      const a = toScreen(P_DJ, c), b = toScreen(P_GJ, c);
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      const cx = (a.x + b.x) / 2 - (dy / len) * len * 0.16, cy = (a.y + b.y) / 2 + (dx / len) * len * 0.16;
      const p = E.inOutCubic(seg(t, CUE.route[0], CUE.route[1]));
      const pts = [];
      for (let i = 0; i <= 90; i++) {
        const u = (i / 90) * p;
        pts.push([(1 - u) ** 2 * a.x + 2 * (1 - u) * u * cx + u * u * b.x, (1 - u) ** 2 * a.y + 2 * (1 - u) * u * cy + u * u * b.y]);
      }
      const line = () => { fxc.beginPath(); pts.forEach(([x, y], i) => (i ? fxc.lineTo(x, y) : fxc.moveTo(x, y))); fxc.stroke(); };
      fxc.globalAlpha = vis * ro;
      fxc.lineCap = 'round'; fxc.lineJoin = 'round';
      fxc.strokeStyle = 'rgba(69,166,255,0.45)'; fxc.lineWidth = 16; line();
      fxc.strokeStyle = '#ffffff'; fxc.lineWidth = 5; fxc.setLineDash([18, 14]); fxc.lineDashOffset = -t * 60; line(); fxc.setLineDash([]);
      const [hx, hy] = pts[pts.length - 1];
      fxc.fillStyle = 'rgba(69,166,255,0.5)'; fxc.beginPath(); fxc.arc(hx, hy, 22, 0, 7); fxc.fill();
      fxc.fillStyle = '#fff'; fxc.beginPath(); fxc.arc(hx, hy, 10, 0, 7); fxc.fill();
    }
    // targeting reticle during flights
    for (const f of [CAM.flyDJ, CAM.flyGJ]) {
      const ra = env(t, f[0] + 0.2, f[1] + 0.25, 0.5, 0.45);
      if (ra <= 0) continue;
      const u = seg(t, f[0], f[1]);
      const R = lerp(250, 74, E.inOutCubic(u));
      fxc.globalAlpha = vis * ra * 0.85;
      fxc.strokeStyle = '#ffffff'; fxc.lineWidth = 2.5;
      fxc.beginPath(); fxc.arc(W / 2, H / 2, R, 0, 7); fxc.stroke();
      fxc.lineWidth = 5;
      const rot = t * 0.9;
      for (let i = 0; i < 4; i++) {
        const a0 = rot + (i * Math.PI) / 2;
        fxc.beginPath(); fxc.arc(W / 2, H / 2, R + 16, a0 - 0.28, a0 + 0.28); fxc.stroke();
      }
      fxc.lineWidth = 2.5;
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        fxc.beginPath(); fxc.moveTo(W / 2 + sx * (R - 18), H / 2 + sy * (R - 18)); fxc.lineTo(W / 2 + sx * (R + 34), H / 2 + sy * (R + 34)); fxc.stroke();
      }
    }
    fxc.restore();
  }

  // ---------- pins, HUD ----------
  const pins = $('#pins');
  const spin = (o) => el(`<div class="spin a"><div class="sp-ring"></div><div class="sp-dot"></div><div class="sp-label">${o.name}</div></div>`);
  const pinSvg = '<svg viewBox="0 0 80 108"><path d="M40 4C20 4 4 19.6 4 39.2 4 66 40 104 40 104s36-38 36-64.8C76 19.6 60 4 40 4z" fill="#0B5ED7" stroke="#fff" stroke-width="5"/><circle cx="40" cy="39" r="13" fill="#fff"/></svg>';
  const bpin = (o) => el(`<div class="bpin a"><div class="bp-ring"></div><div class="bp-ring"></div><div class="bp-ring"></div><div class="bp-shadow"></div><div class="bp-pin">${pinSvg}</div>
    <div class="bp-card"><div class="bp-k">PHILIPS ${D.region.toUpperCase()}</div><div class="bp-name">${o.name}</div><div class="bp-bld">${o.building}</div><div class="bp-area">${o.area}</div></div></div>`);
  const PIN = { sdj: spin(OFF.dj), sgj: spin(OFF.gj), bdj: bpin(OFF.dj), bgj: bpin(OFF.gj) };
  Object.values(PIN).forEach((p) => pins.appendChild(p));
  const hud = el(`<div id="hud" class="a"><div class="hud-k"><i></i><span class="k">NAVIGATING TO</span></div><div class="hud-name"></div><div class="hud-coord"></div><div class="hud-alt"><span>ALTITUDE</span><b></b></div></div>`);
  pins.appendChild(hud);
  const dist = el(`<div id="dist" class="a"></div>`);
  pins.appendChild(dist);
  const kmBetween = (a, b) => {
    const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  dist.textContent = `약 ${Math.round(kmBetween(OFF.dj, OFF.gj) / 10) * 10}km`;

  function updatePins(t, c, look) {
    const vis = mapAlpha(t) * (1 - look.b);
    const place = (p, pt) => { const s = toScreen(pt, c); return s; };
    // small pins: overview + travel overview
    for (const [p, pt, d] of [[PIN.sdj, P_DJ, 0], [PIN.sgj, P_GJ, 0.4]]) {
      const o = Math.max(env(t, 11.6 + d, 21.9, 0.6, 0.6), env(t, 83.8 + d * 0.5, CAM.flyGJ[0] + 0.9, 0.6, 0.7)) * vis;
      p.style.display = o > 0.002 ? '' : 'none';
      if (o <= 0.002) continue;
      const s = place(p, pt);
      tf(p, s.x, s.y, 1, o);
      const ph = ((t * 0.7 + d) % 1);
      tf(p.children[0], 0, 0, 1 + ph * 3.2, (1 - ph) * 0.9);
    }
    // big pins at arrival
    for (const [p, pt, t0] of [[PIN.bdj, P_DJ, CAM.flyDJ[1]], [PIN.bgj, P_GJ, CAM.flyGJ[1]]]) {
      const tEnd = t0 === CAM.flyDJ[1] ? S.djTitle[0] + 0.7 : S.gjTitle[0] + 0.7;
      const o = env(t, t0 - 0.1, tEnd, 0.3, 0.6) * mapAlpha(t);
      p.style.display = o > 0.002 ? '' : 'none';
      if (o <= 0.002) continue;
      const s = place(p, pt);
      tf(p, s.x, s.y, 1, o);
      const dp = seg(t, t0 - 0.1, t0 + 0.55);
      const drop = (1 - E.outBack(dp)) * -170;
      tf(p.children[4], 0, drop, 1, clamp(dp * 3));
      tf(p.children[3], 0, 0, lerp(0.4, 1, E.outCubic(dp)), 1);
      for (let i = 0; i < 3; i++) {
        const ph = (((t - t0) / 1.8 + i / 3) % 1 + 1) % 1;
        tf(p.children[i], 0, 0, 0.4 + ph * 2.6, t > t0 + 0.3 ? (1 - ph) * 0.85 : 0);
      }
      rv(p.children[5], t, t0 + 0.45, null, { dx: -40, dy: 0, din: 0.7 });
    }
    // HUD
    const h1 = env(t, CAM.flyDJ[0] + 0.1, CAM.flyDJ[1] + 0.4, 0.5, 0.5);
    const h2 = env(t, S.travel[0] + 0.6, CAM.flyGJ[1] + 0.4, 0.5, 0.5);
    const ho = Math.max(h1, h2) * vis;
    hud.style.display = ho > 0.002 ? '' : 'none';
    if (ho > 0.002) {
      const o = h1 > 0 ? OFF.dj : OFF.gj;
      tf(hud, 0, 0, 1, ho);
      hud.querySelector('.k').textContent = h2 > 0 && t < CAM.flyGJ[0] ? 'NEXT DESTINATION' : 'NAVIGATING TO';
      hud.querySelector('.hud-name').textContent = o.name;
      hud.querySelector('.hud-coord').textContent = `N ${o.lat.toFixed(4)}°  ·  E ${o.lon.toFixed(4)}°`;
      const lat = h1 > 0 ? OFF.dj.lat : OFF.gj.lat;
      const alt = ((156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** c.z) * H * 0.866;
      hud.querySelector('b').textContent = alt >= 10000 ? `${Math.round(alt / 1000).toLocaleString()} km` : alt >= 1000 ? `${(alt / 1000).toFixed(1)} km` : `${Math.round(alt)} m`;
      $$('i', hud)[0].style.opacity = (Math.sin(t * 8) > 0 ? 1 : 0.25).toString();
    }
    // distance chip
    const dop = env(t, CUE.route[1] - 0.3, CAM.flyGJ[0] + 0.6, 0.5, 0.5) * vis;
    dist.style.display = dop > 0.002 ? '' : 'none';
    if (dop > 0.002) {
      const a = toScreen(P_DJ, c), b = toScreen(P_GJ, c);
      tf(dist, (a.x + b.x) / 2 - 300, (a.y + b.y) / 2 - 24, 1, dop);
    }
  }

  // ---------- 1. intro ----------
  {
    const r = rng(5), parts = [];
    let ph = '';
    for (let i = 0; i < 56; i++) {
      const p = { x: r() * W, y: r() * H, v: 12 + r() * 40, s: 2 + r() * 4, a: 0.15 + r() * 0.5, f: r() * 6 };
      parts.push(p);
      ph += `<div class="pt" style="width:${p.s}px;height:${p.s}px"></div>`;
    }
    const root = addScene(S.intro, `<div class="scene" id="intro"><div class="a bg"></div><div class="a glow"></div><div class="a pts">${ph}</div>
      <div class="a top"><div class="wm">PHILIPS</div><div class="line"></div><div class="ichip"><span>${D.region}</span>대전사무소 &amp; 광주사무소</div></div>
      <div class="a head"><div class="ln"><span>보이지 않는 곳에서,</span></div><div class="ln"><span>환자 곁을 지키는 사람들</span></div></div>
      <div class="a sub">FIELD SERVICE ENGINEERS OF PHILIPS SOUTH</div></div>`, (t) => {
      const ptEls = $$('.pt', root);
      parts.forEach((p, i) => tf(ptEls[i], p.x + Math.sin(t * 0.5 + p.f) * 20, ((p.y - t * p.v) % H + H) % H, 1, p.a * (0.6 + 0.4 * Math.sin(t * 2 + p.f))));
      tf($('.glow', root), Math.sin(t * 0.4) * 80, Math.cos(t * 0.3) * 30, 1 + 0.06 * Math.sin(t * 0.5), 1);
      const wm = $('.wm', root);
      wm.style.letterSpacing = `${lerp(0.7, 0.32, E.outQuint(seg(t, 0.3, 2.6)))}em`;
      wm.style.opacity = E.outCubic(seg(t, 0.3, 1.8)).toFixed(3);
      $('.line', root).style.transform = `scaleX(${E.outCubic(seg(t, 1.3, 2.5)).toFixed(3)})`;
      rv($('.ichip', root), t, 2.0, null, { dy: 20 });
      $('.top', root).style.transform = `translateY(${(-150 * E.inOutCubic(seg(t, 3.5, 4.6))).toFixed(1)}px)`;
      $$('.ln span', root).forEach((s, i) => { const p = E.outCubic(seg(t, 4.1 + i * 0.4, 5.1 + i * 0.4)); s.style.transform = `translateY(${((1 - p) * 125).toFixed(1)}px)`; });
      rv($('.sub', root), t, 5.9, null, { dy: 16 });
      root.style.opacity = (1 - E.inCubic(seg(t, 8.9, 10))).toFixed(3);
      root.style.transform = `scale(${(1 + 0.07 * E.inCubic(seg(t, 8.4, 10))).toFixed(4)})`;
    });
  }

  // ---------- 2. overview ----------
  {
    const stats = [[2, '', '사무소'], [NALL, '명', '엔지니어'], [4, '개', '모달리티']];
    const root = addScene([S.overview[0], S.overview[1] + 0.4], `<div class="scene" id="overview"><div class="a shade"></div>
      <div class="a t1 kicker">OUR REGION</div><div class="a t2">Philips ${D.region}</div><div class="a t3">대전사무소 · 광주사무소</div>
      <div class="a stats">${stats.map((s) => `<div class="stat"><div class="n"><span>0</span><em>${s[1]}</em></div><div class="l">${s[2]}</div></div>`).join('')}</div>
      <div class="a chips">${Object.keys(MOD).map((m) => chip(m)).join('')}</div></div>`, (t) => {
      const b = S.overview[1] - 0.3;
      tf($('.shade', root), 0, 0, 1, env(t, 10.0, S.overview[1] + 0.4, 1.2, 0.9));
      rv($('.t1', root), t, 10.8, b, { dx: -40, dy: 0 });
      rv($('.t2', root), t, 11.0, b, { dx: -60, dy: 0, din: 0.9 });
      rv($('.t3', root), t, 11.4, b, { dx: -60, dy: 0 });
      $$('.stat', root).forEach((e, i) => {
        const a = 12.6 + i * 0.35;
        rv(e, t, a, b, { dy: 40 });
        e.querySelector('span').textContent = Math.round(stats[i][0] * E.outCubic(seg(t, a, a + 1.4)));
      });
      $$('.chips .chip', root).forEach((e, i) => rv(e, t, 14.2 + i * 0.15, b, { dy: 24 }));
    });
  }

  // ---------- 3. leader ----------
  {
    const nodeX = [560, 1360], nodeY = 600;
    const lines = `<svg class="a lines" width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" stroke="rgba(120,190,255,.75)" stroke-width="3">
      <path d="M960 500 V548 H${nodeX[0]} V${nodeY}"/><path d="M960 500 V548 H${nodeX[1]} V${nodeY}"/></svg>`;
    const node = (o, x) => `<div class="a node" style="left:${x - 235}px;top:${nodeY}px"><div class="on">${o.name}</div><div class="oc">엔지니어 <b>${officeCount(o)}명</b></div></div>`;
    const chips = (o, x) => `<div class="a chiprow" style="left:${x - 320}px;top:${nodeY + 158}px">${o.teams.map((tm) => chip(tm.mod, tm.members.length)).join('')}</div>`;
    const root = addScene(S.leader, `<div class="scene" id="leader">${lines}
      <div class="a lcard">${avatar(D.leader.name, '#0B5ED7', 190)}<div class="nm">${D.leader.name}<span>${D.leader.title}</span></div><div class="rl">${D.leader.role}</div></div>
      ${node(OFF.dj, nodeX[0])}${node(OFF.gj, nodeX[1])}${chips(OFF.dj, nodeX[0])}${chips(OFF.gj, nodeX[1])}
      <div class="a cap">대전과 광주, <b>${NALL}명의 엔지니어</b>를 이끄는 리더</div></div>`, (t) => {
      const b = S.leader[1] - 0.4;
      rv($('.lcard', root), t, 22.5, b, { dy: 50, ds: 0.06, din: 0.9 });
      const p = E.inOutCubic(seg(t, 23.5, 24.7));
      $$('.lines path', root).forEach((pa) => { const L = pa.getTotalLength(); pa.style.strokeDasharray = L; pa.style.strokeDashoffset = (L * (1 - p)).toFixed(1); });
      $('.lines', root).style.opacity = (1 - E.inCubic(seg(t, b - 0.45, b))).toFixed(3);
      $$('.node', root).forEach((e, i) => rv(e, t, 24.4 + i * 0.2, b, { dy: 30, ds: 0.05 }));
      $$('.chiprow', root).forEach((row, j) => $$('.chip', row).forEach((e, i) => rv(e, t, 25.1 + j * 0.2 + i * 0.12, b, { dy: 20 })));
      rv($('.cap', root), t, 26.2, b, { dy: 24 });
    });
  }

  // ---------- office title cards ----------
  function officeTitle(o, range) {
    const root = addScene(range, `<div class="scene otitle"><div class="k">${o.en}</div><div class="nm">${o.name}</div>
      <div class="bd">${o.building} · ${o.area}</div><div class="ct">엔지니어 <b>${officeCount(o)}명</b></div>
      <div class="chips">${o.teams.map((tm) => chip(tm.mod, tm.members.length)).join('')}</div></div>`, (t) => {
      const [a, b] = range;
      rv($('.k', root), t, a + 0.35, b, { dy: 20 });
      rv($('.nm', root), t, a + 0.5, b, { dy: 50, ds: 0.05, din: 0.8 });
      rv($('.bd', root), t, a + 0.75, b, { dy: 20 });
      rv($('.ct', root), t, a + 0.95, b, { dy: 20 });
      $$('.chip', root).forEach((e, i) => rv(e, t, a + 1.1 + i * 0.1, b, { dy: 20 }));
    });
    return root;
  }

  // ---------- team sections ----------
  function teamScene(o, tm, idx, range) {
    const m = MOD[tm.mod], n = tm.members.length;
    const cards = tm.members.map((nm) => `<div class="card${n === 1 ? ' solo' : ''}">${avatar(nm, m.color, n === 1 ? 220 : 196)}<div class="cn">${nm}</div><div class="cr">${m.name.toUpperCase()} ENGINEER</div><div class="co">${o.name}</div></div>`).join('');
    const root = addScene(range, `<div class="scene team" style="--c:${m.color}"><div class="a wash"></div><div class="a big">${ICON[tm.mod]}</div>
      <div class="a top"><span class="off">${PINSVG}${o.name}</span><span class="idx">TEAM 0${idx + 1} <em>/ 0${o.teams.length}</em></span></div>
      <div class="a ic">${ICON[tm.mod]}</div><div class="a nm">${m.name}</div>
      <div class="a ko">${m.name}팀 · <span>엔지니어 ${n}명</span></div><div class="a bar"></div>
      <div class="a ds">${m.desc.map((d) => `<div>${d}</div>`).join('')}</div>
      <div class="a cards">${cards}</div></div>`, (t) => {
      const [a, b] = range;
      const k = env(t, a, b, 0.8, 0.5);
      tf($('.wash', root), 0, 0, 1, k);
      tf($('.big', root), -60 * seg(t, a, b), 20 * Math.sin(t * 0.5), 1, 0.07 * k, -6 + 8 * seg(t, a, b));
      rv($('.top', root), t, a + 0.05, b, { dy: -20, oy: 0 });
      rv($('.ic', root), t, a + 0.1, b, { dx: -50, dy: 0, ds: 0.2, ox: -40, oy: 0 });
      rv($('.nm', root), t, a + 0.22, b, { dx: -70, dy: 0, ox: -40, oy: 0, din: 0.8 });
      rv($('.ko', root), t, a + 0.38, b, { dx: -50, dy: 0, ox: -40, oy: 0 });
      const bp = E.outCubic(seg(t, a + 0.5, a + 1.2)) * (1 - E.inCubic(seg(t, b - 0.45, b)));
      $('.bar', root).style.transform = `scaleX(${bp.toFixed(3)})`;
      rv($('.ds', root), t, a + 0.55, b, { dx: -50, dy: 0, ox: -40, oy: 0 });
      $$('.card', root).forEach((e, i) => rv(e, t, a + 0.5 + i * 0.17, b, { dy: 90, ds: 0.06, din: 0.85, dout: 0.4, oy: -30 }));
    });
    return root;
  }

  function groupScene(o, range) {
    const all = o.teams.flatMap((tm) => tm.members.map((nm) => ({ nm, mod: tm.mod })));
    const per = all.length > 8 ? 5 : 4;
    const gw = per * 230 + (per - 1) * 30;
    const root = addScene(range, `<div class="scene group"><div class="k">${o.en} · ${o.building}</div><div class="nm">${o.name} 엔지니어 <b>${all.length}인</b></div>
      <div class="grid" style="width:${gw}px">${all.map((p) => `<div class="mini" style="--c:${MOD[p.mod].color}">${avatar(p.nm, MOD[p.mod].color, 128)}<div class="mn">${p.nm}</div><div class="mr">${MOD[p.mod].name.toUpperCase()}</div></div>`).join('')}</div></div>`, (t) => {
      const [a, b] = range;
      rv($('.k', root), t, a + 0.1, b, { dy: 20 });
      rv($('.nm', root), t, a + 0.2, b, { dy: 30 });
      $$('.mini', root).forEach((e, i) => rv(e, t, a + 0.35 + i * 0.07, b, { dy: 40, ds: 0.1, din: 0.6 }));
    });
    return root;
  }

  officeTitle(OFF.dj, S.djTitle);
  OFF.dj.teams.forEach((tm, i) => teamScene(OFF.dj, tm, i, S.djTeams[i]));
  groupScene(OFF.dj, S.djGroup);
  officeTitle(OFF.gj, S.gjTitle);
  OFF.gj.teams.forEach((tm, i) => teamScene(OFF.gj, tm, i, S.gjTeams[i]));
  groupScene(OFF.gj, S.gjGroup);

  // ---------- night sky helper ----------
  function starsHTML(seed, n, maxY) {
    const r = rng(seed); let s = '';
    for (let i = 0; i < n; i++) s += `<div class="star" style="left:${(r() * W).toFixed(0)}px;top:${(r() * maxY).toFixed(0)}px;transform:scale(${(0.5 + r() * 1.2).toFixed(2)})" data-f="${(r() * 6).toFixed(2)}"></div>`;
    return s;
  }
  const twinkle = (root, t) => $$('.star', root).forEach((s) => { s.style.opacity = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + +s.dataset.f * 3))).toFixed(2); });

  // ---------- 4. hospital ----------
  {
    const r = rng(42); let win = '';
    for (let j = 0; j < 7; j++) for (let i = 0; i < 13; i++) win += `<rect class="${r() < 0.55 ? 'wl' : 'wd'}" x="${60 + i * 72}" y="${170 + j * 60}" width="46" height="34" rx="4"/>`;
    const bld = `<svg class="a bld" width="1030" height="640" viewBox="0 0 1030 640"><defs><linearGradient id="hb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b3566"/><stop offset="1" stop-color="#0d1f45"/></linearGradient></defs>
      <rect x="340" y="40" width="350" height="110" rx="10" fill="#15305e" stroke="rgba(255,255,255,.14)" stroke-width="2"/>
      <rect x="0" y="120" width="1030" height="540" rx="12" fill="url(#hb)" stroke="rgba(255,255,255,.14)" stroke-width="2"/>
      <g transform="translate(515 92)"><rect x="-48" y="-48" width="96" height="96" rx="22" fill="#fff"/><path d="M-13 -32 h26 v19 h19 v26 h-19 v19 h-26 v-19 h-19 v-26 h19z" fill="#E5484D"/></g>${win}</svg>`;
    const mods = Object.keys(MOD);
    const cards = mods.map((m, i) => `<div class="stc" style="left:${880 + i * 245}px;--c:${MOD[m].color}"><div class="row">${ICON[m]}<div class="sn">${MOD[m].name}</div></div><div class="ss"><i></i><span>정상 가동</span></div></div>`).join('');
    const root = addScene(S.hospital, `<div class="scene" id="hospital"><div class="a nightbg"></div>${starsHTML(3, 70, 420)}<div class="a moon"></div>${bld}${cards}
      <div class="a txt"><div class="kicker">WHY WE ARE ALWAYS READY</div><div class="h1">병원 장비가 멈추면,<br><b>진료도 멈춥니다.</b></div>
      <div class="s1">응급실 · 수술실 · 영상의학과<br>장비 뒤에는 언제나 환자가 있습니다.</div></div>
      <div class="a s2">그래서 우리는, <b>언제나 대기합니다.</b></div></div>`, (t) => {
      const [a, b] = S.hospital;
      root.style.opacity = env(t, a, b, 1.0, 0.5).toFixed(3);
      twinkle(root, t);
      tf($('.moon', root), 0, -20 * seg(t, a, b), 1, 1);
      tf($('.bld', root), 0, 60 * (1 - E.outCubic(seg(t, a, a + 1.6))) - 10 * seg(t, a, b), 1, 1);
      rv($('.txt', root), t, a + 0.5, b, { dx: -50, dy: 0, din: 0.9 });
      const err = t >= CUE.alert;
      $$('.stc', root).forEach((e, i) => {
        const isCT = mods[i] === 'ct';
        let o = rv(e, t, a + 1.4 + i * 0.18, b, { dy: 40 });
        if (isCT) {
          e.classList.toggle('err', err);
          e.querySelector('span').textContent = err ? '장애 발생!' : '정상 가동';
          if (err) {
            const sh = t - CUE.alert < 1.0 ? Math.sin(t * 70) * 7 * (1 - (t - CUE.alert)) : 0;
            const tr = e.style.transform; e.style.transform = tr + ` translateX(${sh.toFixed(1)}px)`;
            e.querySelector('i').style.opacity = Math.sin(t * 14) > 0 ? '1' : '0.2';
          }
        }
      });
      rv($('.s2', root), t, CUE.alert + 1.5, b, { dy: 24 });
    });
  }

  // ---------- 5. night: clock, phone, drive ----------
  {
    const ticks = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; const r1 = i % 6 ? 268 : 252; return `<line x1="${300 + Math.sin(a) * r1}" y1="${300 - Math.cos(a) * r1}" x2="${300 + Math.sin(a) * 284}" y2="${300 - Math.cos(a) * 284}"/>`; }).join('');
    const ring = `<svg class="a ring" viewBox="0 0 600 600" fill="none"><circle cx="300" cy="300" r="284" stroke="rgba(255,255,255,.12)" stroke-width="3"/>
      <g stroke="rgba(255,255,255,.6)" stroke-width="4" stroke-linecap="round">${ticks}</g>
      <circle class="arc" cx="300" cy="300" r="240" stroke="#45A6FF" stroke-width="10" stroke-linecap="round" transform="rotate(-90 300 300)"/></svg>`;
    // skyline for the drive
    const rs = rng(77); let sk = '', x = 0;
    while (x < 2600) { const w = 80 + rs() * 140, h = 120 + rs() * 260; sk += `<rect x="${x.toFixed(0)}" y="${(420 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#0a1736"/>`;
      for (let wy = 420 - h + 16; wy < 400; wy += 30) for (let wx = x + 12; wx < x + w - 16; wx += 26) if (rs() < 0.22) sk += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="10" height="12" fill="#ffd98a" opacity=".7"/>`;
      x += w + 6; }
    const skyline = `<svg width="2600" height="420" viewBox="0 0 2600 420">${sk}</svg>`;
    const lamps = Array.from({ length: 6 }, () => '<div class="lamp"><b></b><i></i></div><div class="pool"></div>').join('');
    const speeds = Array.from({ length: 10 }, () => '<div class="speed"></div>').join('');
    const car = `<svg class="a car" viewBox="0 0 520 192"><ellipse cx="265" cy="176" rx="250" ry="14" fill="rgba(0,0,0,.5)"/>
      <path d="M24 136 L28 98 Q32 80 52 76 L134 68 L190 26 Q202 16 220 16 L362 16 Q382 16 396 30 L442 72 L480 82 Q502 88 504 110 L506 136 Z" fill="#eef3fa"/>
      <path d="M204 32 L168 68 L270 68 L270 32 Z" fill="#5f8fc9"/><path d="M284 32 L284 68 L420 68 L384 34 Q378 32 368 32 Z" fill="#5f8fc9"/>
      <rect x="28" y="104" width="476" height="14" fill="#0B5ED7"/><rect x="490" y="88" width="14" height="12" rx="3" fill="#fff8d0"/><rect x="24" y="92" width="10" height="18" rx="3" fill="#ff3b3b"/>
      <g class="wh" transform="translate(126 140)"><circle r="38" fill="#121722"/><circle r="18" fill="#c9d3e0"/><path d="M-18 0 H18 M0 -18 V18" stroke="#121722" stroke-width="5"/></g>
      <g class="wh" transform="translate(404 140)"><circle r="38" fill="#121722"/><circle r="18" fill="#c9d3e0"/><path d="M-18 0 H18 M0 -18 V18" stroke="#121722" stroke-width="5"/></g></svg>`;
    const phone = `<div class="a phone"><div class="scr"><div class="notch"></div><div class="badge"><span>긴급 장애 콜</span></div>
      <div class="caller"><div class="pav">${'<svg viewBox="0 0 24 24" fill="#fff"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-3 10h-3v3h-2v-3H8v-2h3V8h2v3h3v2z"/></svg>'}</div>
      <div class="cn">○○병원 영상의학과</div><div class="cd">CT 촬영 중 장비 오류<br>현장 지원 요청</div></div>
      <div class="incall">통화 중 · 00:00</div>
      <div class="btns"><div class="btn no"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg></div>
      <div class="btn yes"><svg viewBox="0 0 24 24" fill="#fff"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1.02 1.02 0 0 0-1.02.24l-2.2 2.2a15.045 15.045 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg></div></div></div></div>`;
    const waves = Array.from({ length: 3 }, () => '<div class="wave"></div>').join('');
    const root = addScene(S.night, `<div class="scene" id="night"><div class="a nightbg"></div>${starsHTML(9, 90, 1080)}
      <div class="a clock">${ring}<div class="a ampm">새벽</div><div class="a time">02:47</div><div class="a ccap">모두가 잠든 새벽에도</div></div>
      <div class="a ptxt"><div class="kicker">ON-CALL 24/7</div><div class="h"><b>24시간</b><br>콜 대기</div><div class="s">전화 한 통이면,<br>바로 출발합니다.</div></div>
      ${waves}${phone}
      <div class="a drive"><div class="a sky2"></div>${starsHTML(13, 60, 520)}<div class="a skyline">${skyline}</div><div class="a skyline s2">${skyline}</div>
      <div class="a road"></div><div class="a lane"></div>${lamps}${speeds}<div class="a beam"></div>${car}
      <div class="a dtxt"><div class="tm">AM 03:05</div><div class="h">병원으로 출동</div><div class="s">환자가 기다리는 곳으로, 가장 먼저 달려갑니다.</div></div></div></div>`, (t) => {
      const [a, b] = S.night;
      root.style.opacity = env(t, a, b, 0.6, 0.5).toFixed(3);
      twinkle(root, t);
      // clock: 22:00 -> 02:47 time-lapse
      const ck = env(t, a, CUE.phoneRing[0] - 0.2, 0.6, 0.6);
      const clock = $('.clock', root);
      clock.style.display = ck > 0.002 ? '' : 'none';
      if (ck > 0.002) {
        tf(clock, 0, 0, 1 + 0.04 * seg(t, a, CUE.phoneRing[0]), ck);
        const u = E.inOutSine(seg(t, CUE.clockLapse[0], CUE.clockLapse[1]));
        const mins = Math.round(lerp(22 * 60, 26 * 60 + 47, u)) % (24 * 60);
        $('.time', clock).textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
        $('.ampm', clock).textContent = mins >= 18 * 60 ? '밤' : '새벽';
        const arc = $('.arc', clock), L = 2 * Math.PI * 240;
        arc.style.strokeDasharray = `${L}`; arc.style.strokeDashoffset = `${(L * (1 - Math.max(0.004, u))).toFixed(1)}`;
        rv($('.ccap', clock), t, a + 0.8, null, { dy: 24 });
      }
      // phone
      const pa = CUE.phoneRing[0] - 0.4, pb = CUE.driveStart + 0.2;
      const ph = $('.phone', root), pt = $('.ptxt', root);
      const po = env(t, pa, pb, 0.6, 0.5);
      ph.style.display = pt.style.display = po > 0.002 ? '' : 'none';
      $$('.wave', root).forEach((w, i) => {
        const ring = t >= CUE.phoneRing[0] && t < CUE.phoneRing[1];
        const q = (((t - CUE.phoneRing[0]) / 0.9 + i / 3) % 1 + 1) % 1;
        w.style.display = ring && po > 0 ? '' : 'none';
        if (ring) { const g = 30 + q * 120; w.style.left = `${1170 - g}px`; w.style.top = `${150 - g}px`; w.style.width = `${400 + 2 * g}px`; w.style.height = `${800 + 2 * g}px`; w.style.opacity = ((1 - q) * 0.8).toFixed(2); }
      });
      if (po > 0.002) {
        const ringing = t >= CUE.phoneRing[0] && t < CUE.phoneRing[1];
        const sh = ringing ? Math.sin(t * 2 * Math.PI * 16) * 3.2 : 0;
        const pi = E.outCubic(seg(t, pa, pa + 0.7));
        tf(ph, sh * 1.6, 120 * (1 - pi), 1, po, sh);
        rv(pt, t, pa + 0.3, pb, { dx: -60, dy: 0 });
        const acc = t >= CUE.callAccept;
        $('.badge span', ph).textContent = acc ? '통화 연결됨' : '긴급 장애 콜';
        $('.badge span', ph).style.background = acc ? '#2FD07A' : '#E5484D';
        const ic = $('.incall', ph); ic.style.opacity = acc ? '1' : '0';
        ic.textContent = `통화 중 · 00:${String(Math.max(0, Math.floor(t - CUE.callAccept))).padStart(2, '0')}`;
        $('.btns', ph).style.opacity = acc ? '0' : '1';
        const yes = $('.yes', ph);
        yes.style.transform = `scale(${(t > CUE.callAccept - 0.25 && !acc ? 0.88 : 1 + 0.06 * Math.sin(t * 10)).toFixed(3)})`;
      }
      // drive
      const dv = $('.drive', root);
      const dop = env(t, CUE.driveStart - 0.4, b + 0.2, 0.7, 0.5);
      dv.style.display = dop > 0.002 ? '' : 'none';
      if (dop > 0.002) {
        dv.style.opacity = dop.toFixed(3);
        const lt = t - CUE.driveStart;
        const sk = $$('.skyline', dv);
        const sx = -((lt * 70) % 2600);
        tf(sk[0], sx, 0, 1, 1); tf(sk[1], sx + 2600, 0, 1, 1);
        $('.lane', dv).style.backgroundPosition = `${(-lt * 1100).toFixed(1)}px 0`;
        const lamps = $$('.lamp', dv), pools = $$('.pool', dv);
        lamps.forEach((l, i) => { const lx = ((i * 420 - lt * 800) % 2520 + 2520) % 2520 - 260; l.style.left = `${lx}px`; pools[i].style.left = `${lx - 200}px`; });
        $$('.speed', dv).forEach((s, i) => { const rr = rng(200 + i); const y = 560 + rr() * 300, w = 120 + rr() * 220; const sx2 = ((rr() * 2400 - lt * (1600 + rr() * 800)) % 2400 + 2400) % 2400 - 300; s.style.left = `${sx2}px`; s.style.top = `${y}px`; s.style.width = `${w}px`; s.style.opacity = '0.6'; });
        const bounce = Math.sin(lt * 18) * 1.5;
        tf($('.car', dv), 20 * Math.sin(lt * 0.8), bounce, 1, 1);
        tf($('.beam', dv), 20 * Math.sin(lt * 0.8), bounce, 1, 0.85 + 0.15 * Math.sin(lt * 9));
        $$('.wh', dv).forEach((w, i) => w.setAttribute('transform', `translate(${i ? 404 : 126} 140) rotate(${(lt * 900) % 360})`));
        const dt = $('.dtxt', dv);
        rv(dt, t, CUE.driveStart + 0.2, null, { dx: -50, dy: 0 });
        $('.tm', dt).textContent = `AM 03:${String(5 + Math.floor(Math.max(0, lt) / 1.4)).padStart(2, '0')}`;
      }
    });
  }

  // ---------- 6. holidays ----------
  {
    const days = [
      { m: '1월', s: 'JAN', d: '1', n: '신정' },
      { m: '음력 1월', s: '', d: '1', n: '설날 연휴' },
      { m: '5월', s: 'MAY', d: '5', n: '어린이날' },
      { m: '음력 8월', s: '', d: '15', n: '추석 연휴' },
      { m: '12월', s: 'DEC', d: '25', n: '성탄절' },
    ];
    const stamp = `<svg class="stamp" viewBox="0 0 190 190"><g fill="none" stroke="#0B5ED7"><circle cx="95" cy="95" r="86" stroke-width="9"/><circle cx="95" cy="95" r="70" stroke-width="3"/></g>
      <text x="95" y="108" text-anchor="middle" font-family="Pretendard" font-weight="900" font-size="58" fill="#0B5ED7">출동</text>
      <text x="95" y="142" text-anchor="middle" font-family="Pretendard" font-weight="800" font-size="16" letter-spacing="3" fill="#0B5ED7">ON CALL</text></svg>`;
    const x0 = (W - (5 * 280 + 4 * 36)) / 2;
    const cards = days.map((d, i) => `<div class="cal" style="left:${x0 + i * 316}px"><div class="mb">${d.m}${d.s ? `<small>${d.s}</small>` : ''}</div><div class="dn">${d.d}</div><div class="hn">${d.n}</div>${stamp}</div>`).join('');
    const root = addScene(S.holidays, `<div class="scene" id="holidays"><div class="a bg"></div>
      <div class="a ttl"><span>공휴일에도,</span><span>연휴에도,</span><span>명절에도</span></div>${cards}
      <div class="a cap">부르면 <b>달려갑니다.</b></div><div class="a cap2">연휴에도 장비가 멈추면, 그곳이 바로 우리의 현장입니다.</div></div>`, (t) => {
      const [a, b] = S.holidays;
      root.style.opacity = env(t, a, b, 0.6, 0.4).toFixed(3);
      $$('.ttl span', root).forEach((e, i) => rv(e, t, a + 0.3 + i * 0.4, b, { dy: 40 }));
      $$('.cal', root).forEach((c, i) => {
        const ts = CUE.stamps[i];
        const sp = seg(t, ts, ts + 0.16);
        const shake = t > ts + 0.12 && t < ts + 0.4 ? Math.sin((t - ts) * 90) * 6 * (1 - seg(t, ts + 0.12, ts + 0.4)) : 0;
        const o = rv(c, t, a + 0.9 + i * 0.22, b, { dy: 120, ds: 0.05, din: 0.8 });
        if (shake) c.style.transform += ` translateY(${shake.toFixed(1)}px)`;
        const st = $('.stamp', c);
        tf(st, 0, 0, lerp(2.4, 1, E.outCubic(sp)), sp > 0 ? clamp(sp * 2) * 0.95 : 0, -14 + i * 5);
      });
      rv($('.cap', root), t, CUE.stamps[4] + 0.6, b, { dy: 30 });
      rv($('.cap2', root), t, CUE.stamps[4] + 1.0, b, { dy: 20 });
    });
  }

  // ---------- 7. 365 / 24 ----------
  {
    const root = addScene(S.always, `<div class="scene" id="always"><div class="a bg"></div><div class="a flash"></div>
      <div class="a big"><div><span class="v">0</span><span class="u">일</span></div><div class="dot">·</div><div><span class="v">0</span><span class="u">시간</span></div></div>
      <div class="a s">멈추지 않는 현장, Philips ${D.region} 엔지니어</div><div class="a s2">오늘도 대전과 광주의 병원을 지키고 있습니다.</div></div>`, (t) => {
      const [a, b] = S.always;
      root.style.opacity = env(t, a, b, 0.4, 0.5).toFixed(3);
      const im = CUE.impact;
      tf($('.flash', root), 0, 0, 1, t >= im ? Math.exp(-(t - im) * 2.4) * 0.9 : 0);
      const bg = $('.big', root);
      const p = seg(t, im, im + 0.35);
      tf(bg, 0, 0, lerp(1.35, 1, E.outCubic(p)), t >= im ? clamp(p * 3) : 0);
      const vs = $$('.v', bg), cnt = E.outCubic(seg(t, im, im + 1.4));
      vs[0].textContent = Math.round(365 * cnt); vs[1].textContent = Math.round(24 * cnt);
      rv($('.s', root), t, im + 0.9, b, { dy: 24 });
      rv($('.s2', root), t, im + 1.3, b, { dy: 20 });
    });
  }

  // ---------- 8. outro ----------
  {
    const panel = (o, x) => {
      const all = o.teams.flatMap((tm) => tm.members.map((nm) => ({ nm, mod: tm.mod })));
      return `<div class="panel" style="left:${x}px"><div class="ph"><b>${o.name}</b><span>${o.building}</span></div><div class="pg" style="width:${(all.length > 8 ? 5 : 4) * 146 + ((all.length > 8 ? 5 : 4) - 1) * 10}px">${all.map((p) => `<div class="mini" style="--c:${MOD[p.mod].color}">${avatar(p.nm, MOD[p.mod].color, 92)}<div class="mn">${p.nm}</div><div class="mr">${MOD[p.mod].name.toUpperCase()}</div></div>`).join('')}</div></div>`;
    };
    const root = addScene(S.outro, `<div class="scene" id="outro"><div class="a bg"></div><div class="a sun"></div>
      <div class="a hd"><div class="k">PHILIPS ${D.region.toUpperCase()} ENGINEERS</div><div class="t">대전 · 광주 사무소</div></div>
      <div class="a ld"><div class="ldin">${avatar(D.leader.name, '#0B5ED7', 96)}<div><div class="n">${D.leader.name}<span>${D.leader.title}</span></div><div class="r">${D.leader.role}</div></div></div></div>
      ${panel(OFF.dj, 110)}${panel(OFF.gj, 980)}
      <div class="a tag">환자 곁의 장비가 멈추지 않도록,<br>오늘도 현장을 지키는 사람들 — <b>우리가 Philips ${D.region}입니다.</b></div>
      <div class="a fin"><div class="wm">PHILIPS</div><div class="ln"></div><div class="s"><span>${D.region}</span>대전사무소 &amp; 광주사무소</div><div class="th">함께 일하는 동료들을 응원해 주세요!</div></div></div>`, (t) => {
      const [a, b] = S.outro;
      root.style.opacity = env(t, a, b + 1, 0.8, 0.1).toFixed(3);
      tf($('.sun', root), 0, 120 * (1 - E.outCubic(seg(t, a, a + 8))), 1, 0.4 + 0.6 * seg(t, a, a + 7));
      const out = 173.8;
      rv($('.hd', root), t, a + 0.3, out, { dy: -30 });
      rv($('.ld', root), t, a + 0.7, out, { dy: 30, ds: 0.05 });
      $$('.panel', root).forEach((p, i) => rv(p, t, a + 1.1 + i * 0.25, out, { dy: 60 }));
      $$('.panel .mini', root).forEach((m, i) => rv(m, t, a + 1.5 + i * 0.06, out, { dy: 26, ds: 0.12, din: 0.5 }));
      rv($('.tag', root), t, a + 3.4, out, { dy: 26, din: 0.9 });
      const fin = $('.fin', root);
      const fo = E.outCubic(seg(t, out, out + 1.0));
      fin.style.display = fo > 0 ? 'flex' : 'none';
      fin.style.opacity = fo.toFixed(3);
      const wm = $('.wm', fin);
      wm.style.letterSpacing = `${lerp(0.6, 0.32, E.outQuint(seg(t, out, out + 2.2)))}em`;
      $('.ln', fin).style.transform = `scaleX(${E.outCubic(seg(t, out + 0.6, out + 1.6)).toFixed(3)})`;
      rv($('.s', fin), t, out + 1.0, null, { dy: 20 });
      rv($('.th', fin), t, out + 1.6, null, { dy: 16 });
    });
  }

  // ---------- frame ----------
  const brand = $('#brand'), attr = $('#attr'), black = $('#black');
  async function renderAt(t) {
    const c = cam(t), look = mapLook(t);
    const mon = mapOn(t);
    MAP.el.style.display = mon ? '' : 'none';
    if (mon) {
      await MAP.ensure(c);
      MAP.draw(c, look);
      MAP.el.style.opacity = mapAlpha(t).toFixed(3);
    }
    drawFx(t, c, look);
    updatePins(t, c, look);
    for (const s of scenes) {
      const on = t >= s.a && t < s.b;
      s.root.style.display = on ? (s.root.classList.contains('otitle') || s.root.classList.contains('group') ? 'flex' : 'block') : 'none';
      if (on) s.update(t);
    }
    tf(brand, 0, 0, 1, env(t, 10.4, S.outro[0], 0.8, 0.6) * 0.9);
    tf(attr, 0, 0, 1, mapAlpha(t) * (1 - look.b) * 0.9);
    black.style.opacity = Math.max(1 - seg(t, 0, 0.6), seg(t, cfg.duration - 1.0, cfg.duration)).toFixed(3);
  }

  // all tiles the camera will need, for the downloader
  function collectTiles() {
    const set = new Set();
    for (let f = 0; f < cfg.duration * cfg.fps; f++) {
      const t = f / cfg.fps;
      if (!mapOn(t)) continue;
      for (const tl of MAP.tiles(cam(t))) set.add(tl.key);
    }
    return [...set];
  }

  window.renderAt = renderAt;
  window.collectTiles = collectTiles;
  window.VIDEO = { fps: cfg.fps, duration: cfg.duration };
  window.ready = true;

  // live preview: open index.html?play (optionally &t=SECONDS)
  const qs = new URLSearchParams(location.search);
  if (qs.has('play')) {
    const start = parseFloat(qs.get('t') || '0'), t0 = performance.now();
    const audio = new Audio('output/audio.wav');
    audio.currentTime = start; audio.play().catch(() => {});
    let busy = false;
    const loop = async () => { if (!busy) { busy = true; await renderAt(Math.min(cfg.duration - 0.01, start + (performance.now() - t0) / 1000)); busy = false; } requestAnimationFrame(loop); };
    loop();
  } else if (qs.has('t')) {
    renderAt(parseFloat(qs.get('t')));
  }
})();
