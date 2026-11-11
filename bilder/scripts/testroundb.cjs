// Round-B Integrationstest (headless).
// Verifiziert:
//   1. Prozedurale Objekte einzeln pickbar: Baum (Instanced), Felsen (Group),
//      Fass (Prop-Pool), Marktstand (Hitbox), Laterne (Pool).
//   2. Scale hat ein Undo.
//   3. Hills-Tint: Tag- vs Nachtfarbe unterscheiden sich pro Vertex.
//   4. Fluss-Palette nachts dunkler als tags.
//   5. Pfad-Werkzeug: Zaun zeichnen (3 Klicks + Enter) + sichtbarer Mesh.
//   6. Fence-Styles umschalten: wood/wicker/stone.
//   7. Pfad loeschen.

const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const URL = 'http://127.0.0.1:5199/?edit=1';
const SHOT_DIR = path.join(__dirname, '..', 'docs');

let okCount = 0, failCount = 0;
function log(step, ok, extra = '') {
  const tag = ok ? '  OK' : 'FAIL';
  if (ok) okCount++; else failCount++;
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
    if (text.includes('[dnd-world]')) console.log('  [page]', text);
    if (msg.type() === 'error') console.log('  [page.err]', text);
  });
  p.on('pageerror', (e) => console.log('  [page.err]', e.message));

  await p.goto(URL);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });

  // ================= 1) Prozedurale Picker registriert? =================
  const procStats = await p.evaluate(() => {
    const E = window.__editor;
    let totalMeta = 0;
    const typeCounts = {};
    for (const picker of E._procPickers) {
      totalMeta += picker.meta.length;
      for (const m of picker.meta) {
        typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
      }
    }
    return { pickerCount: E._procPickers.length, totalMeta, typeCounts };
  });
  log('ProcPicker registriert', procStats.pickerCount > 0, `pickers=${procStats.pickerCount} meta=${procStats.totalMeta}`);
  log(' - Baeume (tree.pine/leafy) in procMeta', (procStats.typeCounts['tree.pine'] || 0) + (procStats.typeCounts['tree.leafy'] || 0) > 10,
      `pine=${procStats.typeCounts['tree.pine']||0} leafy=${procStats.typeCounts['tree.leafy']||0}`);
  log(' - Props (barrel/crate/sack…) in procMeta', Object.keys(procStats.typeCounts).some(t => t.startsWith('prop.')),
      `props=${Object.entries(procStats.typeCounts).filter(([t]) => t.startsWith('prop.')).map(([t,n]) => t+':'+n).join(',')}`);
  log(' - Laternen (light.lantern) in procMeta', (procStats.typeCounts['light.lantern'] || 0) > 0,
      `lanterns=${procStats.typeCounts['light.lantern']||0}`);

  // Rocks sind individuell (userData.editable mit procId 'p:rock:*')
  const rockCount = await p.evaluate(() => {
    let n = 0;
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && String(e.procId || '').startsWith('p:rock:')) n++;
    });
    return n;
  });
  log(' - Felsen anklickbar in Scene', rockCount > 0, `rocks=${rockCount}`);

  // Marktstaende als Hitbox pro Stand
  const stallCount = await p.evaluate(() => {
    let n = 0;
    window.__editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && String(e.procId || '').startsWith('p:stall:')) n++;
    });
    return n;
  });
  log(' - Marktstand-Hitboxes', stallCount > 0, `stalls=${stallCount}`);

  // ================= 2) Picker-API funktioniert fuer alle proc-Pools =========
  // Direkt via _materializeProcInstance aufrufen (ohne Raycasting) — das
  // validiert den Code-Pfad, der auch beim Klicken ausgeloest wird.
  const matTree = await p.evaluate(() => {
    const E = window.__editor;
    const picker = E._procPickers.find(pk => pk.meta[0] && String(pk.meta[0].type).startsWith('tree.'));
    if (!picker) return null;
    const mesh = E._materializeProcInstance(picker, 0);
    return mesh ? { id: mesh.userData.editable.id, type: mesh.userData.editable.type } : null;
  });
  log('Baum-Instanz materialisierbar', matTree && matTree.type.startsWith('tree.'),
      matTree ? `id=${matTree.id} type=${matTree.type}` : 'null');

  const matProp = await p.evaluate(() => {
    const E = window.__editor;
    const picker = E._procPickers.find(pk => pk.meta[0] && pk.meta[0].type === 'prop.barrel');
    if (!picker) return null;
    const mesh = E._materializeProcInstance(picker, 0);
    return mesh ? { id: mesh.userData.editable.id, type: mesh.userData.editable.type } : null;
  });
  log('Fass-Instanz materialisierbar', matProp && matProp.type === 'prop.barrel',
      matProp ? `id=${matProp.id}` : 'null');

  const matLant = await p.evaluate(() => {
    const E = window.__editor;
    const picker = E._procPickers.find(pk => pk.meta[0] && pk.meta[0].type === 'light.lantern');
    if (!picker) return null;
    const mesh = E._materializeProcInstance(picker, 0);
    return mesh ? { id: mesh.userData.editable.id, type: mesh.userData.editable.type } : null;
  });
  log('Laternen-Instanz materialisierbar', matLant && matLant.type === 'light.lantern',
      matLant ? `id=${matLant.id}` : 'null');

  // Felsen sind individuell in scene -> direkter Select-Test
  const rockDirect = await p.evaluate(() => {
    const E = window.__editor;
    let rock = null;
    E.scene.traverse((o) => {
      if (rock) return;
      const e = o.userData && o.userData.editable;
      if (e && String(e.procId || '').startsWith('p:rock:')) rock = o;
    });
    if (!rock) return null;
    E._select(rock);
    return rock.userData.editable.id;
  });
  log('Felsen auswaehlbar (userData.editable)', rockDirect && rockDirect.startsWith('p:rock:'),
      `id=${rockDirect}`);

  // Marktstand
  const stallDirect = await p.evaluate(() => {
    const E = window.__editor;
    let stall = null;
    E.scene.traverse((o) => {
      if (stall) return;
      const e = o.userData && o.userData.editable;
      if (e && String(e.procId || '').startsWith('p:stall:')) stall = o;
    });
    if (!stall) return null;
    E._select(stall);
    return stall.userData.editable.id;
  });
  log('Marktstand auswaehlbar', stallDirect && stallDirect.startsWith('p:stall:'),
      `id=${stallDirect}`);

  // Reload-Resistenz: Felsen verschieben -> doc speichern -> reload -> an neuer Pos?
  await p.evaluate(() => {
    const E = window.__editor;
    // Finde den Felsen, select, verschiebe
    let rock = null;
    E.scene.traverse((o) => {
      if (rock) return;
      const e = o.userData && o.userData.editable;
      if (e && String(e.procId || '').startsWith('p:rock:')) rock = o;
    });
    if (rock) {
      E._select(rock);
      rock.position.set(10, rock.position.y, 10);
      E._writeSelectedToDoc();
      // Doc explizit speichern (ohne Timer zu warten)
      localStorage.setItem('dnd-world.sceneDoc.v1', JSON.stringify(E.doc));
    }
  });
  await p.waitForTimeout(100);

  // Esc raeumt Auswahl weg
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);

  // ================= 3) Scale-Undo =================
  // Platziere ein Objekt, skaliere, undo -> zurueck zur ursprungsgroesse.
  const plHome = await p.$('div[data-type="house.homeA_blue"]');
  await plHome.click();
  await p.waitForTimeout(100);
  await p.mouse.move(420, 720);
  await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(200);
  // Klick auf dasselbe Haus zum Re-Select
  await p.keyboard.press('Escape');
  await p.mouse.move(420, 720);
  await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(150);
  const scaleBefore = await p.evaluate(() => window.__editor.selected?.scale?.x ?? 0);
  // 3 Mal +; waertet dann 400ms + 50ms Buffer bis Undo-Coalesce committet.
  await p.keyboard.press('Equal');
  await p.keyboard.press('Equal');
  await p.keyboard.press('Equal');
  await p.waitForTimeout(650);
  const scaleAfter = await p.evaluate(() => window.__editor.selected?.scale?.x ?? 0);
  const undoCount = await p.evaluate(() => window.__editor.undoStack.length);
  // Undo
  await p.keyboard.down('Control');
  await p.keyboard.press('KeyZ');
  await p.keyboard.up('Control');
  await p.waitForTimeout(150);
  const scaleAfterUndo = await p.evaluate(() => window.__editor.selected?.scale?.x ?? 0);
  log('Scale-Undo stellt urspruengliche Groesse her',
      Math.abs(scaleAfterUndo - scaleBefore) < 0.01,
      `before=${scaleBefore.toFixed(3)} scaled=${scaleAfter.toFixed(3)} undoUndo=${scaleAfterUndo.toFixed(3)} (undoStack=${undoCount})`);

  // ================= 4) Hills + Fluss Tag/Nacht =================
  // Hills: Vertex-Colors unterscheiden sich zwischen night vs day.
  await p.evaluate(() => window.__applyTime(0));  // Nacht
  await p.waitForTimeout(100);
  const hillsNight = await p.evaluate(() => {
    const scene = window.__editor.scene;
    let g = null;
    scene.traverse((o) => { if (o.name === 'hills') g = o; });
    if (!g) return null;
    const c = g.children[0].geometry.attributes.color;
    // Summiere einige Farben
    let r = 0, gS = 0, bS = 0;
    const N = Math.min(100, c.count);
    for (let i = 0; i < N; i++) { r += c.getX(i); gS += c.getY(i); bS += c.getZ(i); }
    return { r: r / N, g: gS / N, b: bS / N };
  });
  await p.evaluate(() => window.__applyTime(12));
  await p.waitForTimeout(100);
  const hillsDay = await p.evaluate(() => {
    const scene = window.__editor.scene;
    let g = null;
    scene.traverse((o) => { if (o.name === 'hills') g = o; });
    if (!g) return null;
    const c = g.children[0].geometry.attributes.color;
    let r = 0, gS = 0, bS = 0;
    const N = Math.min(100, c.count);
    for (let i = 0; i < N; i++) { r += c.getX(i); gS += c.getY(i); bS += c.getZ(i); }
    return { r: r / N, g: gS / N, b: bS / N };
  });
  const hillsDiff = hillsNight && hillsDay
    ? Math.abs(hillsNight.r - hillsDay.r) + Math.abs(hillsNight.g - hillsDay.g) + Math.abs(hillsNight.b - hillsDay.b)
    : 0;
  log('Hills: Tag != Nachtfarbe', hillsDiff > 0.1,
      `night=(${hillsNight?.r.toFixed(2)},${hillsNight?.g.toFixed(2)},${hillsNight?.b.toFixed(2)}) day=(${hillsDay?.r.toFixed(2)},${hillsDay?.g.toFixed(2)},${hillsDay?.b.toFixed(2)})`);
  // Tag-Berge heller (groesserer Lum-Wert)?
  const dayLum = (hillsDay.r + hillsDay.g + hillsDay.b) / 3;
  const nightLum = (hillsNight.r + hillsNight.g + hillsNight.b) / 3;
  log(' - Tag heller als Nacht', dayLum > nightLum + 0.05, `day-lum=${dayLum.toFixed(3)} night-lum=${nightLum.toFixed(3)}`);

  // Fluss: nachts dunkel vs tags hell. Lese uDeepCol+uMidCol aus water-shader.
  await p.evaluate(() => window.__applyTime(0));
  await p.waitForTimeout(80);
  const riverNight = await p.evaluate(() => {
    const scene = window.__editor.scene;
    let riv = null;
    scene.traverse((o) => { if (o.name === 'rivers') riv = o; });
    if (!riv) return null;
    const m = riv.children.find(c => c.name === 'river');
    const u = m.material.uniforms;
    return {
      deep: [u.uDeepCol.value.r, u.uDeepCol.value.g, u.uDeepCol.value.b],
      mid: [u.uMidCol.value.r, u.uMidCol.value.g, u.uMidCol.value.b],
      bank: [u.uBankCol.value.r, u.uBankCol.value.g, u.uBankCol.value.b],
    };
  });
  await p.evaluate(() => window.__applyTime(12));
  await p.waitForTimeout(80);
  const riverDay = await p.evaluate(() => {
    const scene = window.__editor.scene;
    let riv = null;
    scene.traverse((o) => { if (o.name === 'rivers') riv = o; });
    if (!riv) return null;
    const m = riv.children.find(c => c.name === 'river');
    const u = m.material.uniforms;
    return {
      deep: [u.uDeepCol.value.r, u.uDeepCol.value.g, u.uDeepCol.value.b],
      mid: [u.uMidCol.value.r, u.uMidCol.value.g, u.uMidCol.value.b],
      bank: [u.uBankCol.value.r, u.uBankCol.value.g, u.uBankCol.value.b],
    };
  });
  const nightLumR = (riverNight.deep[0] + riverNight.deep[1] + riverNight.deep[2]) / 3;
  const dayLumR   = (riverDay.deep[0] + riverDay.deep[1] + riverDay.deep[2]) / 3;
  log('Fluss: Nacht deutlich dunkler als Tag', dayLumR > nightLumR + 0.03,
      `night-deep-lum=${nightLumR.toFixed(3)} day-deep-lum=${dayLumR.toFixed(3)} (linear)`);
  log(' - Nacht-deep nahe schwarz', nightLumR < 0.015, `lum=${nightLumR.toFixed(3)}`);

  // ================= 5) Pfad-Werkzeug: Zaun zeichnen =================
  // Zurueck auf Nacht fuer vergleichbare Screenshots mit Light.
  await p.evaluate(() => window.__applyTime(13));
  await p.waitForTimeout(100);

  // Wechsle in Tab 'Pfade'
  await p.evaluate(() => window.__editor._setActiveTab('paths'));
  await p.waitForTimeout(80);
  const paneVisible = await p.evaluate(() => {
    const pp = document.getElementById('editorPathsPane');
    return pp && getComputedStyle(pp).display !== 'none';
  });
  log('Pfade-Tab sichtbar', paneVisible);

  // Zeichnen-Modus aktivieren
  await p.evaluate(() => window.__editor.pathTool.beginDraw('wood'));
  await p.waitForTimeout(80);
  const drawing = await p.evaluate(() => window.__editor.pathTool.mode === 'DRAWING');
  log('Zeichnen-Modus (DRAWING) an', drawing);

  // 3 Klicks setzen (freie Wiese, nahe Mitte)
  const beforePaths = await p.evaluate(() => (window.__editor.doc.paths || []).length);
  await p.mouse.move(700, 700);
  await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(350);
  await p.mouse.move(800, 650);
  await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(350);
  await p.mouse.move(900, 650);
  await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' });
  await p.waitForTimeout(350);
  const ptsAfterClicks = await p.evaluate(() => window.__editor.pathTool.points.length);
  log('3 Punkte gesetzt', ptsAfterClicks === 3, `n=${ptsAfterClicks}`);

  // Finish via Enter
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  const afterPaths = await p.evaluate(() => (window.__editor.doc.paths || []).length);
  log('Pfad erzeugt (doc.paths +1)', afterPaths === beforePaths + 1, `${beforePaths} -> ${afterPaths}`);
  // Mesh im Scene?
  const fenceMesh = await p.evaluate(() => {
    const id = window.__editor.doc.paths[window.__editor.doc.paths.length - 1].id;
    let found = null;
    window.__editor.scene.traverse((o) => {
      if (o.userData && o.userData.editable && o.userData.editable.id === id) found = o;
    });
    return { id, found: !!found, childCount: found ? found.children.length : 0 };
  });
  log('Zaun-Mesh in Scene', fenceMesh.found && fenceMesh.childCount >= 2,
      `id=${fenceMesh.id} children=${fenceMesh.childCount}`);

  // Screenshot im Bauen-Modus mit Zaun
  const shotFence = path.join(SHOT_DIR, 'editor-roundb-fence-wood.png');
  await p.screenshot({ path: shotFence, fullPage: false });
  console.log('  Screenshot:', shotFence);

  // ================= 6) Fence Styles umschalten =================
  for (const style of ['wicker', 'stone']) {
    const bPre = await p.evaluate(() => (window.__editor.doc.paths || []).length);
    await p.evaluate((st) => window.__editor.pathTool.beginDraw(st), style);
    await p.mouse.move(600, 720); await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' }); await p.waitForTimeout(350);
    await p.mouse.move(650, 700); await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' }); await p.waitForTimeout(350);
    await p.mouse.move(700, 680); await p.mouse.down({ button: 'left' }); await p.mouse.up({ button: 'left' }); await p.waitForTimeout(350);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(150);
    const bPost = await p.evaluate(() => (window.__editor.doc.paths || []).length);
    log(`Fence-Style '${style}' zeichenbar`, bPost === bPre + 1, `${bPre} -> ${bPost}`);
  }
  const shotAll = path.join(SHOT_DIR, 'editor-roundb-fences-all.png');
  await p.screenshot({ path: shotAll, fullPage: false });
  console.log('  Screenshot:', shotAll);

  // ================= 7) Pfad loeschen =================
  // Pick + Delete
  const lastPathId = await p.evaluate(() => window.__editor.doc.paths[window.__editor.doc.paths.length - 1].id);
  await p.evaluate((pid) => {
    // Direktes Select ueber internen path
    const E = window.__editor;
    let m = null;
    E.scene.traverse((o) => { if (o.userData && o.userData.editable && o.userData.editable.id === pid) m = o; });
    if (m) {
      E._select(m);
      E.pathTool.beginEditPath(m);
    }
  }, lastPathId);
  await p.waitForTimeout(80);
  const edit = await p.evaluate(() => window.__editor.pathTool.mode);
  const before = await p.evaluate(() => (window.__editor.doc.paths || []).length);
  await p.keyboard.press('Delete');
  await p.waitForTimeout(150);
  const after = await p.evaluate(() => (window.__editor.doc.paths || []).length);
  log(`Pfad loeschbar (mode=${edit})`, after === before - 1, `${before} -> ${after}`);

  // ================= 8) Reload: Pfade persistieren =================
  // Save explicitly
  await p.evaluate(() => {
    localStorage.setItem('dnd-world.sceneDoc.v1', JSON.stringify(window.__editor.doc));
  });
  const beforeReload = await p.evaluate(() => (window.__editor.doc.paths || []).length);
  await p.reload();
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });
  const afterReload = await p.evaluate(() => (window.__editor.doc.paths || []).length);
  log('Pfade persistieren ueber Reload', afterReload === beforeReload,
      `${beforeReload} -> ${afterReload}`);

  // ================= 9) Tag-Screenshot zur optischen Kontrolle =================
  await p.evaluate(() => window.__applyTime(13));
  await p.waitForTimeout(150);
  const shotDay = path.join(SHOT_DIR, 'editor-roundb-day.png');
  await p.screenshot({ path: shotDay, fullPage: false });
  console.log('  Screenshot:', shotDay);

  await p.evaluate(() => window.__applyTime(22));
  await p.waitForTimeout(150);
  const shotNight = path.join(SHOT_DIR, 'editor-roundb-night.png');
  await p.screenshot({ path: shotNight, fullPage: false });
  console.log('  Screenshot:', shotNight);

  await b.close();
  console.log(`\n  SUMMARY: ${okCount} OK, ${failCount} FAIL`);
  if (failCount > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
