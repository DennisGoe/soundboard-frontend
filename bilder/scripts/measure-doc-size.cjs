// Misst die Serialisierungsgroesse eines SceneDoc bei max. Terrain-/Paint-Edits.
// Benutzung: node scripts/measure-doc-size.cjs <URL>
const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const URL = process.argv[2] || 'http://127.0.0.1:5200/bilder/?edit=1';

(async () => {
  const b = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'],
  });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto(URL);
  await p.evaluate(() => { try { localStorage.removeItem('dnd-world.sceneDoc.v1'); } catch (e) {} });
  await p.reload();
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });

  // 1. Baseline: leeres Doc = defaultDoc
  const empty = await p.evaluate(() => {
    const d = window.__editor.doc;
    return JSON.stringify(d).length;
  });
  console.log('empty doc bytes:', empty);

  // 2. Volles Terrain + Paint grid simulieren: alle Zellen auf delta/material setzen.
  //    heightEdits / paintEdits haben 192x192 = 36864 Zellen.
  const filled = await p.evaluate(async () => {
    const he = await import('/bilder/assets/index-BVyPt2nk.js').catch(() => null);
    // Fallback: direkt ueber editor._applyOp-Routen -> das ist unpraktisch.
    // Stattdessen: wir simulieren "voller Grid" indem wir terrainTool strokes
    // ueber die ganze Karte malen. Das ist die realistischste Obergrenze.
    const ed = window.__editor;
    ed.setEditMode(true);
    ed._setActiveTab('paint');
    ed._selectPaintMat(1);
    ed._togglePaintBrush();
    // Fetten Pinsel setzen
    ed.terrainTool.setRadius(15);
    ed.terrainTool.setStrength(1.0);
    // Rastermalen ueber 60x60m Welt in 6er-Schritten.
    for (let x = -60; x <= 60; x += 6) {
      for (let z = -60; z <= 60; z += 6) {
        ed.terrainTool.onPointerDown(x, z);
        ed.terrainTool.onPointerMove(x, z);
        ed.terrainTool.onPointerUp();
      }
    }
    // Jetzt Gelaende raise+lower ebenso.
    ed._setActiveTab('terrain');
    ed._selectTerrainMode('raise');
    ed._toggleTerrainBrush();
    ed.terrainTool.setRadius(12);
    ed.terrainTool.setStrength(1.0);
    for (let x = -60; x <= 60; x += 8) {
      for (let z = -60; z <= 60; z += 8) {
        ed.terrainTool.onPointerDown(x, z);
        ed.terrainTool.onPointerMove(x, z);
        ed.terrainTool.onPointerUp();
      }
    }
    // Serialisieren wie markDirty das macht.
    try {
      const { exportHeightGrid } = await import('/bilder/assets/index-BVyPt2nk.js').catch(() => ({}));
    } catch (e) { /* ignore - direkter Export ueber markDirty-Pfad */ }
    // Direkt die SaveToStorage-Routine triggern (die serialisiert terrain+paint)
    ed._markDirty();
    await new Promise((r) => setTimeout(r, 1000));
    return {
      total: JSON.stringify(ed.doc).length,
      terrain: ed.doc.terrain ? ed.doc.terrain.length : 0,
      paint: ed.doc.paint ? ed.doc.paint.length : 0,
      objects: ed.doc.objects.length,
    };
  });
  console.log('filled doc bytes:', filled);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
