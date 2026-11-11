// Editor-Integrationstest (headless).
// Verifiziert:
//   1. Bauen-Modus an/aus via Taste B + Button.
//   2. Haus aus Palette "platzieren" (klick + Click auf Canvas).
//   3. Objekt auswaehlen, verschieben, drehen, duplizieren, loeschen.
//   4. Undo -> loeschung rueckgaengig.
//   5. Reload -> Zustand aus localStorage wieder da.
//
// Nutzt dieselbe Playwright-Infra wie scripts/bench.cjs. Keine sichtbaren
// Browserfenster.

const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const URL = process.env.TEST_URL || 'http://127.0.0.1:5199/?edit=1';
const SHOT_DIR = path.join(__dirname, '..', 'docs');

function log(step, ok, extra = '') {
  const tag = ok ? '  OK' : 'FAIL';
  console.log(`  ${tag}  ${step}${extra ? '  ' + extra : ''}`);
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

  p.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[dnd-world]') || text.startsWith('[editor]')) {
      console.log('  [page]', text);
    }
  });

  await p.goto(URL);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });

  // Edit-Modus sollte wegen ?edit=1 schon an sein.
  const inEdit = await p.evaluate(() => window.__editor.editMode === true);
  log('Bauen-Modus initial an', inEdit);

  // Palette sichtbar?
  const palVisible = await p.evaluate(() => {
    const el = document.getElementById('editorPalette');
    return el && getComputedStyle(el).display !== 'none';
  });
  log('Palette sichtbar', palVisible);

  // Zaehle editierbare Haeuser in Szene
  const houseCount = await p.evaluate(() => {
    let n = 0;
    window.__editor.scene.traverse((o) => {
      if (o.userData && o.userData.editable
          && String(o.userData.editable.type || '').startsWith('house.')) n++;
    });
    return n;
  });
  log('Standard-Haeuser als editierbar markiert', houseCount > 30, `count=${houseCount}`);

  // Palette-Click: Haus-Typ auswaehlen
  const plBtn = await p.$('div[data-type="house.homeA_blue"]');
  await plBtn.click();
  await p.waitForTimeout(100);
  const pendingType = await p.evaluate(() => window.__editor.pendingType);
  log('Palette-Click setzt pendingType', pendingType === 'house.homeA_blue', pendingType);

  // Platzieren per Click auf Canvas (zentrum unten links, in freier Wiese)
  // Wir platzieren an weltkoordinaten ~ ( -30, -10 ): das ist eine Wiese.
  // Berechnung des Screenspace: wir frieren aktuell nicht ein, sondern klicken
  // einfach in die Mitte der Viewport und schauen, ob was platziert wird.
  const beforeObjects = await p.evaluate(() => window.__editor.doc.objects.length);
  // Click an eine freie Position links unten im Bild (in Wiese).
  await p.mouse.move(400, 700);
  await p.waitForTimeout(100);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(300);
  const afterObjects = await p.evaluate(() => window.__editor.doc.objects.length);
  log('Objekt per Click platziert', afterObjects > beforeObjects, `${beforeObjects} -> ${afterObjects}`);

  // Objekt sollte jetzt ausgewaehlt sein.
  let selectedId = await p.evaluate(() => window.__editor.selected?.userData?.editable?.id || null);
  log('Neues Objekt ist ausgewaehlt', !!selectedId);

  // Esc raeumt pendingType ab -> Linksklick wird zur Auswahl/Drag.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);

  // Objekt nochmal anklicken (Auswahl wiederherstellen)
  await p.mouse.move(400, 700);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(150);
  selectedId = await p.evaluate(() => window.__editor.selected?.userData?.editable?.id || null);
  log('Objekt per Klick (ohne pending) ausgewaehlt', !!selectedId);

  if (selectedId) {
    const posBefore = await p.evaluate(() => {
      const s = window.__editor.selected;
      return { x: s.position.x, z: s.position.z };
    });
    // Drag: pointerdown auf das Objekt + move + up
    await p.mouse.move(400, 700);
    await p.mouse.down({ button: 'left' });
    await p.mouse.move(500, 680, { steps: 10 });
    await p.mouse.up({ button: 'left' });
    await p.waitForTimeout(200);
    const posAfter = await p.evaluate(() => {
      const s = window.__editor.selected;
      return { x: s.position.x, z: s.position.z };
    });
    log('Objekt verschoben', Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z) > 0.1,
        `Δ=${(posAfter.x-posBefore.x).toFixed(2)},${(posAfter.z-posBefore.z).toFixed(2)}`);
  }

  // Drehen per R-Taste
  const rotBefore = await p.evaluate(() => window.__editor.selected?.rotation?.y ?? 0);
  await p.keyboard.press('KeyR');
  await p.waitForTimeout(100);
  const rotAfter = await p.evaluate(() => window.__editor.selected?.rotation?.y ?? 0);
  log('Rotation via R', Math.abs(rotAfter - rotBefore) > 0.01, `Δ=${(rotAfter-rotBefore).toFixed(3)}`);

  // Duplizieren per Strg+D
  const beforeDup = await p.evaluate(() => window.__editor.doc.objects.length);
  await p.keyboard.down('Control');
  await p.keyboard.press('KeyD');
  await p.keyboard.up('Control');
  await p.waitForTimeout(200);
  const afterDup = await p.evaluate(() => window.__editor.doc.objects.length);
  log('Dupliziert (Strg+D)', afterDup === beforeDup + 1, `${beforeDup}->${afterDup}`);

  // Loeschen per Delete
  const beforeDel = await p.evaluate(() => window.__editor.doc.objects.length);
  await p.keyboard.press('Delete');
  await p.waitForTimeout(100);
  const afterDel = await p.evaluate(() => window.__editor.doc.objects.length);
  log('Geloescht (Entf)', afterDel === beforeDel - 1, `${beforeDel}->${afterDel}`);

  // Undo -> loeschen rueckgaengig
  await p.keyboard.down('Control');
  await p.keyboard.press('KeyZ');
  await p.keyboard.up('Control');
  await p.waitForTimeout(150);
  const afterUndo = await p.evaluate(() => window.__editor.doc.objects.length);
  log('Undo bringt Objekt zurueck', afterUndo === beforeDel, `${afterDel}->${afterUndo}`);

  // Screenshot im Bauen-Modus
  const shot1 = path.join(SHOT_DIR, 'editor-build.png');
  await p.screenshot({ path: shot1, fullPage: false });
  console.log('  Screenshot:', shot1);

  // Toggle Bauen aus
  await p.keyboard.press('KeyB');
  await p.waitForTimeout(150);
  const inEdit2 = await p.evaluate(() => window.__editor.editMode);
  log('B schaltet Bauen aus', inEdit2 === false);

  // Reload und Zustand pruefen
  const docBeforeReload = await p.evaluate(() => JSON.stringify(window.__editor.doc));
  // Force-save
  await p.evaluate(() => {
    try {
      localStorage.setItem('dnd-world.sceneDoc.v1', JSON.stringify(window.__editor.doc));
    } catch (e) {}
  });
  await p.reload();
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });
  const docAfterReload = await p.evaluate(() => JSON.stringify(window.__editor.doc));
  const bA = JSON.parse(docBeforeReload); const aA = JSON.parse(docAfterReload);
  const sameLen = bA.objects.length === aA.objects.length;
  log('State aus localStorage wiederhergestellt', sameLen, `objects=${aA.objects.length}`);

  // Screenshot im Ansehen-Modus mit persistierten Objekten
  const shot2 = path.join(SHOT_DIR, 'editor-view-with-objects.png');
  await p.screenshot({ path: shot2, fullPage: false });
  console.log('  Screenshot:', shot2);

  // Nach Reload zurueck in den Bauen-Modus — jetzt Runde-A-Checks:
  await p.evaluate(() => window.__editor.setEditMode(true));
  await p.waitForTimeout(100);

  // Check: Objekt platzieren & dann Selected auswaehlen -> noch vorhanden/anklickbar?
  // (dupliziertes Objekt sollte auch nach Reload anklickbar sein.)
  const afterReloadObjs = await p.evaluate(() => window.__editor.doc.objects.length);
  log('Nach Reload: Objekt aus doc wiederhergestellt', afterReloadObjs > 0, `n=${afterReloadObjs}`);

  // Click aufs bestehende Objekt
  await p.mouse.move(500, 680);
  await p.mouse.down({ button: 'left' });
  await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(200);
  const pickedAfterReload = await p.evaluate(() => {
    return window.__editor.selected?.userData?.editable?.id || null;
  });
  log('Platziertes Objekt NACH Reload anklickbar', !!pickedAfterReload, `picked=${pickedAfterReload}`);

  // Alt+Wheel darf NUR drehen (kein Zoom).
  await p.evaluate(() => {
    window.__testBeforeZoom = window.__ctrl.getDistance();
    window.__testBeforeRot = window.__editor.selected?.rotation?.y ?? 0;
  });
  await p.mouse.move(800, 400);
  await p.keyboard.down('Alt');
  // Simuliere wheel-Event
  await p.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ev = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: -120, altKey: true,
    });
    canvas.dispatchEvent(ev);
  });
  await p.keyboard.up('Alt');
  await p.waitForTimeout(150);
  const zoomAfter = await p.evaluate(() => window.__ctrl.getDistance());
  const rotAfterAltWheel = await p.evaluate(() => window.__editor.selected?.rotation?.y ?? 0);
  const beforeZoom = await p.evaluate(() => window.__testBeforeZoom);
  const beforeRot = await p.evaluate(() => window.__testBeforeRot);
  log('Alt+Wheel dreht (nicht zoom)', Math.abs(rotAfterAltWheel - beforeRot) > 0.001, `dRot=${(rotAfterAltWheel-beforeRot).toFixed(3)} dZoom=${(zoomAfter-beforeZoom).toFixed(3)}`);

  // Scale per '+'-Taste
  if (pickedAfterReload) {
    const scaleBefore = await p.evaluate(() => window.__editor.selected?.scale?.x ?? 0);
    await p.keyboard.press('Equal'); // '+' auf Equal
    await p.waitForTimeout(100);
    const scaleAfter = await p.evaluate(() => window.__editor.selected?.scale?.x ?? 0);
    log('Scale per +/- (+)', scaleAfter > scaleBefore + 0.01, `${scaleBefore.toFixed(3)} -> ${scaleAfter.toFixed(3)}`);
  }

  // Bruecke platzieren
  const plBridge = await p.$('div[data-type="bridge.wood"]');
  if (plBridge) {
    await plBridge.click();
    await p.waitForTimeout(100);
    const beforeBridge = await p.evaluate(() => window.__editor.doc.objects.filter(o => o.type.startsWith('bridge.')).length);
    await p.mouse.move(900, 600);
    await p.mouse.down({ button: 'left' });
    await p.mouse.up({ button: 'left' });
    await p.waitForTimeout(200);
    const afterBridge = await p.evaluate(() => window.__editor.doc.objects.filter(o => o.type.startsWith('bridge.')).length);
    log('Bruecke platzierbar', afterBridge > beforeBridge, `${beforeBridge} -> ${afterBridge}`);
  } else {
    log('Bruecken-Palette-Button fehlt', false);
  }

  // Lichter-Pool: existiert, konstante Anzahl
  const poolStats = await p.evaluate(() => {
    if (!window.__lightsPool) return null;
    return window.__lightsPool.stats();
  });
  log('Lichter-Pool existiert', !!poolStats, poolStats ? `total=${poolStats.total} active=${poolStats.active} regs=${poolStats.registrations}` : '');

  // Hilfeleiste nicht ueberlappend (helpBar visible, mainHelp invisible im Bauen-Modus)
  const helpInfo = await p.evaluate(() => {
    const hb = document.getElementById('editorHelpBar');
    const mh = document.getElementById('mainHelp');
    return {
      hbVisible: hb && getComputedStyle(hb).display !== 'none',
      mhHidden: !mh || getComputedStyle(mh).display === 'none',
      hbBottom: hb ? hb.getBoundingClientRect().bottom : -1,
      mhBottom: mh ? mh.getBoundingClientRect().bottom : -1,
    };
  });
  log('Hilfeleiste: nur eine sichtbar',
    helpInfo.hbVisible && helpInfo.mhHidden,
    `helpBar=${helpInfo.hbVisible} mainHelp=${helpInfo.mhHidden}`);

  // Ghost-Rotation persistiert zwischen zwei Platzierungen desselben Typs?
  // Tree-Typ auswaehlen
  const plTree = await p.$('div[data-type="tree.leafy"]');
  if (plTree) {
    await plTree.click();
    await p.waitForTimeout(100);
    // Alt+Wheel am Ghost drehen
    await p.mouse.move(600, 500);
    await p.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, altKey: true });
      canvas.dispatchEvent(ev);
    });
    await p.waitForTimeout(80);
    const ghostRotA = await p.evaluate(() => window.__editor.hoverGhost?.rotation?.y ?? 0);
    // Platzieren
    await p.mouse.down({ button: 'left' });
    await p.mouse.up({ button: 'left' });
    await p.waitForTimeout(200);
    // Erneut einen tree anklicken -> Ghost neu -> rotY sollte aus typeDefaults kommen
    await plTree.click();
    await p.waitForTimeout(100);
    const ghostRotB = await p.evaluate(() => window.__editor.hoverGhost?.rotation?.y ?? 0);
    log('Ghost-Rotation bleibt zwischen Platzierungen (tree)',
      Math.abs(ghostRotA - ghostRotB) < 0.01,
      `a=${ghostRotA.toFixed(3)} b=${ghostRotB.toFixed(3)}`);
  }

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
