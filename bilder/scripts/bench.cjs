// Unsichtbare Echtzeit-Messung: node bench.cjs [query] [WxH]
// Beispiele:
//   node bench.cjs q=medium
//   node bench.cjs q=high 2560x1440
const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');

const args = process.argv.slice(2);
let query = 'q=medium';
let viewport = { width: 1600, height: 900 };
for (const a of args) {
  if (/^\d+x\d+$/.test(a)) {
    const [w, h] = a.split('x').map((n) => parseInt(n, 10));
    viewport = { width: w, height: h };
  } else {
    query = a;
  }
}

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-angle=metal',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  });
  const p = await b.newPage({ viewport });
  await p.goto(`http://127.0.0.1:5199/?bench&${query}`);
  await p.waitForFunction(() => document.title.startsWith('BENCH'), null, { timeout: 120000 });
  const title = await p.title();
  console.log(`[${viewport.width}x${viewport.height}] ${title}`);
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
