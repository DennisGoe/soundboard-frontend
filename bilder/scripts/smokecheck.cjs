// Schneller Rauch-Test: laedt /?edit=1, wartet auf __sceneReady und sammelt
// Konsolenfehler. Wird vor Runde-C-Interaktionstests genutzt, um Syntaxfehler
// (z.B. doppelte const-Deklarationen) sofort sichtbar zu machen.
const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'],
  });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push('ERR ' + e.message));
  p.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CON ' + msg.text());
  });
  await p.goto('http://127.0.0.1:5199/?edit=1');
  try {
    await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 30000 });
  } catch (e) {
    console.log('sceneReady timeout', e.message);
  }
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => ({
    ready: !!window.__sceneReady,
    editorMode: !!(window.__editor && window.__editor.editMode),
    objects: window.__editor?.doc?.objects?.length,
    paths: window.__editor?.doc?.paths?.length,
  }));
  console.log('INFO', info);
  console.log('ERRORS n=', errors.length);
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  await b.close();
  process.exit(errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
