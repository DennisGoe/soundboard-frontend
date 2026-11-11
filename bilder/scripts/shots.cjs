// Screenshot-Runner: schiesst alle Szenen-Views fuer die Review-Runde.
// Fuehrt headless Chromium aus und speichert nach docs/.
const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const path = require('path');

const SHOT_DIR = path.join(__dirname, '..', 'docs');
const viewport = { width: 1600, height: 900 };

const SHOTS = [
  { query: 'q=medium', file: 'shot-default.png', waitTime: 1000 },
  { query: 'q=medium&cam=village', file: 'shot-village.png' },
  { query: 'q=medium&cam=farm', file: 'shot-farm.png' },
  { query: 'q=medium&cam=garden', file: 'shot-garden.png' },
  { query: 'q=medium&cam=top', file: 'shot-top.png' },
  { query: 'q=medium&time=0', file: 'shot-night.png' },
  { query: 'q=medium&time=12', file: 'shot-day.png' },
  { query: 'q=medium&time=0&cam=village', file: 'shot-village-night.png' },
];

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
      `--window-size=${viewport.width},${viewport.height}`],
  });
  for (const s of SHOTS) {
    const p = await b.newPage({ viewport });
    // Fresh storage, falls Editor-Objekte da sind
    await p.goto('http://127.0.0.1:5199/');
    await p.evaluate(() => localStorage.removeItem('dnd-world.sceneDoc.v1'));
    await p.goto('http://127.0.0.1:5199/?' + s.query);
    await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
    await p.waitForTimeout(s.waitTime ?? 1500);
    const out = path.join(SHOT_DIR, s.file);
    await p.screenshot({ path: out, fullPage: false });
    console.log('  ', s.file, '  ', s.query);
    await p.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
