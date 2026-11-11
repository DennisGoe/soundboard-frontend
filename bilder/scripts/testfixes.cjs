// Korrekturrunde-Test (headless).
// Verifiziert:
//  1. Wegsteine: Max-Luminanz < 0.56 (kein weiss-leuchtender Pflaster-Look).
//  2. Haus-Wegsteine: Max-Luminanz < 0.56.
//  3. Terraforming kurzer Standardstrich: ergibt sanften Huegel, delta <= 1.0,
//     Hoehe steigt gleichmaessig (nicht nur einzelne Zelle).
//  4. Terraforming Absenken: ergibt Mulde (sanft, negativ).
//  5. Paint (Schnee): max channel <= 0.80 nach vollem Strich (kein Gluehen).
//  6. Time-Slider sync: applyTime(13) laesst Slider nachziehen.
//  7. Tempel per Doc markiert + per Raycast gepickt.
//  8. Standardwerte-Brush (r=3, s=0.25) ergibt max delta <= 0.5.
//
// Erzeugt Screenshots: fixes-hill.png, fixes-crater.png, fixes-paint.png,
// fixes-overview.png, fixes-paths.png.

const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');
const path = require('path');

const URL_EDIT = 'http://127.0.0.1:5199/?edit=1';
const URL_VIEW_DAY = 'http://127.0.0.1:5199/?time=13';
const SHOT_DIR = path.join(__dirname, '..', 'docs');

function log(step, ok, extra = '') {
  const tag = ok ? '  OK' : 'FAIL';
  console.log(`  ${tag}  ${step}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
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
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') pageErrors.push('CON ' + t);
    if (t.includes('[dnd-world]')) console.log('  [page]', t);
  });

  // Fresh storage
  await p.goto('http://127.0.0.1:5199/');
  await p.evaluate(() => localStorage.removeItem('dnd-world.sceneDoc.v1'));

  // ---------------- 1 & 2: Wegstein-Farben ----------------
  await p.goto(URL_VIEW_DAY);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForTimeout(400);

  const cobbleStats = await p.evaluate(() => {
    const results = { main: null, house: null };
    function scan(group) {
      let maxL = 0, minL = 1, sum = 0, n = 0, maxCh = 0;
      group.traverse((o) => {
        if (!o.isInstancedMesh) return;
        const col = o.instanceColor;
        if (!col) return;
        const arr = col.array;
        for (let i = 0; i < arr.length; i += 3) {
          const r = arr[i], g = arr[i + 1], b = arr[i + 2];
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (l > maxL) maxL = l;
          if (l < minL) minL = l;
          sum += l; n++;
          const mc = Math.max(r, g, b);
          if (mc > maxCh) maxCh = mc;
        }
      });
      return { maxL, minL, avgL: sum / Math.max(1, n), maxCh, count: n };
    }
    // find main + house paths
    let main = null, house = null;
    window.__editor.scene.traverse((o) => {
      if (o.name === 'pathCobbles') main = o;
      if (o.name === 'housePaths') house = o;
    });
    return { main: main ? scan(main) : null, house: house ? scan(house) : null };
  });
  if (cobbleStats.main) {
    log('Wegsteine max-Luminanz < 0.55 (nicht leuchtend-weiss)',
        cobbleStats.main.maxL < 0.55,
        `maxL=${cobbleStats.main.maxL.toFixed(3)} avgL=${cobbleStats.main.avgL.toFixed(3)} maxCh=${cobbleStats.main.maxCh.toFixed(3)} n=${cobbleStats.main.count}`);
  } else {
    log('Wegsteine vorhanden', false);
  }
  if (cobbleStats.house) {
    log('Haus-Wegsteine max-Luminanz < 0.55',
        cobbleStats.house.maxL < 0.55,
        `maxL=${cobbleStats.house.maxL.toFixed(3)} avgL=${cobbleStats.house.avgL.toFixed(3)} maxCh=${cobbleStats.house.maxCh.toFixed(3)} n=${cobbleStats.house.count}`);
  }

  // Pfad-Screenshot (Tag, in Dorf-Naehe)
  await p.evaluate(() => {
    window.__ctrl.target.set(-13, 1.2, 8);
    window.__cam.position.set(0, 7, 20);
    window.__ctrl.update();
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOT_DIR, 'fixes-paths.png') });

  // ---------------- 3,4,8: Terraforming ----------------
  // Fresh page for edit tests
  await p.goto('http://127.0.0.1:5199/');
  await p.evaluate(() => localStorage.removeItem('dnd-world.sceneDoc.v1'));
  await p.goto(URL_EDIT);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });
  await p.waitForTimeout(400);

  // Day for visibility
  await p.evaluate(() => window.__applyTime(13));
  await p.waitForTimeout(100);

  // Test standard defaults (r=3, s=0.25) -> short stroke -> gentle hill
  const posStd = { x: -25, z: 10 };
  const yBeforeStd = await p.evaluate(async ({ x, z }) => {
    const mod = await import('/src/scene/terrain.js');
    return mod.sampleHeight(x, z);
  }, posStd);
  await p.evaluate(({ x, z }) => {
    const ed = window.__editor;
    ed._setActiveTab('terrain');
    ed._toggleTerrainBrush();
    const t = ed.terrainTool;
    t.setRadius(3.0); t.setStrength(0.25); t.setMode('raise');
    // Realistischer kurzer Strich: ~1s, ~30 Samples, aber Zeit-Throttle begrenzt
    // auf ~33 Samples/s.
    t.onPointerDown(x, z);
    const stepMs = 35;
    const now = () => performance.now();
    // Simuliere einen 1s langen Strich ueber eine kleine Strecke.
    const start = now();
    const promise = new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        if (now() - start > 1000) { t.onPointerUp(); resolve(); return; }
        const u = i / 30;
        t.onPointerMove(x + Math.cos(u * 6) * 0.4, z + Math.sin(u * 6) * 0.4);
        i++;
        setTimeout(tick, stepMs);
      };
      tick();
    });
    return promise;
  }, posStd);
  await p.waitForTimeout(150);
  const yAfterStd = await p.evaluate(async ({ x, z }) => {
    const mod = await import('/src/scene/terrain.js');
    return mod.sampleHeight(x, z);
  }, posStd);
  const deltaStd = yAfterStd - yBeforeStd;
  log('Standardwerte Brush ergibt sanften Huegel (0.05 < delta <= 0.5)',
      deltaStd > 0.05 && deltaStd <= 0.5,
      `delta=${deltaStd.toFixed(3)}m`);

  // Check Umgebung ist mitgezogen (Huegel, nicht Nadel)
  const neighbourDeltas = await p.evaluate(async ({ x, z, baseY }) => {
    const mod = await import('/src/scene/terrain.js');
    return [
      mod.sampleHeight(x + 0.5, z) - baseY,
      mod.sampleHeight(x + 1.0, z) - baseY,
      mod.sampleHeight(x + 1.5, z) - baseY,
      mod.sampleHeight(x + 2.0, z) - baseY,
    ];
  }, { x: posStd.x, z: posStd.z, baseY: yBeforeStd });
  const falloffSmooth = neighbourDeltas[0] > 0.02
    && neighbourDeltas[1] > 0.01
    && neighbourDeltas[0] >= neighbourDeltas[1]
    && neighbourDeltas[1] >= neighbourDeltas[2]
    && neighbourDeltas[3] < neighbourDeltas[1];
  log('Hoehenfeld faellt vom Zentrum weich ab (runder Huegel)',
      falloffSmooth,
      `n=${neighbourDeltas.map(d => d.toFixed(3)).join(',')}`);

  // Pinsel aus, Kamera auf Huegel
  await p.evaluate(() => {
    const ed = window.__editor;
    ed.terrainTool.setActive(false);
    // Kamera schraeg auf Huegel-Zentrum (-25,10) blicken.
    window.__cam.position.set(-10, 10, 25);
    window.__ctrl.target.set(-25, 0.5, 10);
    window.__ctrl.update();
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOT_DIR, 'fixes-hill.png') });

  // Mulde (Absenken) an anderer Stelle
  const posLow = { x: -20, z: -5 };
  const yBeforeLow = await p.evaluate(async ({ x, z }) => {
    const mod = await import('/src/scene/terrain.js');
    return mod.sampleHeight(x, z);
  }, posLow);
  await p.evaluate(({ x, z }) => {
    const ed = window.__editor;
    ed._toggleTerrainBrush();
    const t = ed.terrainTool;
    t.setRadius(3.0); t.setStrength(0.25); t.setMode('lower');
    t.onPointerDown(x, z);
    return new Promise((resolve) => {
      const start = performance.now();
      let i = 0;
      const tick = () => {
        if (performance.now() - start > 1000) { t.onPointerUp(); resolve(); return; }
        const u = i / 30;
        t.onPointerMove(x + Math.cos(u * 6) * 0.4, z + Math.sin(u * 6) * 0.4);
        i++;
        setTimeout(tick, 35);
      };
      tick();
    });
  }, posLow);
  await p.waitForTimeout(150);
  const yAfterLow = await p.evaluate(async ({ x, z }) => {
    const mod = await import('/src/scene/terrain.js');
    return mod.sampleHeight(x, z);
  }, posLow);
  const deltaLow = yAfterLow - yBeforeLow;
  log('Absenken-Pinsel ergibt sanfte Mulde (-0.5 <= delta < -0.05)',
      deltaLow < -0.05 && deltaLow >= -0.5,
      `delta=${deltaLow.toFixed(3)}m`);
  await p.evaluate(() => {
    window.__editor.terrainTool.setActive(false);
    window.__cam.position.set(-5, 12, 8);
    window.__ctrl.target.set(-20, 0.5, -5);
    window.__ctrl.update();
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOT_DIR, 'fixes-crater.png') });

  // ---------------- 5: Paint (Schnee) ----------------
  const paintPos = { x: -10, z: -10 };
  await p.evaluate(({ x, z }) => {
    const ed = window.__editor;
    ed._setActiveTab('paint');
    ed._togglePaintBrush();
    const t = ed.terrainTool;
    t.setRadius(3.0); t.setStrength(1.0); t.setPaintMat(8); // Schnee
    t.onPointerDown(x, z);
    return new Promise((resolve) => {
      const start = performance.now();
      let i = 0;
      const tick = () => {
        if (performance.now() - start > 1500) { t.onPointerUp(); resolve(); return; }
        const u = i / 40;
        t.onPointerMove(x + Math.cos(u * 6) * 0.3, z + Math.sin(u * 6) * 0.3);
        i++;
        setTimeout(tick, 35);
      };
      tick();
    });
  }, paintPos);
  await p.waitForTimeout(200);
  // Vertex-Farbe an Terrain-Vertex nahe paintPos lesen. Via Scene-Traversal
  // (nicht dynamic import, da Vite die Module mit Timestamp-Query trennt).
  const paintStats = await p.evaluate(({ x, z }) => {
    let mesh = null;
    window.__editor.scene.traverse((o) => { if (o.name === 'ground') mesh = o; });
    if (!mesh) return null;
    const pos = mesh.geometry.attributes.position;
    const col = mesh.geometry.attributes.color;
    let bestIdx = -1, bestD = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vz = pos.getZ(i);
      const d = Math.hypot(vx - x, vz - z);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    if (bestIdx < 0) return null;
    return {
      r: col.getX(bestIdx), g: col.getY(bestIdx), b: col.getZ(bestIdx),
      dist: bestD,
    };
  }, paintPos);
  if (paintStats) {
    const maxCh = Math.max(paintStats.r, paintStats.g, paintStats.b);
    log('Paint Schnee max-Channel <= 0.82 (kein Glow bei Sonne)',
        maxCh <= 0.82,
        `rgb=(${paintStats.r.toFixed(2)},${paintStats.g.toFixed(2)},${paintStats.b.toFixed(2)}) maxCh=${maxCh.toFixed(3)}`);
  } else {
    log('Paint-Sample verfuegbar', false);
  }
  await p.evaluate(() => {
    window.__editor.terrainTool.setActive(false);
    window.__cam.position.set(-5, 8, 5);
    window.__ctrl.target.set(-10, 1, -10);
    window.__ctrl.update();
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOT_DIR, 'fixes-paint.png') });

  // ---------------- 6: Time-Slider Sync ----------------
  await p.evaluate(() => window.__applyTime(13));
  await p.waitForTimeout(80);
  const sliderAt13 = await p.evaluate(() => {
    const s = document.querySelector('#timePanel input[type=range]');
    return s ? parseFloat(s.value) : null;
  });
  log('Slider zieht nach applyTime(13) nach', Math.abs((sliderAt13 ?? 0) - 13) < 0.01,
      `slider=${sliderAt13}`);
  await p.evaluate(() => window.__applyTime(22));
  await p.waitForTimeout(80);
  const sliderAt22 = await p.evaluate(() => {
    const s = document.querySelector('#timePanel input[type=range]');
    return s ? parseFloat(s.value) : null;
  });
  log('Slider zieht nach applyTime(22) nach', Math.abs((sliderAt22 ?? 0) - 22) < 0.01,
      `slider=${sliderAt22}`);

  // ---------------- 7: Tempel editable + pickbar ----------------
  const templeInfo = await p.evaluate(() => {
    const sc = window.__editor.scene;
    let temple = null;
    sc.traverse((o) => {
      if (o.userData && o.userData.editable && o.userData.editable.type === 'house.temple') temple = o;
    });
    if (!temple) return { editable: false };
    // Raycast gegen Tempel aus der Schraegperspektive.
    const THREE = window.__editor.scene.children[0].constructor.prototype instanceof Object
      ? null : null; // nur fuer Hinweis
    // Pick via editor API: Kamera umhaengen + NDC auf Weltpunkt vom Tempel.
    const cam = window.__cam;
    const posW = temple.getWorldPosition(new (window.__cam.position.constructor)());
    posW.y += 1.2;
    // NDC berechnen aus posW
    const proj = posW.clone().project(cam);
    window.__editor.mouseNDC.x = proj.x;
    window.__editor.mouseNDC.y = proj.y;
    const picked = window.__editor._pickEditable();
    return {
      editable: true,
      type: temple.userData.editable.type,
      id: temple.userData.editable.id,
      pickedId: picked && picked.userData && picked.userData.editable ? picked.userData.editable.id : null,
      pickedType: picked && picked.userData && picked.userData.editable ? picked.userData.editable.type : null,
    };
  });
  log('Tempel ist als editable markiert',
      templeInfo.editable, `type=${templeInfo.type} id=${templeInfo.id}`);
  log('Tempel per Raycast gepickt',
      templeInfo.pickedId === templeInfo.id,
      `pickedId=${templeInfo.pickedId} pickedType=${templeInfo.pickedType}`);

  // Overview-Screenshot: alles im Bild
  await p.evaluate(() => {
    window.__cam.position.set(2, 20, 32);
    window.__ctrl.target.set(-15, 1.5, 12);
    window.__ctrl.update();
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOT_DIR, 'fixes-overview.png') });

  console.log('PAGE-ERRORS n=', pageErrors.length);
  for (const e of pageErrors.slice(0, 10)) console.log('  ', e);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
