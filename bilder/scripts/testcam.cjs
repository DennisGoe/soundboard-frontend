// Interaktionstest: Rechtsklick-Drag + Keyboard, prueft dass sich
// controls.target bzw. camera.position veraendern. Unsichtbar headless.
const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'],
  });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto('http://127.0.0.1:5199/?q=medium');
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });

  // Expose Werte.
  await p.evaluate(() => {
    // Suche die OrbitControls im Modul-Scope via globalen Fallback -> an module.hot nicht da,
    // stattdessen lesen wir camera.position + controls.target durch Event-Hooks.
    // main.js hat die Instanz nicht ins window gelegt. Wir patchen:
    // Alternative: Mauseevents feuern und Renderer-Camera abfragen, die als
    // __THREE_DEVTOOLS__ nicht einfach erreichbar ist. Deshalb: wir legen sie
    // nachtraeglich an.
  });

  // main.js exportiert nichts nach window. Deshalb mutieren wir das Live-Modul
  // ueber ein Code-Injection-Snippet:
  //   requestAnimationFrame + reach into THREE.Camera via scene traversal.
  const readCam = async () =>
    p.evaluate(() => {
      // Finde Scene via renderer.info — Workaround: __PERSISTENT__ three-exports
      // sind nicht standard. Stattdessen stellen wir in main.js __cam/__controls bereit?
      // Fallback: der Benutzer kann die Kamera-Position ueber eine CSS-Fixed-Overlay
      // ablesen — aber einfacher: wir lesen aus window.__perf.
      // Minimal: prufen ob Kamera bewegt wurde — ueber ein Attribut, das wir vorher setzen.
      return window.__camState || null;
    });

  // Injiziere einen Reader, der die Kamera anhand des Three-Renderer-Context findet.
  await p.evaluate(() => {
    // Finde das Canvas-Element -> __THREE als Referenz holen.
    // Schnellster Weg: patchen von requestAnimationFrame um auf scene access zu kommen
    // reicht nicht. Wir instrumentieren stattdessen window.addEventListener('mousemove') -> no-op.
    // Statt dem Hack: wir messen die camera via durch rAF geleitete WebGL-view-matrix.
    // Praktischer: wir haengen uns an renderer.info.
    // Kurz: wir annotieren controls.target + camera.position in main.js wenn __exposeCam gesetzt.
    // Da wir main.js nicht post-patchen koennen, machen wir einen Proxy:
    // Wir setzen window.__camLogAfter = true; der Loop in main.js checkt das nicht.
    // Also wirklich: bei dieser Architektur muessen wir fruehzeitig in main.js
    // einen window-Export einbauen. Siehe main.js-Patch unten (window.__cam + __ctrl).
  });

  // Wir setzen voraus, dass main.js window.__cam + window.__ctrl exponiert.
  await p.waitForFunction(() => window.__cam && window.__ctrl, null, { timeout: 15000 });

  const before = await p.evaluate(() => ({
    cam: { x: window.__cam.position.x, y: window.__cam.position.y, z: window.__cam.position.z },
    tgt: { x: window.__ctrl.target.x, y: window.__ctrl.target.y, z: window.__ctrl.target.z },
  }));

  // --- Rechtsklick-Drag: Pan. ---
  await p.mouse.move(800, 450);
  await p.mouse.down({ button: 'right' });
  await p.mouse.move(400, 300, { steps: 20 });
  await p.mouse.up({ button: 'right' });
  await p.waitForTimeout(400);
  const afterPan = await p.evaluate(() => ({
    cam: { x: window.__cam.position.x, z: window.__cam.position.z },
    tgt: { x: window.__ctrl.target.x, z: window.__ctrl.target.z },
  }));

  // --- Keyboard: W druecken ---
  await p.keyboard.down('KeyW');
  await p.waitForTimeout(600);
  await p.keyboard.up('KeyW');
  await p.waitForTimeout(200);
  const afterW = await p.evaluate(() => ({
    cam: { x: window.__cam.position.x, z: window.__cam.position.z },
    tgt: { x: window.__ctrl.target.x, z: window.__ctrl.target.z },
  }));

  // --- Q: rotieren ---
  const camBeforeQ = await p.evaluate(() => ({
    x: window.__cam.position.x, z: window.__cam.position.z,
  }));
  await p.keyboard.down('KeyQ');
  await p.waitForTimeout(500);
  await p.keyboard.up('KeyQ');
  await p.waitForTimeout(200);
  const afterQ = await p.evaluate(() => ({
    cam: { x: window.__cam.position.x, z: window.__cam.position.z },
  }));

  // --- R: zoomen ---
  const camBeforeR = await p.evaluate(() => ({
    x: window.__cam.position.x, y: window.__cam.position.y, z: window.__cam.position.z,
    d: Math.hypot(window.__cam.position.x - window.__ctrl.target.x,
                   window.__cam.position.y - window.__ctrl.target.y,
                   window.__cam.position.z - window.__ctrl.target.z),
  }));
  await p.keyboard.down('KeyR');
  await p.waitForTimeout(500);
  await p.keyboard.up('KeyR');
  await p.waitForTimeout(200);
  const afterR = await p.evaluate(() => ({
    d: Math.hypot(window.__cam.position.x - window.__ctrl.target.x,
                   window.__cam.position.y - window.__ctrl.target.y,
                   window.__cam.position.z - window.__ctrl.target.z),
  }));

  const log = (label, a, b) => {
    const dx = (b.cam?.x ?? 0) - (a.cam?.x ?? 0);
    const dz = (b.cam?.z ?? 0) - (a.cam?.z ?? 0);
    console.log(`  ${label}: cam Δx=${dx.toFixed(3)} Δz=${dz.toFixed(3)}  tgt Δx=${(b.tgt?.x ?? 0) - (a.tgt?.x ?? 0)} Δz=${(b.tgt?.z ?? 0) - (a.tgt?.z ?? 0)}`);
  };
  console.log('start cam', before.cam, 'target', before.tgt);
  log('right-pan', before, afterPan);
  log('key W',     afterPan, afterW);
  console.log(`  key Q: cam Δx=${(afterQ.cam.x - camBeforeQ.x).toFixed(3)} Δz=${(afterQ.cam.z - camBeforeQ.z).toFixed(3)}`);
  console.log(`  key R: distance ${camBeforeR.d.toFixed(2)} -> ${afterR.d.toFixed(2)}`);

  // Pass/Fail
  const panMoved = Math.hypot(afterPan.cam.x - before.cam.x, afterPan.cam.z - before.cam.z) > 0.5;
  const wMoved   = Math.hypot(afterW.cam.x - afterPan.cam.x, afterW.cam.z - afterPan.cam.z) > 0.1;
  const qRotated = Math.hypot(afterQ.cam.x - camBeforeQ.x, afterQ.cam.z - camBeforeQ.z) > 0.1;
  const rZoomed  = Math.abs(afterR.d - camBeforeR.d) > 0.1;
  console.log(`\n  Pan ${panMoved ? 'OK' : 'FAIL'}  W ${wMoved ? 'OK' : 'FAIL'}  Q ${qRotated ? 'OK' : 'FAIL'}  R ${rZoomed ? 'OK' : 'FAIL'}`);

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
