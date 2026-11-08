// Renders the video page frame by frame with headless Chromium.
//   node scripts/render.js --collect tiles.txt          list map tiles the camera needs
//   node scripts/render.js --stills 5,40.5,90 --out dir  save single preview frames
//   node scripts/render.js --out frames [--workers 4] [--from 0] [--to N]   all frames as JPEG
//   add --lang en for the English version (default: ko)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const LANG = arg('lang', 'ko');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.wav': 'audio/wav' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(fp, (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
        res.end(d);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html?lang=${LANG}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  return page;
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const launch = () => chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });

  if (arg('collect')) {
    const b = await launch();
    const page = await openPage(b, port);
    const keys = await page.evaluate(() => window.collectTiles());
    fs.writeFileSync(arg('collect'), keys.join('\n') + '\n');
    console.log(`${keys.length} tiles`);
    await b.close(); srv.close(); return;
  }

  const out = path.resolve(arg('out', path.join(ROOT, 'output', LANG === 'ko' ? 'frames' : `frames_${LANG}`)));
  fs.mkdirSync(out, { recursive: true });

  if (arg('stills')) {
    const b = await launch();
    const page = await openPage(b, port);
    for (const s of arg('stills').split(',')) {
      const t = parseFloat(s);
      await page.evaluate((t) => window.renderAt(t), t);
      await page.screenshot({ path: path.join(out, `still_${t.toFixed(2).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 88 });
    }
    await b.close(); srv.close(); return;
  }

  const meta = { fps: 30, duration: 180 };
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  meta.fps = cfg.fps; meta.duration = cfg.duration;
  const total = Math.round(meta.fps * meta.duration);
  const from = parseInt(arg('from', '0'), 10), to = Math.min(total, parseInt(arg('to', String(total)), 10));
  const workers = parseInt(arg('workers', '4'), 10);
  const todo = [];
  for (let f = from; f < to; f++) {
    const fp = path.join(out, `f${String(f).padStart(5, '0')}.jpg`);
    if (!fs.existsSync(fp) || fs.statSync(fp).size === 0) todo.push(f);
  }
  console.log(`rendering ${todo.length} frames with ${workers} workers -> ${out}`);
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const b = await launch();
    const page = await openPage(b, port);
    // each worker takes contiguous blocks so the map tile cache stays warm
    const block = 60;
    for (;;) {
      const start = next; next += block;
      if (start >= todo.length) break;
      for (let i = start; i < Math.min(start + block, todo.length); i++) {
        const f = todo[i];
        await page.evaluate((t) => window.renderAt(t), f / meta.fps);
        const fp = path.join(out, `f${String(f).padStart(5, '0')}.jpg`);
        await page.screenshot({ path: fp + '.tmp', type: 'jpeg', quality: 93 });
        fs.renameSync(fp + '.tmp', fp);
        done++;
        if (done % 300 === 0) {
          const el = (Date.now() - t0) / 1000;
          console.log(`${done}/${todo.length} frames, ${(done / el).toFixed(1)} fps, eta ${Math.round((todo.length - done) / (done / el))}s`);
        }
      }
    }
    await b.close();
  }));
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
