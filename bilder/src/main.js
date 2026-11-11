// Einstiegspunkt: Nachtszene — Dorf nach map-dorf.png.
// Renderer + Postprocessing + Kamera + Lichter + Szenenaufbau.
// Qualitaetsstufen ?q=low|medium|high (default: medium), Mess-Modi ?stats und ?bench.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import { PALETTE } from './palette.js';
import { loadAllAssets } from './scene/assets.js';
import { createTerrain, sampleHeight } from './scene/terrain.js';
import { createCobbleSquare } from './scene/ground.js';
import { createPathCobbles } from './scene/paths.js';
import { createGrassField, createFlowers } from './scene/grass.js';
import { placeVillage, scatterNature } from './scene/village.js';
import { buildStandaloneTree } from './scene/trees.js';
import { createSkyDome, createStars, createMoon } from './scene/sky.js';
import { createFireflies } from './scene/fireflies.js';
import { createGroundFog } from './scene/fog.js';
import { createHills } from './scene/hills.js';
import { createRivers } from './scene/river.js';
import { createBridges } from './scene/bridges.js';
import { createCastle } from './scene/castle.js';
import { createFields } from './scene/fields.js';
import { createOrchard } from './scene/orchard.js';
import { placeDecor } from './scene/decor.js';
import { createHousePaths } from './scene/housePaths.js';
import { WORLD_W, WORLD_D, toWorldX, toWorldZ, HOUSES } from './scene/mapLayout.js';
import { sampleState, formatClock } from './scene/dayNight.js';
import { loadFromStorage } from './editor/storage.js';
import { materializeHouses } from './editor/sceneDoc.js';
import { createLightsPool } from './scene/lightsPool.js';

// ---------- URL-Parameter --------------------------------------------------

const QS = new URLSearchParams(window.location.search);
const IS_LITE = QS.has('lite');
const SHOW_STATS = QS.has('stats');
const IS_BENCH = QS.has('bench');
const CAM_PRESET = QS.get('cam'); // 'low' | 'high' | 'side' | 'top' | null
// Tageszeit: 0..24. Default = 22 (Nacht, bisherige Stimmung).
const TIME_PARAM = QS.get('time');
const INITIAL_TIME = TIME_PARAM !== null ? Math.max(0, Math.min(24, parseFloat(TIME_PARAM))) : 22;

// Qualitaetsstufen
const QUALITY = (QS.get('q') || (IS_LITE ? 'low' : 'medium')).toLowerCase();
const Q = QUALITY === 'high' ? 'high' : (QUALITY === 'low' ? 'low' : 'medium');

// Pro Stufe: Renderaufloesung, Postprocessing, Instanzzahlen.
// Auf Retina laufen wir bewusst mit max 1.25 (sonst Pixel-Flut).
const PR_CAP = Q === 'high' ? 1.25 : (Q === 'low' ? 1.0 : 1.0);
const USE_BLOOM = Q !== 'low';
const USE_GRADE = Q !== 'low';
const BLOOM_RES_SCALE = Q === 'high' ? 1.0 : 0.5;
const GRASS_COUNT  = Q === 'high' ? 6000 : (Q === 'low' ? 1200 : 2400);
const FOREST_COUNT = Q === 'high' ? 420  : (Q === 'low' ? 160  : 240);
const FIREFLY_COUNT = Q === 'high' ? 32 : (Q === 'low' ? 10 : 18);
const TERRAIN_SEGS  = Q === 'high' ? 200 : (Q === 'low' ? 120 : 150);
const SHADOW_SIZE   = Q === 'high' ? 2048 : (Q === 'low' ? 1024 : 1536);
// WICHTIG: Lichtanzahl MUSS konstant pro Qualitaet sein (sonst Shader-Rekompilierung
// → Ruckler). Alle Lichter werden VOR dem ersten Frame eingerichtet und bleiben.
// Lichter-Pool: nearest-N-Zuweisung, Gesamtzahl konstant.
// Dennis-Target (Runde A): medium = 6, high = 10, low = 2.
const LIGHTS_POOL_COUNT = Q === 'high' ? 10 : (Q === 'low' ? 2 : 6);
// Alte Konstanten bleiben kompatibel, werden aber jetzt vom Pool uebersteuert.
const MAX_POINT_LIGHTS = 0;   // keine dedizierten village-PointLights mehr
const CASTLE_TORCH_COUNT = 0; // Fackeln nutzen jetzt den Pool
const USE_FOG_PLANES = Q === 'high';
const FOG_LAYERS = Q === 'high' ? 2 : 0;
const USE_HILLS = true;
const USE_FLOWERS = Q !== 'low';
const STAR_COUNT = Q === 'high' ? 650 : (Q === 'low' ? 350 : 500);
const SKY_FBM_ITERS = Q === 'high' ? 5 : 3;
const WATER_FBM_ITERS = Q === 'high' ? 4 : 3;

// ---------- Renderer -------------------------------------------------------

const container = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({
  antialias: Q !== 'low',
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PR_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.75;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Statische Szene -> Schatten nicht jeden Frame neu rechnen.
renderer.shadowMap.autoUpdate = false;
// autoReset=false: wir resetten manuell EINMAL pro Frame (nicht pro Pass),
// damit die Draw-Call-Summe aller EffectComposer-Passes korrekt ist.
renderer.info.autoReset = false;
container.appendChild(renderer.domElement);

// ---------- Scene + Fog ----------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyHorizon);
scene.fog = new THREE.FogExp2(PALETTE.fogColor, 0.0055);

// ---------- Kamera ---------------------------------------------------------

const temple = HOUSES.find((h) => h.id === 'temple');
const villageX = toWorldX(temple.px[0]);
const villageZ = toWorldZ(temple.px[1]);

let camera;
let camTargetX = villageX, camTargetY = 2.0, camTargetZ = villageZ;
if (CAM_PRESET === 'top') {
  camTargetX = 0; camTargetY = 0; camTargetZ = 0;
  const aspect = window.innerWidth / window.innerHeight;
  const halfH = 62;
  const halfW = halfH * aspect;
  camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 500);
  camera.position.set(0, 120, 0.001);
  camera.up.set(0, 0, -1);
} else {
  camera = new THREE.PerspectiveCamera(
    54, window.innerWidth / window.innerHeight, 0.1, 500,
  );
  if (CAM_PRESET === 'side') {
    camera.position.set(villageX + 36, 16, villageZ + 4);
  } else if (CAM_PRESET === 'high') {
    camera.position.set(villageX + 18, 42, villageZ + 22);
  } else if (CAM_PRESET === 'low') {
    camera.position.set(villageX + 22, 10, villageZ + 22);
  } else if (CAM_PRESET === 'village') {
    // Nah am Dorfplatz: Brunnen + Marktstaende + umliegende Haeuser mit Gaerten.
    camera.position.set(villageX + 14, 9, villageZ + 16);
    camTargetX = villageX + 1.8;
    camTargetY = 1.6;
    camTargetZ = villageZ + 3.0;
  } else if (CAM_PRESET === 'farm') {
    // Hof oben links: Bienenkoerbe + Huehnerstall + Scheune.
    // Farm-Haus liegt ca. bei (-55, -26). Suedost drauf blicken.
    camera.position.set(-40, 10, -5);
    camTargetX = -60; camTargetY = 1.6; camTargetZ = -22;
  } else if (CAM_PRESET === 'garden') {
    // Direkt hinter einem Dorfhaus auf Beete+Zaun+Pflanzen schauen (Detail-Nachweis).
    camera.position.set(villageX + 6, 3.2, villageZ + 8);
    camTargetX = villageX + 0.5; camTargetY = 1.2; camTargetZ = villageZ + 4.5;
  } else if (CAM_PRESET === 'inspect') {
    // Sehr nah ran — fuer Debug der Haus-Bodenkante
    camera.position.set(villageX + 6, 2.2, villageZ + 4);
    camTargetX = villageX; camTargetY = 1.0; camTargetZ = villageZ + 1.5;
  } else {
    // Startansicht: schraeg von Suedosten, so dass Dorfkern + Steinbruecke +
    // Tempel + ein Stueck Fluss gut im Bild sind.
    camera.position.set(villageX + 42, 30, villageZ + 44);
    camTargetX = villageX + 4;
    camTargetY = 2.0;
    camTargetZ = villageZ + 2;
  }
}
camera.lookAt(camTargetX, camTargetY, camTargetZ);

// ---------- Himmel + Mond + Sterne ----------------------------------------

const moonDir = new THREE.Vector3(-0.60, 0.45, -0.40).normalize();

const skyDome = createSkyDome(moonDir, { fbmIters: SKY_FBM_ITERS });
const stars = createStars(STAR_COUNT);
const moon = createMoon(moonDir);
if (CAM_PRESET !== 'top') {
  scene.add(skyDome);
  scene.add(stars);
  scene.add(moon);
} else {
  scene.background = new THREE.Color(0x0b1130);
}

// ---------- Berg-Silhouette -----------------------------------------------

let hillsGroup = null;
if (USE_HILLS && CAM_PRESET !== 'top') {
  hillsGroup = createHills();
  hillsGroup.position.set(villageX, 0, villageZ);
  scene.add(hillsGroup);
}

// ---------- Licht ----------------------------------------------------------

// Mondlicht — EINZIGE Shadow-Caster-Lichtquelle (Performance).
const moonLight = new THREE.DirectionalLight(PALETTE.moonLight, 5.2);
moonLight.position.copy(moonDir).multiplyScalar(60).add(new THREE.Vector3(villageX, 0, villageZ));
moonLight.target.position.set(villageX, 0, villageZ);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
moonLight.shadow.camera.near = 1;
moonLight.shadow.camera.far = 120;
// Eng um den sichtbaren Dorfkern — spart Pixel.
const SHAD_SIZE = 42;
moonLight.shadow.camera.left   = -SHAD_SIZE;
moonLight.shadow.camera.right  =  SHAD_SIZE;
moonLight.shadow.camera.top    =  SHAD_SIZE;
moonLight.shadow.camera.bottom = -SHAD_SIZE;
moonLight.shadow.bias = -0.00032;
moonLight.shadow.normalBias = 0.04;
moonLight.shadow.radius = 2.5;
scene.add(moonLight);
scene.add(moonLight.target);

const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.65);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0x3a4a78, 0.95);
scene.add(ambient);
// Fuer dayNight-Update spaeter.
if (typeof window !== 'undefined') window.__ambient = ambient;
// Lampen-Multiplikator (von dayNight gesetzt): 0..1. Flicker-Funktionen
// multiplizieren ihre Grundintensitaeten damit, damit Lampen tagsueber
// nahtlos ausblenden ohne Lichteranzahl zu aendern.
if (typeof window !== 'undefined') window.__lamps = { multiplier: 1.0 };

// Globaler Lichter-Pool — konstante Anzahl echter PointLights.
const lightsPool = createLightsPool(scene, { count: LIGHTS_POOL_COUNT });
if (typeof window !== 'undefined') window.__lightsPool = lightsPool;

// ---------- Welt ----------------------------------------------------------

const world = new THREE.Group();
scene.add(world);

const ground = createTerrain({ segs: TERRAIN_SEGS });
world.add(ground);

const rivers = createRivers(moonDir, { fbmIters: WATER_FBM_ITERS });
world.add(rivers);

const sq = createCobbleSquare(3.0, Q === 'low' ? 140 : 220, villageX + 1.3, villageZ + 1.8);
world.add(sq);

world.add(createPathCobbles(sampleHeight));
// Karten-Bruecken: sceneDoc synchron laden (localStorage) damit procOverrides
// (verschieben/drehen/skalieren/loeschen) direkt bei der ersten Erzeugung
// greifen. loadFromStorage ist sync.
const _bridgeSceneDoc = loadFromStorage();
world.add(createBridges(_bridgeSceneDoc));
world.add(createFields());
const orchardGroup = createOrchard();
world.add(orchardGroup);
const castleGroup = createCastle({ torchCount: CASTLE_TORCH_COUNT });
world.add(castleGroup);

// ---------- Postprocessing -----------------------------------------------

const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);

composer.addPass(new RenderPass(scene, camera));

let bloom = null;
if (USE_BLOOM) {
  const bw = Math.round(window.innerWidth * BLOOM_RES_SCALE);
  const bh = Math.round(window.innerHeight * BLOOM_RES_SCALE);
  // Threshold leicht angehoben (0.88 -> 0.95), damit helle Vertex-Farben am
  // Boden (bemaltes Terrain mit Schnee/Sand, Haus-Fassaden im Mittagslicht)
  // nicht ungewollt gluehen. Laternen/Fenster-Glow haben Emissive-Werte deutlich
  // darueber und bleiben weiter sichtbar.
  bloom = new UnrealBloomPass(new THREE.Vector2(bw, bh), 0.50, 0.65, 0.95);
  composer.addPass(bloom);
  if (typeof window !== 'undefined') window.__bloom = bloom;
}

if (USE_GRADE) {
  const colorShader = {
    uniforms: {
      tDiffuse: { value: null },
      uSat: { value: 1.08 },
      uColdShadow: { value: new THREE.Color(0x2e3878) },
      uWarmLight:  { value: new THREE.Color(0xffd199) },
      uGradeAmount: { value: 0.16 },
      uVignette: { value: 0.45 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uSat;
      uniform vec3 uColdShadow;
      uniform vec3 uWarmLight;
      uniform float uGradeAmount;
      uniform float uVignette;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(l), c.rgb, uSat);
        float shMask = 1.0 - smoothstep(0.0, 0.5, l);
        float hiMask = smoothstep(0.5, 1.0, l);
        c.rgb = mix(c.rgb, c.rgb * uColdShadow * 2.0, shMask * uGradeAmount);
        c.rgb = mix(c.rgb, c.rgb * uWarmLight * 1.05, hiMask * uGradeAmount * 0.6);
        float d = distance(vUv, vec2(0.5));
        float v = smoothstep(0.9, 0.3, d);
        c.rgb *= mix(1.0 - uVignette, 1.0, v);
        gl_FragColor = c;
      }
    `,
  };
  composer.addPass(new ShaderPass(colorShader));
}

// Grade-Shader-Uniforms fuer Tageszeit-Anpassung expose.
const _gradePass = composer.passes.find(
  (p) => p.material && p.material.uniforms && p.material.uniforms.uGradeAmount,
);

composer.addPass(new OutputPass());

// ---------- Asset-Load + Szenenaufbau -------------------------------------

const info = document.createElement('div');
info.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);color:#eef;font:14px/1.3 sans-serif;text-align:center;';
info.textContent = 'Lade Dorf…';
container.appendChild(info);

// Stats-Overlay (?stats oder ?bench)
let statsEl = null;
if (SHOW_STATS || IS_BENCH) {
  statsEl = document.createElement('div');
  statsEl.style.cssText = 'position:fixed;left:8px;top:8px;color:#dfe6ff;background:rgba(10,14,32,0.72);padding:6px 10px;font:12px/1.4 ui-monospace,monospace;border-radius:4px;z-index:10;pointer-events:none;';
  statsEl.textContent = 'stats…';
  container.appendChild(statsEl);
}

let forest = null;
let grass = null;
let grassMap = null;
let lanterns = [];
let campfires = [];
let windowGlows = [];
let roofLights = [];
let garlands = [];
let pathLights = [];
let castleTorches = [];
let fireflies = null;
let fog = null;

const perf = {
  lastLog: 0,
  frames: 0,
  avgMs: 16.6,
};

const loadStart = performance.now();

(async () => {
  await loadAllAssets();
  // Editor: SceneDoc laden (Haus-Overrides + extras). Wenn kein Override
  // vorhanden ist, bleibt die Startszene exakt wie vorher.
  const _sceneDoc = loadFromStorage();
  const _editorHouses = materializeHouses(_sceneDoc);
  const villageRes = placeVillage(world, {
    maxPointLights: MAX_POINT_LIGHTS,
    houses: _editorHouses,
  });
  const { occupiedRects, placedHouses } = villageRes;
  windowGlows = villageRes.windowGlows;
  roofLights = villageRes.roofLights;
  garlands = villageRes.garlands;
  pathLights = villageRes.pathLights;

  // Haus-Wege: schmale geschwungene Erdpfade zwischen jedem Haus und dem
  // naechsten Hauptweg + Querverbindungen zwischen Nachbarhaeusern. Muss VOR
  // Gras/Deko laufen, damit distanceToHousePaths() in deren Exclusions wirkt.
  const hp = createHousePaths(sampleHeight, placedHouses);
  world.add(hp.group);

  // Deko: Gaerten, Props, Marktstaende, Flussdeko etc. — alle instanziert.
  const decorRes = placeDecor(world, { placedHouses, occupiedRects });
  world.add(decorRes.group);
  // Decor-Rects werden fuer Wald/Felsen-Exclude mit beruecksichtigt.
  const exclRects = occupiedRects.concat(decorRes.decorRects);

  // ?cam=garden: Zielkoordinaten nach einem tatsaechlich platzierten Garten
  // ausrichten (vorher auf eine feste Stelle gezielt, die oft kein Garten war).
  // controls wurde bereits mit den alten camTarget-Werten initialisiert, also
  // auch hier nachziehen (Modul-Scope).
  if (CAM_PRESET === 'garden' && decorRes.firstGardenPos) {
    const gp = decorRes.firstGardenPos;
    const gy = sampleHeight(gp.x, gp.z);
    camera.position.set(gp.x + 3.2, gy + 2.4, gp.z + 3.2);
    camTargetX = gp.x; camTargetY = gy + 0.6; camTargetZ = gp.z;
    camera.lookAt(camTargetX, camTargetY, camTargetZ);
    if (typeof controls !== 'undefined' && controls?.target) {
      controls.target.set(camTargetX, camTargetY, camTargetZ);
      controls.update();
    }
  }

  const { forest: forestGroup, treeCount, rocks: rocksList } = scatterNature(world, exclRects, {
    count: FOREST_COUNT,
  });
  forest = forestGroup;

  world.traverse((o) => {
    if (o.name === 'lantern') lanterns.push(o);
    if (o.name === 'campfire') campfires.push(o);
    if (o.name === 'castleTorch') castleTorches.push(o);
  });

  // Zwei Gras-Schichten:
  // 1) Dicht ums Dorf (innerer Kreis) — wie bisher, hohe Dichte.
  // 2) Map-weit, duenner — fuellt die freien Wiesen ueberall.
  grass = createGrassField({
    count: Math.round(GRASS_COUNT * 0.55),
    innerRadius: 3.5,
    outerRadius: Q === 'high' ? 24 : 18,
    excludeRects: exclRects,
    centerX: villageX,
    centerZ: villageZ,
  });
  world.add(grass);
  // Map-weites Gras: deckt den Rest der Karte ab (bis Waldraender und Felder).
  grassMap = createGrassField({
    count: Math.round(GRASS_COUNT * 0.75),
    excludeRects: exclRects,
    centerX: villageX,
    centerZ: villageZ,
    mapMode: true,
    mapWidth: WORLD_W * 0.95,
    mapDepth: WORLD_D * 0.95,
    densityFalloff: Q === 'high' ? 0.45 : 0.3,
  });
  world.add(grassMap);
  if (USE_FLOWERS) {
    world.add(createFlowers({
      count: 40,
      innerRadius: 4.0,
      outerRadius: 16,
      excludeRects: exclRects,
      centerX: villageX,
      centerZ: villageZ,
    }));
  }

  fireflies = createFireflies(FIREFLY_COUNT, 14, exclRects, {
    centerX: villageX,
    centerZ: villageZ,
  });
  world.add(fireflies);

  if (USE_FOG_PLANES && CAM_PRESET !== 'top') {
    fog = createGroundFog({ radius: 38, layers: FOG_LAYERS });
    fog.position.set(villageX, 0, villageZ);
    world.add(fog);
  }

  info.remove();

  // Shader-Vorkompilierung: three.js kompiliert Shader sonst erst beim ersten
  // Sichtbarwerden eines Materials -> massive Ruckler nach dem Laden.
  // renderer.compile(scene, camera) kompiliert alle fuer diese Kamera noetigen
  // Programme einmal vor dem ersten echten Frame.
  try {
    renderer.compile(scene, camera);
  } catch (e) { /* ignore — fallback ist der normale Pfad */ }

  // Schatten EINMAL berechnen (statische Szene).
  renderer.shadowMap.needsUpdate = true;
  // Einmal rendern, damit Shadow-Pass + Bloom-Buffer initialisiert sind.
  renderer.info.reset?.();
  composer.render();

  window.__sceneReady = true;
  window.__stats = {
    quality: Q,
    pixelRatio: renderer.getPixelRatio(),
    trees: treeCount,
    grass: grass.userData.count,
    lanterns: lanterns.length,
    garlands: garlands.length,
    pathLights: pathLights.length,
    castleTorches: castleTorches.length,
    pointLights: 0, // wird nach einmal Rendern unten gezaehlt
    gardens: decorRes.gardenCount,
    gardenReasons: decorRes.gardenReasons,
    firstGardenPos: decorRes.firstGardenPos,
    decorInstances: decorRes.decorInstanceTotal,
    decorPools: decorRes.poolCounts,
    camPreset: CAM_PRESET,
    loadMs: Math.round(performance.now() - loadStart),
  };
  let pl = 0;
  scene.traverse((o) => { if (o.isPointLight) pl++; });
  window.__stats.pointLights = pl;

  // Lampen-Material-/Lichter-Sammlung fuer Tageszeit-Multiplikator.
  // Nach allen Flickern pro Frame multipliziert die animate()-Loop sie mit
  // window.__lamps.multiplier -> Lampen blenden tagsueber aus.
  const lampMats = [];
  const lampLights = [];
  scene.traverse((o) => {
    if (o.isPointLight) {
      // Nur echte Lampen-PointLights (nicht das Mondlicht — das ist Directional).
      lampLights.push(o);
    }
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (mat && mat.emissive && mat.emissiveIntensity > 0.25) {
          // Mond-/Sternen-Shader haben kein emissive im Standard-Sinn -> gefiltert.
          lampMats.push(mat);
        }
      }
    }
  });
  window.__lamps.materials = lampMats;
  window.__lamps.lights = lampLights;

  // Jetzt die Tageszeit initial anwenden (nach allen Lichtern + Materialien).
  applyTimeOfDay(INITIAL_TIME);

  // Editor mounten (nur wenn NICHT im Bench-Modus — spart Overhead/Noise).
  // Button + Palette sind initial versteckt; ?edit=1 startet direkt im
  // Bauen-Modus (fuer Tests + Direktaufruf).
  if (!IS_BENCH) {
    const { Editor } = await import('./editor/editor.js');
    const editor = new Editor({
      scene, camera, renderer, controls, world,
      villageGroup: world, container,
      applyTimeOfDay,
    });

    // --- Prozedurale Picker registrieren -------------------------------------
    // Baeume aus forest.userData.procMeta (pine + leafy).
    const forestProc = forest && forest.userData && forest.userData.procMeta;
    if (forestProc) {
      for (const key of ['pine', 'leafy']) {
        const p = forestProc[key];
        if (!p) continue;
        editor.registerProcPicker({
          instancedMeshes: p.instancedMeshes,
          meta: p.meta,
          buildMesh: ({ type, x, z, rotY, scale, y }) => buildStandaloneTree({
            type: type === 'tree.leafy' ? 'leafy' : 'pine',
            x, y: y ?? sampleHeight(x, z), z, rotY, scale,
          }),
        });
      }
    }
    // Decor-Pool-Sources (KayKit-Props: barrel, crate, sack, bucket, etc.).
    if (decorRes.procPickerSources) {
      for (const src of decorRes.procPickerSources) {
        const p = src.userData.procMeta;
        editor.registerProcPicker({
          instancedMeshes: p.instancedMeshes,
          meta: p.meta,
          // buildMesh=null -> Editor nutzt spawnPlaceable(type)
        });
      }
    }
    // Lantern-Pool (world.children werden traversiert — wir koennten direkt
    // suchen; einfacher: Scene-Traverse nach userData.procMeta).
    scene.traverse((o) => {
      if (o.userData && o.userData.procMeta && o.userData.procMeta.procType === 'light.lantern') {
        editor.registerProcPicker({
          instancedMeshes: o.userData.procMeta.instancedMeshes,
          meta: o.userData.procMeta.meta,
          // Fuer light.lantern reicht spawnPlaceable (nutzt editorLights.buildLightByType).
        });
      }
    });

    // Obstbaeume (Orchard) — alle 4 InstancedMeshes (Stamm + 3 Kronen-Blobs)
    // teilen sich den selben Meta-Index. Bei instanceId=i werden alle 4 Instanzen
    // am Index i versteckt und ein einzelner Obstbaum (tree.orchard) via
    // spawnPlaceable neu erzeugt (nutzt catalog.asset 'tree_single_A').
    if (orchardGroup && orchardGroup.userData.procMeta) {
      const op = orchardGroup.userData.procMeta;
      editor.registerProcPicker({
        instancedMeshes: op.instancedMeshes,
        meta: op.meta,
        // buildMesh=null -> spawnPlaceable mit tree.orchard
      });
    }
    // Einzeln platzierte prozedurale Objekte (Felsen): procOverrides anwenden.
    editor.applyProcOverridesToScene();

    if (QS.has('edit')) editor.setEditMode(true);
  }
  // Kompakt und pruefbar: Gaerten + Top-Deko-Pools im Log.
  console.log('[dnd-world] Szene bereit:', {
    quality: Q, gardens: decorRes.gardenCount, gardenReasons: decorRes.gardenReasons,
    decorInstances: decorRes.decorInstanceTotal,
    pointLights: pl, loadMs: window.__stats.loadMs,
    firstGardenPos: decorRes.firstGardenPos,
    decorPools: decorRes.poolCounts,
  });
})();

// ---------- Freie Kamera (OrbitControls + Tastatur + Bounds) --------------

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(camTargetX, camTargetY, camTargetZ);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = CAM_PRESET === 'top' ? 20 : 4;
controls.maxDistance = CAM_PRESET === 'top' ? 140 : 120;
controls.minPolarAngle = CAM_PRESET === 'top' ? 0 : Math.PI * 0.05;
controls.maxPolarAngle = CAM_PRESET === 'top' ? Math.PI * 0.5 : Math.PI * 0.48;
controls.enablePan = true;
// screenSpacePanning=false: pan verschiebt parallel zum Boden (XZ-Ebene),
// nicht entlang Bildschirmachsen. Fuer "Karte verschieben"-Feel richtig.
controls.screenSpacePanning = false;
controls.panSpeed = 1.2;
controls.zoomSpeed = 1.0;
// Rad zoomt zum Mauszeiger hin (OrbitControls r144+).
if (!camera.isOrthographicCamera) controls.zoomToCursor = true;
// Mouse-Buttons explizit: LINKS=drehen, MITTE=dolly, RECHTS=pan.
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
// OrbitControls' eingebaute Tastatur-Pans (Arrows) deaktivieren — wir machen
// eine eigene, geschwindigkeits-adaptive Steuerung.
controls.keyPanSpeed = 0;
controls.update();

// Expose fuer Playwright-Test (scripts/testcam.cjs).
window.__cam = camera;
window.__ctrl = controls;

// ---------- Tastatur-Steuerung --------------------------------------------
// WASD/Pfeile: vor/links/zurueck/rechts (relativ zur Blickrichtung, auf XZ).
// Q/E: Azimuth drehen. R/F oder PageUp/PageDown: zoomen (dolly).
// Shift: 2.4x schneller. Geschwindigkeit steigt mit Zoom-Distanz.

const keys = Object.create(null);
// Fokus im Fenster behalten, damit keydown garantiert ankommt.
window.addEventListener('keydown', (e) => {
  // Keine Standard-Scrolls von Pfeiltasten/Space/Bild-hoch/runter.
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','PageUp','PageDown'].includes(e.code)) {
    e.preventDefault();
  }
  keys[e.code] = true;
}, { passive: false });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const _UP = new THREE.Vector3(0, 1, 0);
const _tmpF = new THREE.Vector3();
const _tmpR = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const MAP_BOUND_X = WORLD_W * 0.55;  // etwas groesser als die Karte
const MAP_BOUND_Z = WORLD_D * 0.55;
const MIN_HEIGHT_OVER_GROUND = 1.2;

function updateFreeCam(dt) {
  if (camera.isOrthographicCamera) return;
  const dist = Math.max(0.5, camera.position.distanceTo(controls.target));
  const speedMul = (keys.ShiftLeft || keys.ShiftRight) ? 2.4 : 1.0;
  const moveSpeed = (1.2 + dist * 0.22) * speedMul;   // units/sec
  const rotSpeed = 1.4 * speedMul;
  const zoomRate = (0.9 + dist * 0.25) * speedMul;

  // Blickrichtung auf XZ projiziert (Welt-horizontal).
  _tmpF.subVectors(controls.target, camera.position);
  _tmpF.y = 0;
  if (_tmpF.lengthSq() < 1e-6) _tmpF.set(0, 0, -1);
  _tmpF.normalize();
  _tmpR.crossVectors(_tmpF, _UP).normalize();

  let dx = 0, dz = 0;
  if (keys.KeyW || keys.ArrowUp)    { dx += _tmpF.x; dz += _tmpF.z; }
  if (keys.KeyS || keys.ArrowDown)  { dx -= _tmpF.x; dz -= _tmpF.z; }
  if (keys.KeyA || keys.ArrowLeft)  { dx -= _tmpR.x; dz -= _tmpR.z; }
  if (keys.KeyD || keys.ArrowRight) { dx += _tmpR.x; dz += _tmpR.z; }

  if (dx !== 0 || dz !== 0) {
    const mag = Math.hypot(dx, dz) || 1;
    const amt = moveSpeed * dt;
    const ox = (dx / mag) * amt;
    const oz = (dz / mag) * amt;
    camera.position.x += ox;
    camera.position.z += oz;
    controls.target.x += ox;
    controls.target.z += oz;
  }

  // Q/E: Azimuth um target rotieren (Boden parallel).
  if (keys.KeyQ || keys.KeyE) {
    const sign = keys.KeyE ? -1 : 1;
    _tmpDir.subVectors(camera.position, controls.target);
    const ang = sign * rotSpeed * dt;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const nx = _tmpDir.x * cosA - _tmpDir.z * sinA;
    const nz = _tmpDir.x * sinA + _tmpDir.z * cosA;
    camera.position.x = controls.target.x + nx;
    camera.position.z = controls.target.z + nz;
  }

  // R/F / PageUp/PageDown: Zoom in Richtung Blickachse.
  const zoomIn  = (keys.KeyR || keys.PageUp)   ? 1 : 0;
  const zoomOut = (keys.KeyF || keys.PageDown) ? 1 : 0;
  if (zoomIn || zoomOut) {
    _tmpDir.subVectors(camera.position, controls.target);
    const factor = zoomIn ? (1 - zoomRate * dt * 0.25) : (1 + zoomRate * dt * 0.25);
    const newLen = THREE.MathUtils.clamp(_tmpDir.length() * factor,
      controls.minDistance, controls.maxDistance);
    _tmpDir.setLength(newLen);
    camera.position.copy(controls.target).add(_tmpDir);
  }

  // Bounds: Ziel innerhalb der Karte halten.
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -MAP_BOUND_X, MAP_BOUND_X);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, -MAP_BOUND_Z, MAP_BOUND_Z);
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -MAP_BOUND_X * 1.3, MAP_BOUND_X * 1.3);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -MAP_BOUND_Z * 1.3, MAP_BOUND_Z * 1.3);

  // Ziel folgt Bodenhoehe (weich).
  const groundT = sampleHeight(controls.target.x, controls.target.z) + 1.2;
  controls.target.y += (groundT - controls.target.y) * Math.min(1, dt * 4);

  // Kamera mind. MIN_HEIGHT ueber Boden.
  const groundC = sampleHeight(camera.position.x, camera.position.z);
  if (camera.position.y < groundC + MIN_HEIGHT_OVER_GROUND) {
    camera.position.y = groundC + MIN_HEIGHT_OVER_GROUND;
  }
}

// ---------- Tageszeit-System ----------------------------------------------
// Ein zentraler applyTimeOfDay() setzt alle farbfuehrenden Uniforms +
// Lichtfarben + Fog + Exposure + Lampen-Intensitaeten anhand einer Stunde h.
// Lichter-ANZAHL bleibt konstant — NUR Intensitaeten aendern (sonst
// Shader-Rekompilierung + Ruckler).

let _currentTime = INITIAL_TIME;
let _lastShadowAt = -1e6;

function applyTimeOfDay(h) {
  _currentTime = h;
  const st = sampleState(h);
  // Himmelsdome + Sterne/Mond
  if (skyDome.userData.setColors) {
    skyDome.userData.setColors({
      skyTop: st.skyTop,
      skyMid: st.skyMid,
      skyHorizon: st.skyHorizon,
      skyGlow: st.skyGlow,
      cloudDark: st.cloudDark,
      cloudLight: st.cloudLight,
      cloudEdge: st.cloudEdge,
      sunDir: st.dir,
    });
  }
  scene.background = st.skyHorizon.clone();
  if (moon.userData.setDir) moon.userData.setDir(st.dir);
  moon.visible = st.nightMask > 0.05;
  stars.visible = st.nightMask > 0.05;
  if (stars.material && stars.material.uniforms) {
    // Sterne-Alpha-Multiplikator via opacity aus nightMask (kein Shader-Rekompilieren)
    stars.material.opacity = st.nightMask;
  }

  // Haupt-Directional-Licht: Sonne ODER Mond — gleiche Instanz, nur Richtung
  // + Farbe + Intensitaet aendern. Keine castShadow-Umschaltung (teuer).
  moonLight.color.copy(st.lightColor);
  moonLight.intensity = st.lightIntensity;
  const dir = st.dir.clone();
  moonLight.position.copy(dir).multiplyScalar(60)
    .add(new THREE.Vector3(villageX, 0, villageZ));
  moonLight.target.position.set(villageX, 0, villageZ);

  // Hemisphere + Ambient
  hemi.color.copy(st.hemiSky);
  hemi.groundColor.copy(st.hemiGround);
  hemi.intensity = st.hemiIntensity;
  // Ambient (zweites Child in scene) — wir haben lokalen Ref nicht, aber dann
  // ueber Traverse. Einfacher: reserve ref.
  if (window.__ambient) window.__ambient.intensity = st.ambientIntensity;

  // Fog
  if (scene.fog) {
    scene.fog.color.copy(st.fogColor);
    scene.fog.density = st.fogDensity;
  }

  // Exposure + Grade
  renderer.toneMappingExposure = st.exposure;
  if (_gradePass) {
    _gradePass.material.uniforms.uGradeAmount.value = st.gradeAmount;
  }

  // Lampen-Intensitaet (Multiplikator), ueber window.__lamps verteilt
  if (window.__lamps) window.__lamps.multiplier = st.lampsOn;

  // Fireflies: nur nachts (aus bei Tag)
  if (fireflies && fireflies.material && fireflies.material.uniforms) {
    fireflies.visible = st.nightMask > 0.1;
  }

  // Gras-Shader: Nachts kuehl-blaeulich (nicht mintgruen).
  for (const g of [grass, grassMap]) {
    if (g && g.material && g.material.userData && g.material.userData.shader) {
      g.material.userData.shader.uniforms.uNightMix.value = st.nightMask;
    }
  }

  // Wasser: Tageslicht-Farben
  if (rivers && rivers.userData && rivers.userData.applyDayTint) {
    rivers.userData.applyDayTint(st);
  }

  // Berge: Tag = gruen-graue Haenge mit Luftperspektive, Nacht = dunkel.
  if (hillsGroup && hillsGroup.userData && hillsGroup.userData.applyDayTint) {
    hillsGroup.userData.applyDayTint(st);
  }

  // Schatten neu berechnen (gedrosselt, waehrend Drag hoechstens alle 100 ms)
  const now = performance.now();
  if (now - _lastShadowAt > 100) {
    _lastShadowAt = now;
    renderer.shadowMap.needsUpdate = true;
  }

  // Bloom-Threshold dynamisch: Nachts tief (0.60) damit Laternen/Fenster
  // sichtbar gluehen, tagsueber hoch (2.4) damit helle Flaechen (Haeuser,
  // bemaltes Terrain mit Schnee/Sand) nicht ungewollt ueberstrahlen —
  // UnrealBloomPass arbeitet auf HDR-Input nach dem RenderPass, dort liegen
  // sonnenbelichtete Flaechen deutlich ueber 1.0.
  if (bloom) {
    bloom.threshold = 0.60 + (1.0 - st.nightMask) * 1.80;
  }

  // UI-Sync: wenn der Tageszeit-Slider existiert, aktuellen Wert anzeigen.
  // Dadurch laeuft der Slider mit, wenn applyTimeOfDay extern (Tests, Scripts)
  // aufgerufen wird. Vorher konnte die Szene bei 13:00 hell sein, waehrend der
  // Slider noch 22:00 anzeigte.
  if (typeof window !== 'undefined' && window.__timeUI) {
    try { window.__timeUI(h); } catch (e) { /* ignore */ }
  }
}

// Expose fuer Benches / Screenshots
window.__applyTime = applyTimeOfDay;
window.__ambient = null; // wird in loader gesetzt

// ---------- Slider-UI oben rechts ------------------------------------------
if (!IS_BENCH) {
  const panel = document.createElement('div');
  panel.id = 'timePanel';
  panel.style.cssText = [
    'position:fixed', 'right:12px', 'top:12px',
    'background:rgba(10,14,32,0.82)', 'color:#eaf0ff',
    'padding:10px 14px', 'border-radius:10px', 'z-index:30',
    'font:13px/1.2 ui-monospace,SF Mono,monospace',
    'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
    'display:flex', 'flex-direction:column', 'gap:6px',
    'min-width:220px',
  ].join(';');
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
  const label = document.createElement('div');
  label.textContent = 'Tageszeit';
  label.style.cssText = 'opacity:0.75;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;';
  const clockEl = document.createElement('div');
  clockEl.style.cssText = 'font-size:15px;font-weight:600;';
  const iconEl = document.createElement('span');
  iconEl.style.cssText = 'margin-right:4px;font-size:14px;';
  clockEl.appendChild(iconEl);
  const timeText = document.createElement('span');
  clockEl.appendChild(timeText);
  header.appendChild(label);
  header.appendChild(clockEl);
  panel.appendChild(header);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '24';
  slider.step = '0.1';
  slider.value = String(INITIAL_TIME);
  slider.style.cssText = 'width:100%;accent-color:#ffb867;cursor:pointer;';
  panel.appendChild(slider);
  const scale = document.createElement('div');
  scale.style.cssText = 'display:flex;justify-content:space-between;opacity:0.55;font-size:10px;';
  for (const tLabel of ['00','06','12','18','24']) {
    const s = document.createElement('span');
    s.textContent = tLabel;
    scale.appendChild(s);
  }
  panel.appendChild(scale);
  container.appendChild(panel);

  const updateUI = (h) => {
    timeText.textContent = formatClock(h);
    iconEl.textContent = (h >= 6 && h <= 18) ? '☀' : '☾';
    // Slider nachziehen (ohne Input-Event auszuloesen -> keine Rekursion).
    if (Math.abs(parseFloat(slider.value) - h) > 1e-3) {
      slider.value = String(h);
    }
  };
  updateUI(INITIAL_TIME);
  // Globale Callback-Haken, damit applyTimeOfDay(h) aus externen Aufrufern
  // (Tests, Scripts) die UI mitzieht. Siehe applyTimeOfDay() in dieser Datei.
  window.__timeUI = updateUI;
  slider.addEventListener('input', () => {
    const h = parseFloat(slider.value);
    updateUI(h);
    applyTimeOfDay(h);
  });
}

// ---------- Help-Overlay (blendet nach 6s aus) ----------------------------
if (!IS_BENCH) {
  const help = document.createElement('div');
  help.id = 'mainHelp';
  help.textContent = 'Rechte Maustaste: verschieben · Linke: drehen · Rad: zoomen · WASD / Pfeile / Q E / R F';
  help.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:12px', 'transform:translateX(-50%)',
    'color:#dfe6ff', 'background:rgba(10,14,32,0.72)',
    'padding:6px 10px', 'font:12px/1.3 ui-monospace,monospace',
    'border-radius:6px', 'z-index:20', 'pointer-events:none',
    'transition:opacity 1.2s ease',
  ].join(';');
  container.appendChild(help);
  setTimeout(() => { help.style.opacity = '0'; }, 6000);
  setTimeout(() => { help.remove(); }, 8000);
}

// ---------- Resize ---------------------------------------------------------

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  if (bloom) {
    bloom.setSize(
      Math.round(w * BLOOM_RES_SCALE),
      Math.round(h * BLOOM_RES_SCALE),
    );
  }
  if (camera.isOrthographicCamera) {
    const aspect = w / h;
    const halfH = 62;
    const halfW = halfH * aspect;
    camera.left = -halfW; camera.right = halfW;
    camera.top = halfH; camera.bottom = -halfH;
  } else {
    camera.aspect = w / h;
  }
  camera.updateProjectionMatrix();
});

// ---------- Bench-Modus: sammelt 600 Frames nach Scene-Ready --------------
// Gewartet wird: window.__sceneReady UND zusaetzlich 2 s danach (damit evtl.
// spaet aktivierte Shader-Kompilierungen oder Browser-Initialisierungen die
// Messung nicht verzerren). Werte: avg, p95, max, Zahl >33 ms, Zahl >100 ms.

const bench = {
  active: IS_BENCH,
  samples: [],
  targetFrames: 600,
  done: false,
  startedAt: 0,
  readyAt: 0,
  lastDraws: 0,
  lastTris: 0,
  // nur Frames einsammeln, die mind. 2 s nach sceneReady liegen
  warmupMs: 2000,
};

function finishBench() {
  if (bench.done) return;
  bench.done = true;
  const s = bench.samples.slice().sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  const p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
  const max = s[s.length - 1] ?? 0;
  let over33 = 0, over100 = 0;
  for (const v of bench.samples) {
    if (v > 33) over33++;
    if (v > 100) over100++;
  }
  const fps = 1000 / Math.max(avg, 0.001);
  const prog = renderer.info.programs?.length ?? 0;
  const result = {
    quality: Q,
    frames: s.length,
    avgMs: +avg.toFixed(2),
    p95Ms: +p95.toFixed(2),
    maxMs: +max.toFixed(2),
    over33,
    over100,
    fps: +fps.toFixed(1),
    drawCalls: bench.lastDraws,
    triangles: bench.lastTris,
    programs: prog,
    loadMs: window.__stats?.loadMs ?? -1,
    pointLights: window.__stats?.pointLights ?? -1,
  };
  window.__bench = result;
  const title = `BENCH q=${result.quality} fps=${result.fps} avg=${result.avgMs}ms p95=${result.p95Ms}ms max=${result.maxMs}ms >33=${result.over33} >100=${result.over100} draws=${result.drawCalls} tris=${result.triangles} progs=${result.programs} lights=${result.pointLights} load=${result.loadMs}ms`;
  document.title = title;
  // Zusaetzlich: in ein garantiert im dump-DOM landendes Element schreiben.
  const node = document.createElement('div');
  node.id = 'bench-result';
  node.setAttribute('data-bench', title);
  node.textContent = title;
  node.style.cssText = 'position:fixed;left:8px;bottom:8px;color:#dfe6ff;background:rgba(10,14,32,0.9);padding:6px 10px;font:12px ui-monospace,monospace;border-radius:4px;z-index:100;';
  document.body.appendChild(node);
  console.log('[dnd-world] BENCH', result);
}

// ---------- Loop -----------------------------------------------------------

const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  perf.frames++;
  perf.avgMs = perf.avgMs * 0.9 + dt * 1000 * 0.1;
  if (t - perf.lastLog > 0.5) {
    perf.lastLog = t;
    const fps = 1000 / Math.max(perf.avgMs, 0.001);
    window.__perf = { fps, frameMs: perf.avgMs };
    if (statsEl) {
      const r = renderer.info.render;
      statsEl.textContent =
        `q=${Q} fps=${fps.toFixed(1)} ${perf.avgMs.toFixed(1)}ms ` +
        `draws=${r.calls} tris=${r.triangles} ` +
        `lights=${window.__stats?.pointLights ?? '?'} ` +
        `grass=${window.__stats?.grass ?? '?'} trees=${window.__stats?.trees ?? '?'}`;
    }
  }

  if (grass && grass.userData.update) grass.userData.update(t);
  if (grassMap && grassMap.userData.update) grassMap.userData.update(t);
  if (forest && forest.userData.update) forest.userData.update(t);
  if (stars.userData.update) stars.userData.update(t);
  if (skyDome.userData.update) skyDome.userData.update(t);
  if (rivers && rivers.userData.update) rivers.userData.update(t);

  // Flicker nur fuer die (wenigen) echten Lichter.
  for (let i = 0; i < lanterns.length; i++) {
    const l = lanterns[i];
    if (l.userData.flicker) l.userData.flicker(t, i * 1.3);
  }
  for (const f of campfires) {
    if (f.userData.flicker) f.userData.flicker(t);
  }
  for (const tor of castleTorches) {
    if (tor.userData.flicker) tor.userData.flicker(t, tor.userData.phase);
  }
  // Fenster/Dach/Garland/Path: nur emissive-Flicker, sehr guenstig.
  for (let i = 0; i < windowGlows.length; i++) {
    const w = windowGlows[i];
    if (w.userData.flicker) w.userData.flicker(t, w.userData.phase ?? i * 0.9);
  }
  for (let i = 0; i < roofLights.length; i++) {
    const r = roofLights[i];
    if (r.userData.flicker) r.userData.flicker(t, r.userData.phase ?? i * 0.7);
  }
  for (let i = 0; i < garlands.length; i++) {
    const g = garlands[i];
    if (g.userData.flicker) g.userData.flicker(t, g.userData.phase ?? i * 0.5);
  }
  for (let i = 0; i < pathLights.length; i++) {
    const p = pathLights[i];
    if (p.userData.flicker) p.userData.flicker(t, p.userData.phase ?? i * 0.3);
  }

  if (fireflies && fireflies.userData.update) fireflies.userData.update(t);
  if (fog && fog.userData.update) fog.userData.update(t);

  // Tageszeit-Multiplikator auf alle Lampen-Lichter + Materialien anwenden.
  // Flicker setzte oben baseI*f bzw. baseE*f — jetzt noch *mult.
  if (window.__lamps && window.__lamps.materials) {
    const mult = window.__lamps.multiplier;
    if (mult !== 1.0) {
      const mats = window.__lamps.materials;
      for (let i = 0; i < mats.length; i++) mats[i].emissiveIntensity *= mult;
      const lts = window.__lamps.lights;
      for (let i = 0; i < lts.length; i++) lts[i].intensity *= mult;
    }
  }

  if (moon.userData.billboard) {
    moon.userData.billboard.quaternion.copy(camera.quaternion);
  }

  updateFreeCam(dt);
  controls.update();

  // Lichter-Pool: Kamera-Pos + Multiplier aktualisieren und Zuweisung ticken.
  if (lightsPool) {
    lightsPool.setCameraPosition(camera.position);
    lightsPool.setMultiplier(window.__lamps?.multiplier ?? 1.0);
    lightsPool.updateAssignment();
  }

  // Vor dem Render Counter zuruecksetzen (fuer saubere Pro-Frame-Werte).
  renderer.info.reset?.();
  composer.render();
  // Pro-Frame-Werte direkt nach dem Render sichern.
  bench.lastDraws = renderer.info.render.calls;
  bench.lastTris  = renderer.info.render.triangles;

  // Bench: Frames ab Scene-Ready + 2s Warm-up sammeln.
  if (bench.active && window.__sceneReady) {
    const now = performance.now();
    if (bench.readyAt === 0) bench.readyAt = now;
    if (now - bench.readyAt >= bench.warmupMs) {
      if (bench.samples.length === 0) bench.startedAt = now;
      bench.samples.push(dt * 1000);
      if (bench.samples.length >= bench.targetFrames) finishBench();
    }
  }

  requestAnimationFrame(animate);
}
animate();

// Headless-Fallback: nach 60s spaetestens den Bench abschliessen.
if (IS_BENCH) {
  setTimeout(() => { if (!bench.done) finishBench(); }, 60000);
}
