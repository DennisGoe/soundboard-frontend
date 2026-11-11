// Screenshot: Editor-Modus mit ausgewaehltem Baum + Bruecke + Hilfeleiste.
const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const path = require('path');

const SHOT_DIR = path.join(__dirname, '..', 'docs');
const viewport = { width: 1600, height: 900 };

(async () => {
  const b = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
      `--window-size=${viewport.width},${viewport.height}`],
  });
  const p = await b.newPage({ viewport });
  await p.goto('http://127.0.0.1:5199/');
  await p.evaluate(() => localStorage.removeItem('dnd-world.sceneDoc.v1'));
  await p.goto('http://127.0.0.1:5199/?edit=1&time=12');
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });

  // Baum aus Palette auswaehlen + platzieren
  const tree = await p.$('div[data-type="tree.leafy"]');
  await tree.click();
  await p.waitForTimeout(100);
  await p.mouse.move(800, 600);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape');

  // Baum nochmal anklicken -> Selected
  await p.mouse.move(800, 600);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(200);

  // Bruecke platzieren
  const br = await p.$('div[data-type="bridge.wood"]');
  await br.click();
  await p.waitForTimeout(100);
  await p.mouse.move(1100, 650);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(200);

  // Screenshot im Bauen-Modus mit Objekt
  await p.screenshot({ path: path.join(SHOT_DIR, 'shot-editor-build-selected.png'), fullPage: false });

  // Laterne (light.streetlamp) platzieren fuer Lichter-Demo
  const lamp = await p.$('div[data-type="light.streetlamp"]');
  await lamp.click();
  await p.waitForTimeout(100);
  await p.mouse.move(900, 550);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape');

  // Screenshot nach Platzierung
  await p.screenshot({ path: path.join(SHOT_DIR, 'shot-editor-lights.png'), fullPage: false });

  // Nachtmodus
  await p.evaluate(() => window.__applyTime(0));
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOT_DIR, 'shot-editor-lights-night.png'), fullPage: false });

  await b.close();
  console.log('editor screenshots done');
})().catch((e) => { console.error(e); process.exit(1); });
