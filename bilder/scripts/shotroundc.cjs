// Demonstrations-Screenshots fuer Runde C.
// Erzeugt sichtbare Terraforming-Huegel + Paint-Flecken an definierten Stellen,
// macht Day+Night-Screenshots und speichert:
//   docs/editor-roundc-raise.png  (Terrain-Berg)
//   docs/editor-roundc-paint-area.png  (bunter Fleck auf Wiese)
//   docs/editor-roundc-all.png  (Berg+Paint kombiniert, Tag)
const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const URL_EDIT = 'http://127.0.0.1:5199/?edit=1';
const SHOT_DIR = path.join(__dirname, '..', 'docs');

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'],
  });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });

  await p.goto('http://127.0.0.1:5199/');
  await p.evaluate(() => localStorage.removeItem('dnd-world.sceneDoc.v1'));

  await p.goto(URL_EDIT);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });
  await p.waitForTimeout(400);

  // Aktiviere Terrain-Pinsel + heble einen deutlichen Berg an einer Wiese neben dem Dorf.
  // Dorfplatz liegt bei ~(villageX, villageZ). Wir nehmen (villageX - 22, villageZ + 8).
  await p.evaluate(() => {
    const ed = window.__editor;
    ed.setEditMode(true);
    // Terrain-Tab + Pinsel an + grossen Radius / starke Hebung
    ed._setActiveTab('terrain');
    ed._toggleTerrainBrush();
    const tt = ed.terrainTool;
    tt.setRadius(7.0);
    tt.setStrength(1.0);
    tt.setMode('raise');
  });

  // Strich 1: Berg aufbauen (mehrere Klicks fuer deutlich hoher Berg).
  await p.evaluate(() => {
    const t = window.__editor.terrainTool;
    const cx = -22, cz = 8;
    for (let i = 0; i < 6; i++) {
      t.onPointerDown(cx + Math.cos(i) * 0.6, cz + Math.sin(i) * 0.6);
      for (let k = 0; k < 4; k++) t.onPointerMove(cx + Math.cos(i + k * 0.2) * 1.2, cz + Math.sin(i + k * 0.2) * 1.2);
      t.onPointerUp();
    }
  });
  await p.waitForTimeout(100);

  // Pinsel aus, Kamera auf den Huegel schwenken.
  await p.evaluate(() => {
    const ed = window.__editor;
    ed.terrainTool.setActive(false);
    // Tageslicht fuer bessere Sichtbarkeit.
    window.__applyTime(12);
    // Kamera auf Berg
    ed.camera.position.set(-10, 16, 22);
    ed._ctrl = window.__ctrl;
    window.__ctrl.target.set(-22, 3, 8);
    window.__ctrl.update();
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(SHOT_DIR, 'editor-roundc-raise.png') });

  // Paint: deutlicher Sandfleck neben dem Berg.
  await p.evaluate(() => {
    const ed = window.__editor;
    ed._setActiveTab('paint');
    ed._togglePaintBrush();
    const t = ed.terrainTool;
    t.setRadius(5.0);
    t.setStrength(1.0);
  });
  // Material-Streifen: Sand -> Stein -> Blumen
  await p.evaluate(() => {
    const t = window.__editor.terrainTool;
    const baseX = -14, baseZ = 14;
    const mats = [4, 6, 7]; // Sand, Stein, Blumen
    for (let i = 0; i < mats.length; i++) {
      t.setPaintMat(mats[i]);
      const cx = baseX + i * 4;
      t.onPointerDown(cx, baseZ);
      for (let k = 0; k < 6; k++) t.onPointerMove(cx + k * 0.3, baseZ + (k % 2 ? 0.2 : -0.2));
      t.onPointerUp();
    }
    t.setActive(false);
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOT_DIR, 'editor-roundc-paint-area.png') });

  // Komplett-Ansicht (Tag) mit Berg + bemaltem Streifen
  await p.evaluate(() => {
    window.__ctrl.target.set(-15, 1.5, 12);
    window.__editor.camera.position.set(2, 20, 32);
    window.__ctrl.update();
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOT_DIR, 'editor-roundc-all.png') });

  // Night-screenshot: Pinsel aus, Zeit auf 22
  await p.evaluate(() => { window.__applyTime(22); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOT_DIR, 'editor-roundc-night.png') });

  await b.close();
  console.log('shots done');
})().catch((e) => { console.error(e); process.exit(1); });
