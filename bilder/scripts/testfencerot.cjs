// Zaunbau-Rotation Test (headless).
// Baut einen diagonalen Holzzaun ueber (0,0),(5,5),(10,0) und prueft:
//   - Fuer jede Latte: lokale +X-Achse der Instanzmatrix zeigt (|dot| > 0.99)
//     parallel zum Vektor Pfosten a->b.
//   - Mit der alten Konvention rotY = atan2(dz, dx) waere derselbe Test rot
//     (|dot| < 0.99 fuer mindestens eine Latte).

const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');

const URL = 'http://127.0.0.1:5199/?edit=1';

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

  p.on('pageerror', (e) => console.log('  [page.err]', e.message));
  p.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [con.err]', msg.text());
  });

  await p.goto(URL);
  await p.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
  await p.waitForFunction(() => !!window.__editor, null, { timeout: 30000 });

  // ==================== Analyse-Routine im Browser ====================
  // Gibt fuer Pfosten- und Latten-Pools die Dot-Produkte aus:
  //   current:  wie die aktuelle fences.js baut
  //   oldBug :  wie die alte (falsche) atan2(dz,dx)-Variante bauen wuerde
  const analysis = await p.evaluate(async () => {
    const { buildFence } = await import('/src/world/fences.js');
    const { distributeAlong, sampleCurve } = await import('/src/world/spline.js');

    const pts = [{ x: 0, z: 0 }, { x: 5, z: 5 }, { x: 10, z: 0 }];
    const sampleHeight = () => 0;

    // Erwartete Post-Positionen (gleich wie fences.js intern).
    const sampled = sampleCurve(pts, { samplesPerSegment: 15 });
    const posts = distributeAlong(sampled, 0.45);

    // 1) Build fence (CURRENT CODE)
    const fence = buildFence(pts, 'wood', sampleHeight);

    // Finde die beiden Pools
    let postPool = null, railPool = null;
    fence.traverse((o) => {
      if (!o.isInstancedMesh) return;
      // Posten-Geo: Box(0.11, 0.9, 0.11); Rail: Box(1.0, 0.07, 0.07)
      const g = o.geometry;
      const pars = g.parameters || {};
      if (pars.width === 0.11) postPool = o;
      else if (pars.width === 1.0 && pars.height === 0.07) railPool = o;
    });

    function sampleLocalX(mesh, i) {
      // Raw instanceMatrix.array: column-major, 16 floats pro Instanz.
      // Spalte 0 = lokale +X-Achse nach Transform (ohne Translation).
      const arr = mesh.instanceMatrix.array;
      const off = i * 16;
      const x = arr[off + 0], y = arr[off + 1], z = arr[off + 2];
      const l = Math.hypot(x, y, z) || 1;
      return { x: x / l, y: y / l, z: z / l };
    }

    // Rail-Richtungen (sollen zwischen posts[i] und posts[i+1] liegen)
    const railResults = [];
    const nRails = railPool.count;
    // railPool enthaelt 2 Latten PRO Pfosten-Paar (hoch + runter), also:
    //   instance 2*i und 2*i+1 gehoeren zu segment i (posts[i]->posts[i+1]).
    for (let r = 0; r < nRails; r++) {
      const seg = Math.floor(r / 2);
      const a = posts[seg], c = posts[seg + 1];
      if (!a || !c) continue;
      const dx = c.x - a.x, dz = c.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const dir = { x: dx / len, z: dz / len };
      const lx = sampleLocalX(railPool, r);
      // 2D-Dot (XZ-Ebene reicht)
      const dot = Math.abs(lx.x * dir.x + lx.z * dir.z);
      railResults.push({ r, seg, dot, lx: [lx.x, lx.z], dir: [dir.x, dir.z] });
    }

    // 2) Simuliere ALTE Variante: atan2(dz, dx) (buggy) -> dieselben Segmente,
    //    aber rotation.y so, wie der alte Code sie gewaehlt haette.
    const oldBug = [];
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i], c = posts[i + 1];
      const dx = c.x - a.x, dz = c.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const dir = { x: dx / len, z: dz / len };
      const rotY_old = Math.atan2(dz, dx); // BUG
      // local +X nach rotY_old transformiert: (cos, 0, -sin)
      const lx = { x: Math.cos(rotY_old), z: -Math.sin(rotY_old) };
      const dot = Math.abs(lx.x * dir.x + lx.z * dir.z);
      oldBug.push({ seg: i, dot, lx: [lx.x, lx.z], dir: [dir.x, dir.z] });
    }

    return {
      nPosts: posts.length,
      nRails,
      railDotMin: Math.min(...railResults.map(r => r.dot)),
      railDotAvg: railResults.reduce((a, b) => a + b.dot, 0) / railResults.length,
      railSample: railResults.slice(0, 3),
      oldBugDotMin: Math.min(...oldBug.map(r => r.dot)),
      oldBugSample: oldBug.slice(0, 3),
    };
  });

  console.log('  Analyse:', JSON.stringify(analysis, null, 2));

  log('Latten liegen entlang Segment (|dot| > 0.99)',
      analysis.railDotMin > 0.99,
      `minDot=${analysis.railDotMin.toFixed(4)} avg=${analysis.railDotAvg.toFixed(4)} nRails=${analysis.nRails}`);

  log('Alter Code waere rot gewesen (|dot| < 0.99 fuer min. 1 Segment)',
      analysis.oldBugDotMin < 0.99,
      `oldMinDot=${analysis.oldBugDotMin.toFixed(4)}`);

  // ============ Screenshot: diagonaler Zaun von schraeg oben ============
  // Zeichne 2 diagonale Zaeune (Holz+Flechtzaun) auf einer freien Flaeche
  // ausserhalb des Dorfs (nord-oestlich), damit nichts die Sicht verdeckt.
  await p.evaluate(() => {
    const E = window.__editor;
    E._setActiveTab('paths');
    // Zaun 1: Diagonale Treppe (-5..0 -> 0..5 -> 5..0)
    E.pathTool.beginDraw('wood');
    E.pathTool.onCanvasClick(25, 10);
    E.pathTool.onCanvasClick(30, 15);
    E.pathTool.onCanvasClick(35, 10);
    E.pathTool.finishDraw();
    // Zaun 2: 45-Grad gerade Diagonale (rein diagonales Segment)
    E.pathTool.beginDraw('wood');
    E.pathTool.onCanvasClick(25, 20);
    E.pathTool.onCanvasClick(35, 30);
    E.pathTool.finishDraw();
  });
  await p.waitForTimeout(400);

  // Kamera auf den Zaun zoomen + Tag fuer gute Sichtbarkeit.
  await p.evaluate(() => window.__applyTime(13));
  await p.waitForTimeout(150);
  await p.evaluate(() => {
    const E = window.__editor;
    const cam = E.camera;
    // Blick von schraeg oben auf die beiden Zaeune (Zentrum ~ (30, 0, 18))
    cam.position.set(42, 14, 30);
    cam.lookAt(30, 0, 18);
    cam.updateProjectionMatrix();
    if (E.controls && E.controls.target) {
      E.controls.target.set(30, 0, 18);
      E.controls.update();
    }
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'docs/editor-fence-rot-fix.png', fullPage: false });
  console.log('  Screenshot: docs/editor-fence-rot-fix.png');

  await b.close();
  if (process.exitCode) {
    console.log('\n  SUMMARY: FAIL');
  } else {
    console.log('\n  SUMMARY: OK');
  }
})().catch((e) => { console.error(e); process.exit(1); });
