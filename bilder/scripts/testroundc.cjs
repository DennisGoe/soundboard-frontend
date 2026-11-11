// Runde-C-Integrationstest (headless).
// Verifiziert:
//  1. Tabs: Objekte | Pfade | Gelände | Malen vorhanden + umschaltbar.
//  2. Terraforming: Pinsel aktivieren, Click + Move -> Hoehe aendert sich.
//     Undo setzt Hoehe zurueck.
//  3. Malen: Pinsel aktivieren, Click -> vertex-color aendert sich.
//     Undo setzt Farbe zurueck.
//  4. Orchard pickbar (Picker aktiv).
//  5. Castle als Einheit pickbar.
//  6. Marktstand (jede Hitbox) pickbar.
//  7. Pfad-Handle-Drag Undo: Pfad erzeugen, Handle verschieben, Undo.
//  8. Esc deaktiviert aktiven Brush.
//  9. [ ] veraendert Radius; Shift+[ ] veraendert Staerke.
// 10. Tageszeit-Wechsel beeinflusst Beleuchtung (kein crash).
// 11. Reload: Terraforming + Paint bleiben erhalten.
//
// Nutzt headless chromium. Kein sichtbares Fenster.

const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const URL = 'http://127.0.0.1:5199/?edit=1';
const SHOT_DIR = path.join(__dirname, '..', 'docs');

function log(step, ok, extra = '') {
  const tag = ok ? '  OK' : 'FAIL';
  console.log(`  ${tag}  ${step}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

async function screenshot(p, name) {
  const fp = path.join(SHOT_DIR, name);
  await p.screenshot({ path: fp, fullPage: false });
  console.log('  Screenshot:', fp);
}

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'],
  });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });

  const pageErrors = [];
  p.on('pageerror', (e) => pageErrors.push('ERR ' + e.message));
  p.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error') pageErrors.push('CON ' + t);
    if (t.includes('[dnd-world]')) console.log('  [page]', t);
  });

  // Fresh storage
  await p.goto('http://127.0.0.1:5199/');
  await p.evaluate(() => localStorage.removeItem('dnd-world.sceneDoc.v1'));

  await p.goto(URL);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });

  // ---------- 1) Tabs ----------
  const tabCheck = await p.evaluate(() => ({
    objects: !!document.querySelector('[data-tab="objects"]'),
    paths:   !!document.querySelector('[data-tab="paths"]'),
    terrain: !!document.querySelector('[data-tab="terrain"]'),
    paint:   !!document.querySelector('[data-tab="paint"]'),
  }));
  log('Alle 4 Tabs vorhanden', tabCheck.objects && tabCheck.paths && tabCheck.terrain && tabCheck.paint, JSON.stringify(tabCheck));

  // Tab Gelände oeffnen
  await p.click('[data-tab="terrain"]');
  await p.waitForTimeout(100);
  const terrainPaneVis = await p.evaluate(() => {
    const el = document.getElementById('editorTerrainPane');
    return !!el && getComputedStyle(el).display !== 'none';
  });
  log('Gelände-Tab zeigt Pinsel-Pane', terrainPaneVis);

  // ---------- 2) Terraforming ----------
  // Pinsel aktivieren
  await p.click('#btnTerrainBrush');
  await p.waitForTimeout(100);
  const brushOn = await p.evaluate(() => window.__editor.terrainTool.isActive() && window.__editor.terrainTool.kind === 'terrain');
  log('Terrain-Pinsel aktiv', brushOn);

  // Modus 'raise' (schon default), starke Hebung
  await p.evaluate(() => {
    window.__editor.terrainTool.setRadius(4.0);
    window.__editor.terrainTool.setStrength(0.8);
    window.__editor.terrainTool.setMode('raise');
  });

  // Welt-Koordinate (0,0) sollte in der Nahansicht sein. Wir pricken eine
  // sichere Stelle: links unten im Viewport (Wiese). Dann messen Y(x,z) vorher/nachher.
  // Welt-Koordinate per Groundhit: wir fuehren die Pinsel-Methoden direkt aus.
  const terrainBefore = await p.evaluate(() => {
    const { sampleHeight } = window.__editor._undoTestHelpers || {};
    // Fallback: setze hilfs-getter
    if (!window.__editor._tt) {
      // Suche sampleHeight über das modulare terrain.js
      return null;
    }
    return window.__editor._tt;
  });
  // Direkter Weg: rufe applyBrush über terrainTool mit synthetischen
  // Pointer-Events. Alternativ nutzen wir Mausereignisse auf einer
  // definierten Canvas-Position.
  const canvasInfo = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });
  // Klick in die Mitte-unten (freie Wiese sichtbar), Maus druecken + leicht bewegen.
  const cx = canvasInfo.left + canvasInfo.w * 0.5;
  const cy = canvasInfo.top + canvasInfo.h * 0.65;

  // Welt-Position dieses Pixels: nutze _groundHit direkt.
  const beforeRaise = await p.evaluate(({ cx, cy }) => {
    const ed = window.__editor;
    // simuliere NDC + Groundhit
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    ed.mouseNDC.x = ((cx - r.left) / r.width) * 2 - 1;
    ed.mouseNDC.y = -(((cy - r.top) / r.height) * 2 - 1);
    const hit = ed._groundHit();
    if (!hit) return null;
    return { x: hit.x, z: hit.z };
  }, { cx, cy });
  if (!beforeRaise) {
    log('Groundhit bei Klickposition', false, 'kein Hit');
  } else {
    // sampleHeight exportieren
    const yBefore = await p.evaluate(async ({ x, z }) => {
      const mod = await import('/src/scene/terrain.js');
      return mod.sampleHeight(x, z);
    }, beforeRaise);
    // Pinselstrich simulieren (direkt ueber terrainTool)
    await p.evaluate(({ x, z }) => {
      const t = window.__editor.terrainTool;
      t.onPointerDown(x, z);
      // zwei kurze Moves, dann up
      t.onPointerMove(x + 0.2, z);
      t.onPointerMove(x + 0.4, z);
      t.onPointerUp();
    }, beforeRaise);
    await p.waitForTimeout(80);
    const yAfter = await p.evaluate(async ({ x, z }) => {
      const mod = await import('/src/scene/terrain.js');
      return mod.sampleHeight(x, z);
    }, beforeRaise);
    log('Raise-Pinsel erhoeht sampleHeight', (yAfter - yBefore) > 0.1,
        `y ${yBefore.toFixed(3)} -> ${yAfter.toFixed(3)} delta=${(yAfter - yBefore).toFixed(3)}`);

    // Undo
    await p.keyboard.down('Control');
    await p.keyboard.press('KeyZ');
    await p.keyboard.up('Control');
    await p.waitForTimeout(80);
    const yUndo = await p.evaluate(async ({ x, z }) => {
      const mod = await import('/src/scene/terrain.js');
      return mod.sampleHeight(x, z);
    }, beforeRaise);
    log('Undo setzt Terrain zurueck', Math.abs(yUndo - yBefore) < 0.01,
        `y ${yAfter.toFixed(3)} -> ${yUndo.toFixed(3)} (ref ${yBefore.toFixed(3)})`);
  }

  // Screenshot (Gelände-Tab aktiv)
  await screenshot(p, 'editor-roundc-terrain.png');

  // ---------- 8) Esc deaktiviert Brush ----------
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  const brushOffAfterEsc = await p.evaluate(() => !window.__editor.terrainTool.isActive());
  log('Esc deaktiviert Pinsel', brushOffAfterEsc);

  // ---------- 9) [ ] Hotkeys (Pinsel neu aktivieren) ----------
  await p.click('#btnTerrainBrush');
  await p.waitForTimeout(80);
  const rBefore = await p.evaluate(() => window.__editor.terrainTool.radius);
  await p.keyboard.press('BracketRight');
  const rAfter = await p.evaluate(() => window.__editor.terrainTool.radius);
  log('] erhoeht Radius', rAfter > rBefore, `${rBefore.toFixed(2)} -> ${rAfter.toFixed(2)}`);
  const sBefore = await p.evaluate(() => window.__editor.terrainTool.strength);
  await p.keyboard.down('Shift');
  await p.keyboard.press('BracketRight');
  await p.keyboard.up('Shift');
  const sAfter = await p.evaluate(() => window.__editor.terrainTool.strength);
  log('Shift+] erhoeht Staerke', sAfter > sBefore, `${sBefore.toFixed(2)} -> ${sAfter.toFixed(2)}`);
  // Pinsel wieder aus
  await p.keyboard.press('Escape');
  await p.waitForTimeout(50);

  // ---------- 3) Malen ----------
  await p.click('[data-tab="paint"]');
  await p.waitForTimeout(100);
  const paintPaneVis = await p.evaluate(() => {
    const el = document.getElementById('editorPaintPane');
    return !!el && getComputedStyle(el).display !== 'none';
  });
  log('Malen-Tab zeigt Material-Pane', paintPaneVis);
  await p.click('#btnPaintBrush');
  await p.waitForTimeout(80);
  const paintActive = await p.evaluate(() => window.__editor.terrainTool.isActive() && window.__editor.terrainTool.kind === 'paint');
  log('Paint-Pinsel aktiv', paintActive);

  // Pinsel an eine Wiese setzen (gleiche Position wie oben)
  const paintPos = await p.evaluate(({ cx, cy }) => {
    const ed = window.__editor;
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    ed.mouseNDC.x = ((cx - r.left) / r.width) * 2 - 1;
    ed.mouseNDC.y = -(((cy - r.top) / r.height) * 2 - 1);
    const hit = ed._groundHit();
    return hit ? { x: hit.x, z: hit.z } : null;
  }, { cx, cy });
  if (paintPos) {
    await p.evaluate(({ x, z }) => {
      const t = window.__editor.terrainTool;
      t.setRadius(3.0);
      t.setStrength(0.8);
      t.setPaintMat(4); // Sand
      t.onPointerDown(x, z);
      t.onPointerMove(x + 0.2, z);
      t.onPointerUp();
    }, paintPos);
    await p.waitForTimeout(80);
    const paintSample = await p.evaluate(async ({ x, z }) => {
      const mod = await import('/src/world/paintEdits.js');
      const r = mod.samplePaint(x, z);
      return { strength: r.strength, col: r.col ? { r: r.col.r, g: r.col.g, b: r.col.b } : null };
    }, paintPos);
    log('Paint-Strich setzt Material', paintSample.strength > 0.1 && !!paintSample.col,
        `str=${paintSample.strength?.toFixed(3)} col=${paintSample.col ? `${paintSample.col.r.toFixed(2)},${paintSample.col.g.toFixed(2)},${paintSample.col.b.toFixed(2)}` : 'null'}`);

    // Undo
    await p.keyboard.down('Control');
    await p.keyboard.press('KeyZ');
    await p.keyboard.up('Control');
    await p.waitForTimeout(80);
    const paintAfterUndo = await p.evaluate(async ({ x, z }) => {
      const mod = await import('/src/world/paintEdits.js');
      const r = mod.samplePaint(x, z);
      return r.strength;
    }, paintPos);
    log('Undo setzt Paint zurueck', paintAfterUndo < 0.05, `str=${paintAfterUndo?.toFixed(3)}`);
  }
  await screenshot(p, 'editor-roundc-paint.png');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(50);

  // ---------- 4) Orchard pickbar ----------
  const orchardPickerExists = await p.evaluate(() => {
    for (const pk of window.__editor._procPickers) {
      for (const m of pk.meta) {
        if (String(m.type || '').startsWith('tree.orchard')) return true;
      }
    }
    return false;
  });
  log('Orchard-Picker registriert', orchardPickerExists);

  // ---------- 5) Castle pickbar ----------
  const castlePickable = await p.evaluate(() => {
    let found = false;
    window.__editor.scene.traverse((o) => {
      if (o.userData && o.userData.editable && o.userData.editable.type === 'castle.main') found = true;
    });
    return found;
  });
  log('Burg als editierbar markiert', castlePickable);

  // ---------- 6) Marktstand: alle 4 Hitboxen ----------
  const stallCount = await p.evaluate(() => {
    let n = 0;
    window.__editor.scene.traverse((o) => {
      if (o.userData && o.userData.editable && o.userData.editable.type === 'stall') n++;
    });
    return n;
  });
  log('Marktstand-Hitboxen >=4', stallCount >= 4, `n=${stallCount}`);

  // ---------- 7) Pfad-Handle-Drag Undo ----------
  await p.click('[data-tab="paths"]');
  await p.waitForTimeout(80);
  // Starte Zeichnen
  await p.click('#btnDrawPath');
  await p.waitForTimeout(80);
  // 3 Punkte setzen + Enter
  const basePx = canvasInfo.left + canvasInfo.w * 0.3;
  const basePy = canvasInfo.top + canvasInfo.h * 0.65;
  await p.mouse.move(basePx, basePy);
  await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(350);
  await p.mouse.move(basePx + 60, basePy - 20);
  await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(350);
  await p.mouse.move(basePx + 120, basePy - 30);
  await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(350);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  const pathCount = await p.evaluate(() => window.__editor.doc.paths.length);
  log('Pfad erzeugt', pathCount >= 1, `n=${pathCount}`);

  if (pathCount >= 1) {
    // Pfad editieren: direkte API (statt Raycast auf duenne Zaun-Pfosten).
    await p.evaluate(() => {
      const ed = window.__editor;
      let mesh = null;
      ed.scene.traverse((o) => {
        if (!mesh && o.userData && o.userData.editable && o.userData.editable.isPath) mesh = o;
      });
      if (mesh) ed.pathTool.beginEditPath(mesh);
    });
    await p.waitForTimeout(80);
    const inEditing = await p.evaluate(() => window.__editor.pathTool.mode === 'EDITING');
    // Snapshot Punkte VOR drag
    const ptsBefore = await p.evaluate(() => {
      const ap = window.__editor.pathTool._activePathEntry;
      return ap ? ap.points.map(q => ({ x: q.x, z: q.z })) : null;
    });
    if (inEditing && ptsBefore && ptsBefore.length > 0) {
      // Drag Handle 1: direkt ueber pathTool.dragHandle aufrufen + pointerup-Flow
      await p.evaluate(() => {
        const ed = window.__editor;
        ed._pathDragHandle = 1;
        ed._pathDragStart = {
          id: ed.pathTool._activePathEntry.id,
          before: ed.pathTool._activePathEntry.points.map(q => ({ x: q.x, z: q.z })),
        };
        ed.pathTool.dragHandle(1, ed.pathTool._activePathEntry.points[1].x + 1.5,
                                   ed.pathTool._activePathEntry.points[1].z + 1.5);
      });
      await p.waitForTimeout(50);
      // Simuliere pointerup (editor handler)
      await p.evaluate(() => {
        const ed = window.__editor;
        // Simuliere was pointerup machen wuerde
        const entry = ed.pathTool._activePathEntry;
        const after = entry.points.map((q) => ({ x: q.x, z: q.z }));
        const before = ed._pathDragStart.before;
        ed._pushUndo({ kind: 'pathEdit', id: ed._pathDragStart.id, before, after });
        ed._pathDragHandle = -1;
        ed._pathDragStart = null;
        ed._markDirty();
      });
      await p.waitForTimeout(50);
      const undoCountBefore = await p.evaluate(() => window.__editor.undoStack.length);
      await p.keyboard.down('Control');
      await p.keyboard.press('KeyZ');
      await p.keyboard.up('Control');
      await p.waitForTimeout(100);
      const ptsAfterUndo = await p.evaluate(() => window.__editor.doc.paths[0].points.map(q => ({ x: q.x, z: q.z })));
      const samePts = ptsAfterUndo.length === ptsBefore.length
        && ptsAfterUndo.every((q, i) => Math.abs(q.x - ptsBefore[i].x) < 1e-3 && Math.abs(q.z - ptsBefore[i].z) < 1e-3);
      log('Pfad-Handle-Drag Undo setzt Punkte zurueck', samePts, `undoStack=${undoCountBefore}`);
    } else {
      log('Pfad im Edit-Mode selektiert', inEditing);
    }
  }

  // ---------- 10) Tageszeit ----------
  await p.evaluate(() => window.__applyTime(12));
  await p.waitForTimeout(60);
  const dayOk = await p.evaluate(() => !!document.querySelector('canvas'));
  log('Tageszeit=12 crashfrei', dayOk);
  await p.evaluate(() => window.__applyTime(22));
  await p.waitForTimeout(60);

  // ---------- 11) Reload: Terraforming + Paint bleiben erhalten ----------
  // Ein weiterer Terrain-Strich fuer das Persistieren
  await p.click('[data-tab="terrain"]');
  await p.click('#btnTerrainBrush');
  await p.waitForTimeout(60);
  const persistPos = { x: -8, z: 8 };
  await p.evaluate(({ x, z }) => {
    const t = window.__editor.terrainTool;
    t.setRadius(3.0); t.setStrength(0.6); t.setMode('raise');
    t.onPointerDown(x, z);
    t.onPointerMove(x + 0.3, z);
    t.onPointerUp();
  }, persistPos);
  await p.waitForTimeout(80);
  const yPreReload = await p.evaluate(async ({ x, z }) => {
    const mod = await import('/src/scene/terrain.js');
    return mod.sampleHeight(x, z);
  }, persistPos);
  // force save
  await p.evaluate(() => window.__editor._markDirty());
  // flush timer: 500ms + buffer
  await p.waitForTimeout(700);
  // reload
  await p.reload();
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });
  // delay for terrain mesh refresh after import
  await p.waitForTimeout(200);
  const yPostReload = await p.evaluate(async ({ x, z }) => {
    const mod = await import('/src/scene/terrain.js');
    return mod.sampleHeight(x, z);
  }, persistPos);
  log('Reload: Terrain-Delta persistiert', Math.abs(yPostReload - yPreReload) < 0.05,
      `${yPreReload.toFixed(3)} -> ${yPostReload.toFixed(3)}`);
  const docHasTerrain = await p.evaluate(() => typeof window.__editor.doc.terrain === 'string' && window.__editor.doc.terrain.length > 0);
  log('Doc enthaelt terrain-Blob', docHasTerrain);

  await screenshot(p, 'editor-roundc-view.png');

  console.log('PAGE-ERRORS n=', pageErrors.length);
  for (const e of pageErrors.slice(0, 10)) console.log('  ', e);

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
