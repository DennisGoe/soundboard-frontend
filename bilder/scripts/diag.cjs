// Diagnose-Script: wartet auf sceneReady, liest window.__stats
// und konsolen-messages mit, schreibt alles nach stdout.
// Aufruf:  node scripts/diag.cjs [q=medium] [cam=garden] [WxH] [outPng]
const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let query = [];
let viewport = { width: 1600, height: 900 };
let outPng = null;
for (const a of args) {
  if (/^\d+x\d+$/.test(a)) {
    const [w, h] = a.split('x').map((n) => parseInt(n, 10));
    viewport = { width: w, height: h };
  } else if (a.endsWith('.png')) {
    outPng = a;
  } else {
    query.push(a);
  }
}
const qstr = query.join('&');

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  });
  const p = await b.newPage({ viewport });
  const logs = [];
  p.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[dnd-world]') || t.includes('Error') || t.includes('WebGL') || /garden|decor/i.test(t)) {
      logs.push(`[console.${msg.type()}] ${t}`);
    }
  });
  p.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  await p.goto(`http://127.0.0.1:5199/?${qstr}`);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  // ein paar Frames warten, damit Postprocessing stabil ist
  await p.waitForTimeout(600);
  const stats = await p.evaluate(() => window.__stats);
  const camState = await p.evaluate(() => ({
    pos: { x: window.__cam?.position.x, y: window.__cam?.position.y, z: window.__cam?.position.z },
    tgt: { x: window.__ctrl?.target.x, y: window.__ctrl?.target.y, z: window.__ctrl?.target.z },
  }));
  for (const l of logs) console.log(l);
  console.log('__stats =', JSON.stringify(stats, null, 2));
  console.log('cam    =', JSON.stringify(camState));
  if (outPng) {
    const dir = path.dirname(outPng);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await p.screenshot({ path: outPng, fullPage: false });
    console.log('screenshot ->', outPng);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
