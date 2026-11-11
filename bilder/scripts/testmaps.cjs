// FE-Integrationstest fuer die Karten-Verwaltung.
// Startet ein lokales Mini-Backend (Express + mapsRoutes + In-Memory-Mongo),
// greift ueber preview-Build (Port 5200) + window.__API_URL-Override darauf zu.
//
// Setup wird im Script selbst gebaut — keine zusaetzliche Infrastruktur noetig
// ausser den Dev-Dependencies im BE-Repo (mongodb-memory-server) und der
// Playwright-Installation aus ~/Desktop/repos/video-app/.
//
// Benutzung: node scripts/testmaps.cjs [PREVIEW_URL]
//   PREVIEW_URL default: http://127.0.0.1:5200/bilder/

const path = require('path');
const http = require('http');
const BE = path.resolve(__dirname, '..', '..', '..', '..', 'BE');
const BE_NODE_MODULES = path.join(BE, 'node_modules');
require('module').Module._nodeModulePaths(BE_NODE_MODULES); // hint

const express = require(path.join(BE_NODE_MODULES, 'express'));
const mongoose = require(path.join(BE_NODE_MODULES, 'mongoose'));
const jwt = require(path.join(BE_NODE_MODULES, 'jsonwebtoken'));
const { MongoMemoryServer } = require(path.join(BE_NODE_MODULES, 'mongodb-memory-server'));

// Backend-Code:
process.env.JWT_SECRET = 'fe-test-secret';
const mapsRoutes = require(path.join(BE, 'src', 'routes', 'maps'));
const { seedExampleMap } = require(path.join(BE, 'src', 'seedExampleMap'));
const MapModel = require(path.join(BE, 'src', 'models', 'Map'));

const { chromium } = require(process.env.HOME + '/Desktop/repos/video-app/node_modules/playwright');

const PREVIEW_URL = process.argv[2] || 'http://127.0.0.1:5200/bilder/';

function log(step, ok, extra = '') {
  const tag = ok ? '  OK' : 'FAIL';
  console.log(`  ${tag}  ${step}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

async function startBE() {
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri(), { dbName: 'fe-maps-test' });
  await seedExampleMap();
  const app = express();
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });
  app.use('/api/maps', express.json({ limit: '10mb' }), mapsRoutes);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return { server, mem, port };
}

(async () => {
  const be = await startBE();
  console.log(`[test] BE auf Port ${be.port}`);
  const USER_ID = new mongoose.Types.ObjectId();
  const TOKEN = jwt.sign({ user: { id: String(USER_ID) } }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  // vor JEDEM Dokument: Override setzen + localStorage.token injizieren + Dialoge auto-confirmen.
  // WICHTIG: nicht sceneDoc/meta loeschen — wir brauchen Persistenz ueber reload.
  // Fuer die saubere Erststart-Baseline machen wir das weiter unten EINMALIG.
  await ctx.addInitScript(({ apiUrl, token }) => {
    window.__API_URL = apiUrl;
    try { localStorage.setItem('token', token); } catch (e) {}
    window.confirm = () => true;
  }, { apiUrl: `http://127.0.0.1:${be.port}`, token: TOKEN });

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [page.err]', e.message));
  page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error' && !t.includes('favicon')) console.log('  [con.err]', t);
  });

  try {
    console.log(`\n--- bootstrap gegen ${PREVIEW_URL} ---`);
    // Erster Load: fresh localStorage erzwingen, dann reload.
    await page.goto(`${PREVIEW_URL}?edit=1`);
    await page.evaluate(() => {
      try { localStorage.removeItem('dnd-world.sceneDoc.v1'); } catch (e) {}
      try { localStorage.removeItem('dnd-world.mapMeta.v1'); } catch (e) {}
    });
    await page.goto(`${PREVIEW_URL}?edit=1`);
    await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
    await page.waitForFunction(() => !!window.__mapsPanel, null, { timeout: 15000 });

    const hasPanel = await page.evaluate(() => !!document.getElementById('mapsPanel'));
    log('Maps-Panel sichtbar', hasPanel);
    // Warten bis refresh() die Liste geladen hat
    await page.waitForFunction(() => window.__mapsPanel?.maps?.length >= 1, null, { timeout: 15000 });
    const listCount = await page.evaluate(() => window.__mapsPanel.maps.length);
    log('Liste enthaelt Beispiel-Karte', listCount >= 1, `count=${listCount}`);

    // Neue Karte anlegen via Panel-Button (prompt → window.prompt überschreiben)
    // Fire-and-forget via setTimeout: Playwright-evaluate darf nicht bis zum
    // reload hängen, sonst stirbt der Execution Context waehrend wir noch warten.
    await page.evaluate(() => { window.prompt = () => 'My First Map'; });
    const nav1 = page.waitForEvent('framenavigated', { timeout: 30000 });
    await page.evaluate(() => { setTimeout(() => window.__mapsPanel._createFromCurrentOrEmpty('empty'), 10); });
    await nav1;
    await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
    await page.waitForFunction(() => !!window.__mapsPanel, null, { timeout: 15000 });
    const meta1 = await page.evaluate(() => JSON.parse(localStorage.getItem('dnd-world.mapMeta.v1') || 'null'));
    log('Neue Karte angelegt + URL/meta gesetzt', !!meta1?.mapId && meta1.name === 'My First Map' && meta1.isExample === false,
        `meta=${JSON.stringify(meta1)}`);
    const urlHasMap = await page.evaluate(() => new URL(location.href).searchParams.get('map'));
    log('URL enthaelt ?map=<id>', urlHasMap === meta1.mapId);

    // Doc aendern (ein Objekt platzieren) + auf Autosave warten
    await page.evaluate(() => {
      const ed = window.__editor;
      ed.setEditMode(true);
      ed.doc.objects.push({ id: 'obj_fe_test', type: 'house.homeA_blue', x: 5, z: 5, rotY: 0, scale: 3.2, yOffset: 0 });
      ed._markDirty();
    });
    // Warten bis save erfolgreich im Panel
    await page.waitForFunction(() => window.__mapsPanel?.status === 'saved', null, { timeout: 15000 });
    log('Autosave nach _markDirty beendet mit status=saved', true);

    // Serverseitig verifizieren
    const serverDoc = await MapModel.findById(meta1.mapId).lean();
    log('Backend persistiert Objekt', !!serverDoc.doc.objects.find((o) => o.id === 'obj_fe_test'),
        `obj-count=${serverDoc.doc.objects.length}`);

    // Reload → Objekt noch da (vom localStorage + nach ?map= aus BE zurueckgeholt)
    await page.reload();
    await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
    await page.waitForFunction(() => !!window.__editor, null, { timeout: 15000 });
    const objAfterReload = await page.evaluate(() => window.__editor.doc.objects.find((o) => o.id === 'obj_fe_test'));
    log('Reload: Objekt immer noch da', !!objAfterReload);

    // Beispiel oeffnen
    await page.waitForFunction(() => window.__mapsPanel?.maps?.length >= 1, null, { timeout: 15000 });
    const exampleId = await page.evaluate(() => window.__mapsPanel.maps.find((m) => m.isExample)?._id);
    const nav2 = page.waitForEvent('framenavigated', { timeout: 30000 });
    await page.evaluate((id) => { setTimeout(() => window.__mapsPanel._openMap(id), 10); }, exampleId);
    await nav2;
    await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
    await page.waitForFunction(() => !!window.__mapsPanel, null, { timeout: 15000 });
    const metaExample = await page.evaluate(() => JSON.parse(localStorage.getItem('dnd-world.mapMeta.v1') || 'null'));
    log('Beispiel-Karte geoeffnet', metaExample?.isExample === true);

    // Beispiel: Autosave darf NICHT laufen (status bleibt != saving/saved nach markDirty)
    await page.evaluate(() => {
      window.__mapsPanel.status = 'idle';
      window.__editor.doc.objects.push({ id: 'should_not_persist', type: 'house.homeA_blue', x: 10, z: 10, rotY: 0, scale: 3.2 });
      window.__editor._markDirty();
    });
    // 3s warten (Debounce ist 2s), prüfen dass status nicht saving/saved wurde
    await page.waitForTimeout(3200);
    const statusAfterExampleEdit = await page.evaluate(() => window.__mapsPanel.status);
    log('Beispiel: kein Autosave (status bleibt idle)', statusAfterExampleEdit === 'idle',
        `status=${statusAfterExampleEdit}`);
    const exBackend = await MapModel.findById(metaExample.mapId).lean();
    const exHasPollution = !!exBackend.doc.objects.find((o) => o.id === 'should_not_persist');
    log('Beispiel-Karte auf Backend bleibt unveraendert', !exHasPollution);

    // Als Kopie speichern
    await page.evaluate(() => { window.prompt = () => 'Mein Dorf-Fork'; });
    await page.evaluate(() => window.__mapsPanel._saveCurrentAsCopy());
    await page.waitForFunction(() => {
      const m = JSON.parse(localStorage.getItem('dnd-world.mapMeta.v1') || 'null');
      return m && m.isExample === false && m.name === 'Mein Dorf-Fork';
    }, null, { timeout: 15000 });
    const metaCopy = await page.evaluate(() => JSON.parse(localStorage.getItem('dnd-world.mapMeta.v1') || 'null'));
    log('Kopie angelegt, aktuelle Karte ist jetzt die Kopie', !!metaCopy.mapId && metaCopy.name === 'Mein Dorf-Fork');

    // 401-Simulation: Token entfernen, dirty machen, status → error
    await page.evaluate(() => {
      localStorage.removeItem('token');
      window.__mapsPanel._onEditorDocChanged(window.__editor.doc);
    });
    // _onEditorDocChanged returnt sofort weil hasToken() false. Also status unveraendert.
    // Echter 401-Test: Token setzen aber ungueltig
    await page.evaluate(() => { localStorage.setItem('token', 'invalid-token'); });
    await page.evaluate(() => {
      window.__editor.doc.objects.push({ id: 'bad_save', type: 'house.homeA_blue', x: 1, z: 2, rotY: 0, scale: 3.2 });
      window.__editor._markDirty();
    });
    await page.waitForFunction(() => window.__mapsPanel.status === 'error', null, { timeout: 15000 });
    log('Ungueltiger Token -> status=error, Daten bleiben lokal', true);
    const docStillLocal = await page.evaluate(() => window.__editor.doc.objects.find((o) => o.id === 'bad_save'));
    log('Lokales Doc behaelt Aenderung', !!docStillLocal);

    console.log('\n' + (process.exitCode ? 'ERGEBNIS: FAIL' : 'ERGEBNIS: OK'));
  } catch (e) {
    console.error('Test error:', e);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    await new Promise((r) => be.server.close(r));
    await mongoose.disconnect();
    await be.mem.stop();
  }
})();
