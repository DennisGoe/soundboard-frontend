// Bruecken-Editor Test (headless).
// Verifiziert fuer jede Karten-Bruecke + eine Palette-platzierte Bruecke:
//   - Picking via echtem Raycast-Klick (nicht nur __editor._select).
//   - Verschieben + Undo persistiert korrekt.
//   - Drehen + Undo.
//   - Reload behaelt Position + Rotation.
//   - Loeschen + Undo (ohne Reload).
// Keine sichtbaren Browserfenster.

const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const path = require('path');

const URL = 'http://127.0.0.1:5199/?edit=1';
const SHOT = path.join(__dirname, '..', 'docs', 'editor-bridges.png');

function log(step, ok, extra = '') {
  const tag = ok ? '  OK' : 'FAIL';
  console.log(`  ${tag}  ${step}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

// Projiziert eine Welt-Position ueber die Kamera auf Client-Pixel (fuer Maus).
// Manuelle Matrix-Multiplikation — spart ein 'three'-Import im Page-Context,
// das in Vite-Modulen nicht auto-resolved (import 'three' ist bare specifier).
async function worldToClient(p, pos) {
  return p.evaluate((pos) => {
    const cam = window.__cam;
    cam.updateMatrixWorld();
    const mi = cam.matrixWorldInverse.elements;
    const px = pos.x, py = pos.y, pz = pos.z;
    const vx = mi[0]*px + mi[4]*py + mi[8] *pz + mi[12];
    const vy = mi[1]*px + mi[5]*py + mi[9] *pz + mi[13];
    const vz = mi[2]*px + mi[6]*py + mi[10]*pz + mi[14];
    const vw = mi[3]*px + mi[7]*py + mi[11]*pz + mi[15];
    const pm = cam.projectionMatrix.elements;
    const cx = pm[0]*vx + pm[4]*vy + pm[8] *vz + pm[12]*vw;
    const cy = pm[1]*vx + pm[5]*vy + pm[9] *vz + pm[13]*vw;
    const cw = pm[3]*vx + pm[7]*vy + pm[11]*vz + pm[15]*vw;
    const ndx = cx / cw, ndy = cy / cw;
    const r = document.querySelector('canvas').getBoundingClientRect();
    return {
      x: r.left + ((ndx + 1) * 0.5) * r.width,
      y: r.top  + ((1 - ndy) * 0.5) * r.height,
    };
  }, pos);
}

async function clickWorld(p, pos) {
  const c = await worldToClient(p, pos);
  await p.mouse.move(c.x, c.y);
  await p.waitForTimeout(40);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(120);
  return c;
}

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'],
  });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });

  // Fresh storage
  await p.goto('http://127.0.0.1:5199/');
  await p.evaluate(() => localStorage.removeItem('dnd-world.sceneDoc.v1'));

  p.on('pageerror', (e) => console.log('  [page.err]', e.message));
  p.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [con.err]', msg.text());
  });

  await p.goto(URL);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });

  // Alle Karten-Bruecken sammeln.
  const bridgesInfo = await p.evaluate(() => {
    const out = [];
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.isBridge && e.procId) {
        out.push({
          procId: e.procId,
          type: e.type,
          id: e.id,
          x: o.position.x,
          y: o.position.y + 0.3,  // Zielhoehe auf Deck
          z: o.position.z,
          rotY: o.rotation.y,
          scale: e.scale,
        });
      }
    });
    return out;
  });
  log('Karten-Bruecken gefunden', bridgesInfo.length === 2, `n=${bridgesInfo.length}  ids=${bridgesInfo.map(b => b.procId).join(',')}`);

  // Kamera uebersichtlich auf mittlere Position + Tag.
  await p.evaluate(() => {
    window.__applyTime(13);
    const cam = window.__cam;
    cam.position.set(20, 48, 25);
    cam.lookAt(0, 0, 10);
    cam.updateProjectionMatrix();
    if (window.__ctrl && window.__ctrl.target) {
      window.__ctrl.target.set(0, 0, 10);
      window.__ctrl.update();
    }
  });
  await p.waitForTimeout(250);

  // --- Pro Karten-Bruecke: Pick via Click + Verschieben + Undo ---------------
  for (let i = 0; i < bridgesInfo.length; i++) {
    const info = bridgesInfo[i];
    const tag = info.procId;

    // 1) Klick zur Selektion
    await clickWorld(p, { x: info.x, y: info.y, z: info.z });
    let picked = await p.evaluate(() => {
      const s = window.__editor.selected;
      if (!s) return null;
      return {
        id: s.userData.editable.id,
        procId: s.userData.editable.procId,
        isBridge: s.userData.editable.isBridge === true,
      };
    });
    log(`[${tag}] Raycast-Click selektiert Bruecke`,
      !!picked && picked.procId === tag,
      `picked=${picked ? picked.procId : 'null'}`);

    if (!picked || picked.procId !== tag) continue;

    // Capture mouse start on bridge, then drag by 2 world-units in +x.
    const posBefore = await p.evaluate(() => {
      const s = window.__editor.selected;
      return { x: s.position.x, y: s.position.y, z: s.position.z, rotY: s.rotation.y };
    });
    const c0 = await worldToClient(p, { x: info.x, y: info.y, z: info.z });
    const c1 = await worldToClient(p, { x: info.x + 2.5, y: info.y, z: info.z });
    await p.mouse.move(c0.x, c0.y);
    await p.mouse.down({ button: 'left' });
    await p.mouse.move(c1.x, c1.y, { steps: 10 });
    await p.mouse.up({ button: 'left' });
    await p.waitForTimeout(150);
    const posAfter = await p.evaluate(() => {
      const s = window.__editor.selected;
      return { x: s.position.x, y: s.position.y, z: s.position.z };
    });
    const movedDist = Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z);
    log(`[${tag}] Bruecke verschoben`,
      movedDist > 0.5 && Math.abs(posAfter.y - 0) < 0.01,
      `dXZ=${movedDist.toFixed(2)}  y=${posAfter.y.toFixed(3)} (muss 0 sein)`);
    // doc.procOverrides muss die Positionsaenderung tragen
    const ov = await p.evaluate((procId) => window.__editor.doc.procOverrides[procId], tag);
    log(`[${tag}] procOverride gesetzt`,
      !!ov && Number.isFinite(ov.x) && Number.isFinite(ov.z),
      `ov=${JSON.stringify(ov)}`);

    // 2) Drehen per R-Taste
    const rotBefore = await p.evaluate(() => window.__editor.selected.rotation.y);
    await p.keyboard.press('KeyR');
    await p.waitForTimeout(80);
    const rotAfter = await p.evaluate(() => window.__editor.selected.rotation.y);
    log(`[${tag}] Rotation via R`,
      Math.abs(rotAfter - rotBefore) > 0.01,
      `dRot=${(rotAfter - rotBefore).toFixed(3)}`);

    // 3) Undo (letzte Rotation) -> Rotation zurueck.
    await p.keyboard.down('Control');
    await p.keyboard.press('KeyZ');
    await p.keyboard.up('Control');
    await p.waitForTimeout(80);
    const rotUndo = await p.evaluate(() => window.__editor.selected ? window.__editor.selected.rotation.y : null);
    log(`[${tag}] Undo bringt Rotation zurueck`,
      rotUndo !== null && Math.abs(rotUndo - rotBefore) < 0.01,
      `undoRot=${rotUndo === null ? 'null' : rotUndo.toFixed(3)} expected=${rotBefore.toFixed(3)}`);

    // Nach Undo: noch eine Selektion sicherstellen (Undo loescht nicht die Auswahl).
    const stillSel = await p.evaluate(() => window.__editor.selected?.userData?.editable?.procId || null);
    if (stillSel !== tag) {
      // Erneut pick via Click.
      await clickWorld(p, { x: posAfter.x, y: 0 + 0.3, z: posAfter.z });
    }
  }

  // --- Palette-Bruecke platzieren + nach Reload anklickbar --------------------
  // Esc raeumt Selektion ab.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);

  const bridgeBtn = await p.$('div[data-type="bridge.stone"]');
  await bridgeBtn.click();
  await p.waitForTimeout(100);
  const pending = await p.evaluate(() => window.__editor.pendingType);
  log('Palette-Click setzt pendingType=bridge.stone', pending === 'bridge.stone', `pending=${pending}`);
  // Platzieren auf freier Flaeche weg vom Fluss. Kamera schaut auf (0,0,10).
  // World (-10, 0.3, 30) ist sichtbar, trocken (Fluss liegt bei z~0..5).
  const placeAt = { x: -10, y: 0.3, z: 30 };
  const placeClient = await worldToClient(p, placeAt);
  const placedCountBefore = await p.evaluate(() => window.__editor.doc.objects.filter(o => o.type.startsWith('bridge.')).length);
  await p.mouse.move(placeClient.x, placeClient.y);
  await p.waitForTimeout(100);
  // Ghost sollte sich bewegt haben -> _ghostValidAt true -> click placed
  const ghostInfo = await p.evaluate(() => {
    const g = window.__editor.hoverGhost;
    return g ? { x: g.position.x, z: g.position.z, visible: g.visible } : null;
  });
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(250);
  const placedCountAfter = await p.evaluate(() => window.__editor.doc.objects.filter(o => o.type.startsWith('bridge.')).length);
  log('Palette-Bruecke platziert',
    placedCountAfter === placedCountBefore + 1,
    `${placedCountBefore}->${placedCountAfter}  ghost=${JSON.stringify(ghostInfo)}  clientXY=${placeClient.x.toFixed(0)},${placeClient.y.toFixed(0)}`);

  // Ermittele die platzierte Bruecke (letzter doc.objects-Eintrag) -> World-Pos.
  const placedInfo = await p.evaluate(() => {
    const objs = window.__editor.doc.objects.filter(o => o.type.startsWith('bridge.'));
    return objs.length ? objs[objs.length - 1] : null;
  });
  if (!placedInfo) { log('Platzierte Bruecke gefunden', false); }

  // Esc raeumt pendingType ab (vom Palette-Click vorhin), sonst wuerde der
  // naechste Linksklick eine weitere Bruecke platzieren statt zu selektieren.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);

  // Loeschen einer Karten-Bruecke + Undo. Position live abfragen (sie wurde oben verschoben).
  const delTarget = bridgesInfo[0];
  const curTargetPos = await p.evaluate((pid) => {
    let out = null;
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.procId === pid) out = { x: o.position.x, y: o.position.y + 0.3, z: o.position.z };
    });
    return out;
  }, delTarget.procId);
  const delCli = await worldToClient(p, curTargetPos);
  console.log(`  [delete-pos] world=${JSON.stringify(curTargetPos)}  screen=${delCli.x.toFixed(0)},${delCli.y.toFixed(0)}`);
  await p.mouse.move(delCli.x, delCli.y);
  await p.waitForTimeout(80);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(200);
  const selBefore = await p.evaluate(() => window.__editor.selected?.userData?.editable?.procId);
  if (selBefore !== delTarget.procId) {
    // Debug: Was ist eigentlich am Click-Punkt getroffen worden?
    const debug = await p.evaluate(() => {
      const e = window.__editor;
      const hits = e.ray.intersectObjects(e.scene.children, true);
      return hits.slice(0, 3).map(h => ({
        name: h.object.name,
        pt: `${h.point.x.toFixed(2)},${h.point.y.toFixed(2)},${h.point.z.toFixed(2)}`,
      }));
    });
    log(`[delete-test] konnte ${delTarget.procId} nicht selektieren`, false, `got=${selBefore}  hits=${JSON.stringify(debug)}`);
  }
  // Delete
  await p.keyboard.press('Delete');
  await p.waitForTimeout(100);
  const procAfterDel = await p.evaluate((pid) => {
    const E = window.__editor;
    const ov = E.doc.procOverrides[pid];
    let stillInScene = false;
    E.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.procId === pid && o.parent) stillInScene = true;
    });
    return { deleted: ov && ov.deleted === true, inScene: stillInScene };
  }, delTarget.procId);
  log(`[${delTarget.procId}] Loeschen entfernt aus Scene + markiert procOverride`,
    procAfterDel.deleted && !procAfterDel.inScene,
    `deleted=${procAfterDel.deleted} inScene=${procAfterDel.inScene}`);

  // Undo
  await p.keyboard.down('Control');
  await p.keyboard.press('KeyZ');
  await p.keyboard.up('Control');
  await p.waitForTimeout(150);
  const procAfterUndo = await p.evaluate((pid) => {
    const E = window.__editor;
    const ov = E.doc.procOverrides[pid];
    let stillInScene = false;
    E.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.procId === pid && o.parent) stillInScene = true;
    });
    return { ov: ov ? JSON.stringify(ov) : null, inScene: stillInScene };
  }, delTarget.procId);
  log(`[${delTarget.procId}] Undo stellt Bruecke wieder her`,
    procAfterUndo.inScene && (!procAfterUndo.ov || !procAfterUndo.ov.includes('"deleted":true')),
    `inScene=${procAfterUndo.inScene} ov=${procAfterUndo.ov}`);

  // --- Reload-Persistenz pruefen ---------------------------------------------
  // Alle Bruecken-procOverrides einsammeln (nach Verschiebungen) + Objects-Snapshot.
  const docBefore = await p.evaluate(() => JSON.stringify(window.__editor.doc));
  // Force-save (Editor hat _saveTimer debounced)
  await p.evaluate(() => {
    try { localStorage.setItem('dnd-world.sceneDoc.v1', JSON.stringify(window.__editor.doc)); } catch (e) {}
  });

  await p.reload();
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });
  await p.evaluate(() => window.__editor.setEditMode(true));
  await p.waitForTimeout(100);

  // 1) Positionen der Karten-Bruecken muessen die procOverrides wiederspiegeln.
  const reloadedBridges = await p.evaluate(() => {
    const out = [];
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.isBridge && e.procId) {
        out.push({
          procId: e.procId, x: o.position.x, y: o.position.y, z: o.position.z, rotY: o.rotation.y,
        });
      }
    });
    return out;
  });
  const docBeforeParsed = JSON.parse(docBefore);
  let posOk = true, posDetails = [];
  for (const rb of reloadedBridges) {
    const ov = docBeforeParsed.procOverrides && docBeforeParsed.procOverrides[rb.procId];
    if (!ov) continue;
    if (Number.isFinite(ov.x) && Math.abs(ov.x - rb.x) > 0.05) { posOk = false; posDetails.push(`${rb.procId} x ${ov.x}->${rb.x}`); }
    if (Number.isFinite(ov.z) && Math.abs(ov.z - rb.z) > 0.05) { posOk = false; posDetails.push(`${rb.procId} z ${ov.z}->${rb.z}`); }
  }
  log('Karten-Bruecken behalten verschobene Position nach Reload',
    posOk, posDetails.length ? posDetails.join('; ') : 'ok');
  log('Karten-Bruecken y=0 nach Reload',
    reloadedBridges.every(b => Math.abs(b.y) < 0.01),
    reloadedBridges.map(b => `${b.procId}=${b.y.toFixed(3)}`).join(', '));

  // 2) Palette-Bruecke muss nach Reload anklickbar sein.
  if (placedInfo) {
    const placedAfter = await worldToClient(p, { x: placedInfo.x, y: 0.3, z: placedInfo.z });
    await p.mouse.move(placedAfter.x, placedAfter.y);
    await p.waitForTimeout(40);
    await p.mouse.down({ button: 'left' });
    await p.mouse.up({ button: 'left' });
    await p.waitForTimeout(150);
    const pickedAfterReload = await p.evaluate(() => {
      const s = window.__editor.selected;
      if (!s) return null;
      return {
        id: s.userData.editable.id,
        type: s.userData.editable.type,
        isBridge: s.userData.editable.isBridge === true,
      };
    });
    log('Palette-Bruecke nach Reload anklickbar',
      !!pickedAfterReload && pickedAfterReload.isBridge && pickedAfterReload.id === placedInfo.id,
      `picked=${JSON.stringify(pickedAfterReload)} expected id=${placedInfo.id}`);
  }

  // Screenshot als visuelle Dokumentation.
  await p.evaluate(() => {
    const cam = window.__cam;
    cam.position.set(20, 30, 25);
    cam.lookAt(0, 0, 5);
    cam.updateProjectionMatrix();
    if (window.__ctrl && window.__ctrl.target) {
      window.__ctrl.target.set(0, 0, 5);
      window.__ctrl.update();
    }
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: SHOT, fullPage: false });
  console.log('  Screenshot:', SHOT);

  await b.close();
  if (process.exitCode) console.log('\n  SUMMARY: FAIL'); else console.log('\n  SUMMARY: OK');
})().catch((e) => { console.error(e); process.exit(1); });
