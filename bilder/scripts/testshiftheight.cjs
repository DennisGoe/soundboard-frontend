// Shift+Drag (Hoehen-Modus) Test — headless.
// Verifiziert:
//   - Haus mit Shift ziehen -> y steigt, x/z unveraendert
//   - Undo setzt zurueck
//   - Reload behaelt die Hoehe (yOffset im doc)
//   - Terrain unter dem Objekt anheben -> Abstand zum Boden bleibt
//   - Prozedurales Objekt (Baum) ebenso
//   - Bruecke ebenso (base y != sampleHeight)
//   - Normaler Drag ohne Shift unveraendert
//
// Keine sichtbaren Browserfenster.
//

const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const path = require('path');

const URL = 'http://127.0.0.1:5199/?edit=1';
const SHOT = path.join(__dirname, '..', 'docs', 'editor-shift-height.png');

function log(step, ok, extra = '') {
  const tag = ok ? '  OK' : 'FAIL';
  console.log(`  ${tag}  ${step}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

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

async function setupCam(p, target = { x: 0, y: 0, z: 0 }, pos = { x: 20, y: 48, z: 25 }) {
  await p.evaluate(({ target, pos }) => {
    window.__applyTime(13);
    const cam = window.__cam;
    cam.position.set(pos.x, pos.y, pos.z);
    cam.lookAt(target.x, target.y, target.z);
    cam.updateProjectionMatrix();
    if (window.__ctrl && window.__ctrl.target) {
      window.__ctrl.target.set(target.x, target.y, target.z);
      window.__ctrl.update();
    }
  }, { target, pos });
  await p.waitForTimeout(200);
}

// Shift+Drag auf einem gegebenen Weltpunkt: shift gedrueckt halten, Maus von
// screen y_start auf y_end ziehen, dann loslassen.
async function shiftDragVertical(p, worldAnchor, deltaScreenY) {
  const c0 = await worldToClient(p, worldAnchor);
  await p.keyboard.down('Shift');
  await p.mouse.move(c0.x, c0.y);
  await p.waitForTimeout(40);
  await p.mouse.down({ button: 'left' });
  // Shift wird GEHALTEN waehrend der Mausbewegung.
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await p.mouse.move(c0.x, c0.y + deltaScreenY * t);
    await p.waitForTimeout(20);
  }
  await p.mouse.up({ button: 'left' });
  await p.keyboard.up('Shift');
  await p.waitForTimeout(120);
  return c0;
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
  p.on('console', (msg) => { if (msg.type() === 'error') console.log('  [con.err]', msg.text()); });

  await p.goto(URL);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });

  // ====================================================================
  // 1) Palette-Haus platzieren + Shift-Drag Hoehe
  // ====================================================================
  await setupCam(p, { x: 0, y: 0, z: 20 }, { x: 0, y: 25, z: 45 });

  // Haus platzieren an (6, 0, 20). Ueber Palette-Click + ground click.
  await p.evaluate(() => {
    const E = window.__editor;
    E.setEditMode(true);
  });
  const housePlace = { x: 6, y: 0.5, z: 20 };
  // Palette-Typ setzen via API
  await p.evaluate(() => {
    const E = window.__editor;
    E.pendingType = 'house.homeA_blue';
    E._spawnGhost('house.homeA_blue');
  });
  const houseCli = await worldToClient(p, housePlace);
  await p.mouse.move(houseCli.x, houseCli.y);
  await p.waitForTimeout(100);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(200);

  const house = await p.evaluate(() => {
    const E = window.__editor;
    const s = E.selected;
    return s ? {
      id: s.userData.editable.id,
      x: s.position.x, y: s.position.y, z: s.position.z,
      yOffset: s.userData.editable.yOffset || 0,
      type: s.userData.editable.type,
    } : null;
  });
  log('Haus platziert + selektiert', !!house && house.type === 'house.homeA_blue',
    `house=${JSON.stringify(house)}`);

  // pendingType zuruecksetzen, sonst platziert der naechste Klick eine Kopie.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  // Haus erneut per Click selektieren.
  const houseAnchor = { x: house.x, y: house.y + 0.5, z: house.z };
  const hc = await worldToClient(p, houseAnchor);
  await p.mouse.move(hc.x, hc.y);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(140);
  const selAgain = await p.evaluate(() => {
    const s = window.__editor.selected;
    return s ? s.userData.editable.id : null;
  });
  if (selAgain !== house.id) log('Haus erneut selektiert', false, `sel=${selAgain} expected=${house.id}`);

  // Shift-Drag: Maus nach OBEN schieben (negative screen-y) -> y steigt.
  await shiftDragVertical(p, houseAnchor, -220);  // screen -220 px => world +y

  const afterShift = await p.evaluate(() => {
    const s = window.__editor.selected;
    return {
      x: s.position.x, y: s.position.y, z: s.position.z,
      yOffset: s.userData.editable.yOffset || 0,
    };
  });
  log('Haus: Shift+Drag erhöht y, x/z unverändert',
    afterShift.y > house.y + 0.3
    && Math.abs(afterShift.x - house.x) < 0.05
    && Math.abs(afterShift.z - house.z) < 0.05
    && afterShift.yOffset > 0.3,
    `house y ${house.y.toFixed(3)} -> ${afterShift.y.toFixed(3)}, dxz=(${(afterShift.x-house.x).toFixed(3)},${(afterShift.z-house.z).toFixed(3)}), yOffset=${afterShift.yOffset.toFixed(3)}`);

  // Doc hat yOffset?
  const docEntry = await p.evaluate((id) => window.__editor.doc.objects.find((o) => o.id === id), house.id);
  log('Haus: yOffset im Doc gespeichert',
    docEntry && typeof docEntry.yOffset === 'number' && docEntry.yOffset > 0.3,
    `doc=${JSON.stringify(docEntry)}`);

  // Undo macht den Hoehen-Drag rueckgaengig.
  await p.keyboard.down('Control');
  await p.keyboard.press('KeyZ');
  await p.keyboard.up('Control');
  await p.waitForTimeout(120);
  const afterUndo = await p.evaluate(() => {
    const s = window.__editor.selected;
    return {
      y: s.position.y, yOffset: s.userData.editable.yOffset || 0,
    };
  });
  log('Haus: Undo setzt Hoehe zurueck',
    Math.abs(afterUndo.yOffset) < 0.01 && Math.abs(afterUndo.y - house.y) < 0.05,
    `undo y=${afterUndo.y.toFixed(3)} yOffset=${afterUndo.yOffset.toFixed(3)}`);

  // Redo -> Hoehe wieder da.
  await p.keyboard.down('Control');
  await p.keyboard.press('KeyY');
  await p.keyboard.up('Control');
  await p.waitForTimeout(120);
  const afterRedo = await p.evaluate(() => window.__editor.selected.userData.editable.yOffset || 0);
  log('Haus: Redo stellt Hoehe wieder her', afterRedo > 0.3, `redo yOffset=${afterRedo.toFixed(3)}`);

  // ====================================================================
  // 2) Reload-Persistenz Haus
  // ====================================================================
  const expectedYOff = afterRedo;
  await p.evaluate(() => {
    try { localStorage.setItem('dnd-world.sceneDoc.v1', JSON.stringify(window.__editor.doc)); } catch (e) {}
  });
  await p.reload();
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });
  const reloadedHouse = await p.evaluate((id) => {
    let found = null;
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.id === id) found = {
        y: o.position.y, yOffset: e.yOffset || 0,
      };
    });
    return found;
  }, house.id);
  log('Haus: Reload behält yOffset',
    reloadedHouse && Math.abs(reloadedHouse.yOffset - expectedYOff) < 0.05,
    `reload yOffset=${reloadedHouse ? reloadedHouse.yOffset.toFixed(3) : 'null'} expected=${expectedYOff.toFixed(3)}`);

  // ====================================================================
  // 3) Terraforming unter dem Haus -> Abstand zum Boden bleibt gleich.
  // ====================================================================
  await p.evaluate(() => window.__editor.setEditMode(true));
  await p.waitForTimeout(100);
  // Vor dem Terraforming: Abstand y - sampleHeight = yOffset (approx).
  const beforeTerraform = await p.evaluate((id) => {
    const { sampleHeight } = window.__sampleH;
    let found = null;
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.id === id) found = { y: o.position.y, x: o.position.x, z: o.position.z };
    });
    const sh = sampleHeight(found.x, found.z);
    return { ...found, sampleH: sh, dist: found.y - sh };
  }, house.id).catch(() => null);

  // Falls window.__sampleH nicht existiert, Fallback via editor.
  let beforeInfo = beforeTerraform;
  if (!beforeInfo) {
    beforeInfo = await p.evaluate((id) => {
      const terr = window.__editor;
      let found = null;
      terr.scene.traverse((o) => {
        const e = o.userData && o.userData.editable;
        if (e && e.id === id) found = { y: o.position.y, x: o.position.x, z: o.position.z };
      });
      return found;
    }, house.id);
  }

  // Terraforming: ApplyBrush direkt + refreshTerrainHeights + Objekte refresh.
  await p.evaluate(({ hx, hz }) => {
    const T = window.__editor.terrainTool;
    T.setKind('terrain');
    T.setMode('raise');
    T.setRadius(5);
    T.setStrength(0.5);
    T.setActive(true);
    T.onPointerDown(hx, hz);
    // Mehrere Pinsel-Samples um das Haus herum (Throttle austricksen).
    for (let i = 0; i < 20; i++) {
      T._lastSampleAt = 0;
      T.onPointerMove(hx, hz);
    }
    T.onPointerUp();
    T.setActive(false);
  }, { hx: beforeInfo.x, hz: beforeInfo.z });
  await p.waitForTimeout(150);

  const afterTerraform = await p.evaluate((id) => {
    let found = null;
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.id === id) found = { y: o.position.y, x: o.position.x, z: o.position.z, yOffset: e.yOffset || 0 };
    });
    return found;
  }, house.id);
  // Erwartung: y ist angestiegen (weil sampleHeight angestiegen), yOffset bleibt identisch.
  const yRise = afterTerraform.y - beforeInfo.y;
  log('Haus: nach Terraforming y angestiegen (Objekt folgt Boden)',
    yRise > 0.1,
    `y ${beforeInfo.y.toFixed(3)} -> ${afterTerraform.y.toFixed(3)} (diff ${yRise.toFixed(3)})`);
  log('Haus: Abstand zum Boden (yOffset) bleibt nach Terraforming',
    Math.abs(afterTerraform.yOffset - expectedYOff) < 0.01,
    `yOffset nach=${afterTerraform.yOffset.toFixed(3)} expected=${expectedYOff.toFixed(3)}`);

  // ====================================================================
  // 4) Normaler Drag ohne Shift (sollte unverändert funktionieren).
  // ====================================================================
  // Haus auf x+3 ziehen OHNE Shift.
  const dragFrom = { x: afterTerraform.x, y: afterTerraform.y + 0.5, z: afterTerraform.z };
  const dragTo   = { x: afterTerraform.x + 3, y: afterTerraform.y + 0.5, z: afterTerraform.z };
  const c0 = await worldToClient(p, dragFrom);
  const c1 = await worldToClient(p, dragTo);
  await p.mouse.move(c0.x, c0.y);
  await p.mouse.down({ button: 'left' });
  await p.mouse.move(c1.x, c1.y, { steps: 10 });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(150);
  const afterGroundDrag = await p.evaluate((id) => {
    let found = null;
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.id === id) found = { x: o.position.x, y: o.position.y, z: o.position.z, yOffset: e.yOffset || 0 };
    });
    return found;
  }, house.id);
  const dxz = Math.hypot(afterGroundDrag.x - afterTerraform.x, afterGroundDrag.z - afterTerraform.z);
  log('Haus: normaler Drag (ohne Shift) bewegt in XZ, yOffset bleibt',
    dxz > 1.5 && Math.abs(afterGroundDrag.yOffset - expectedYOff) < 0.1,
    `dxz=${dxz.toFixed(2)} yOffset=${afterGroundDrag.yOffset.toFixed(3)} expected=${expectedYOff.toFixed(3)}`);

  // ====================================================================
  // 5) Prozedurales Objekt (Baum): per Shift-Drag anheben.
  // ====================================================================
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  // Einen in die Szene materialisierten Baum suchen oder einen Baum direkt aus
  // dem forest-proc-Picker materialisieren.
  const treeInfo = await p.evaluate(() => {
    const E = window.__editor;
    // Suche einen Picker mit tree-type im Meta (crown).
    for (const picker of E._procPickers) {
      for (let i = 0; i < picker.meta.length; i++) {
        const m = picker.meta[i];
        if (typeof m.type === 'string' && m.type.startsWith('tree.')) {
          const mesh = E._materializeProcInstance(picker, i);
          if (mesh) {
            return { id: m.id, procId: m.id, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
          }
        }
      }
    }
    return null;
  });
  log('Baum (proc) materialisiert',
    !!treeInfo && typeof treeInfo.procId === 'string',
    `tree=${JSON.stringify(treeInfo)}`);

  if (treeInfo) {
    // Kamera auf Baum
    await setupCam(p, { x: treeInfo.x, y: 0, z: treeInfo.z }, { x: treeInfo.x, y: 25, z: treeInfo.z + 25 });
    // Baum selektieren via Click.
    const cTree = await worldToClient(p, { x: treeInfo.x, y: treeInfo.y + 2, z: treeInfo.z });
    await p.mouse.move(cTree.x, cTree.y);
    await p.mouse.down({ button: 'left' });
    await p.mouse.up({ button: 'left' });
    await p.waitForTimeout(140);
    const selTree = await p.evaluate(() => {
      const s = window.__editor.selected;
      return s ? { id: s.userData.editable.id, procId: s.userData.editable.procId } : null;
    });
    if (!selTree || selTree.id !== treeInfo.id) {
      log('Baum angeklickt', false, `sel=${JSON.stringify(selTree)}`);
    } else {
      // Shift-Drag.
      await shiftDragVertical(p, { x: treeInfo.x, y: treeInfo.y + 3, z: treeInfo.z }, -200);
      const afterTree = await p.evaluate(() => {
        const s = window.__editor.selected;
        return {
          y: s.position.y,
          yOffset: s.userData.editable.yOffset || 0,
        };
      });
      log('Baum: Shift+Drag erhöht yOffset',
        afterTree.yOffset > 0.3 && afterTree.y > treeInfo.y + 0.3,
        `tree y ${treeInfo.y.toFixed(3)} -> ${afterTree.y.toFixed(3)} yOffset=${afterTree.yOffset.toFixed(3)}`);
      // procOverride im doc?
      const procOv = await p.evaluate((id) => window.__editor.doc.procOverrides[id], treeInfo.procId);
      log('Baum: procOverride hat yOffset',
        procOv && Number.isFinite(procOv.yOffset) && procOv.yOffset > 0.3,
        `procOv=${JSON.stringify(procOv)}`);
    }
  }

  // ====================================================================
  // 6) Bruecke per Shift-Drag anheben.
  // ====================================================================
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  const bridgeInfo = await p.evaluate(() => {
    let found = null;
    window.__editor.scene.traverse((o) => {
      if (found) return;
      const e = o.userData && o.userData.editable;
      if (e && e.isBridge && e.procId) {
        found = { procId: e.procId, x: o.position.x, y: o.position.y, z: o.position.z };
      }
    });
    return found;
  });
  if (bridgeInfo) {
    await setupCam(p, { x: 0, y: 0, z: 10 });
    const curBridge = await p.evaluate((pid) => {
      let out = null;
      window.__editor.scene.traverse((o) => {
        const e = o.userData && o.userData.editable;
        if (e && e.procId === pid) out = { x: o.position.x, y: o.position.y, z: o.position.z };
      });
      return out;
    }, bridgeInfo.procId);
    const cBr = await worldToClient(p, { x: curBridge.x, y: curBridge.y + 0.3, z: curBridge.z });
    await p.mouse.move(cBr.x, cBr.y);
    await p.mouse.down({ button: 'left' });
    await p.mouse.up({ button: 'left' });
    await p.waitForTimeout(140);
    const selBr = await p.evaluate(() => {
      const s = window.__editor.selected;
      return s ? { procId: s.userData.editable.procId, isBridge: s.userData.editable.isBridge } : null;
    });
    if (!selBr || selBr.procId !== bridgeInfo.procId) {
      log('Bruecke angeklickt', false, `sel=${JSON.stringify(selBr)}`);
    } else {
      await shiftDragVertical(p, { x: curBridge.x, y: curBridge.y + 0.3, z: curBridge.z }, -180);
      const afterBr = await p.evaluate(() => {
        const s = window.__editor.selected;
        return { y: s.position.y, yOffset: s.userData.editable.yOffset || 0 };
      });
      log('Bruecke: Shift+Drag erhöht y (yOffset > 0.3) trotz base=0',
        afterBr.yOffset > 0.3 && afterBr.y > 0.3,
        `bridge y=${afterBr.y.toFixed(3)} yOffset=${afterBr.yOffset.toFixed(3)}`);
      // procOverride im doc?
      const brOv = await p.evaluate((pid) => window.__editor.doc.procOverrides[pid], bridgeInfo.procId);
      log('Bruecke: procOverride hat yOffset',
        brOv && Number.isFinite(brOv.yOffset) && brOv.yOffset > 0.3,
        `brOv=${JSON.stringify(brOv)}`);
    }
  }

  // ====================================================================
  // Screenshot
  // ====================================================================
  await setupCam(p, { x: 0, y: 0, z: 20 }, { x: 10, y: 30, z: 40 });
  await p.screenshot({ path: SHOT, fullPage: false });
  console.log('  Screenshot:', SHOT);

  await b.close();
  if (process.exitCode) console.log('\n  SUMMARY: FAIL'); else console.log('\n  SUMMARY: OK');
})().catch((e) => { console.error(e); process.exit(1); });
