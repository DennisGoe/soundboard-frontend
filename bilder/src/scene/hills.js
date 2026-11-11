// Berg-/Huegel-Silhouette am Horizont. Drei konzentrische Ringe (nah / mitte / fern)
// aus extrudierten Zackenprofilen (ZylinderGeo mit variabler Oberkante).
//
// Tageszeit-Farbshift: nachts dunkle Silhouetten (Palia-Nachthimmel), tags
// gruen-graue Haenge vorne, blaues Dunst-Blau hinten (Luftperspektive), mit
// hellen Spitzen (Pseudo-Schnee) auf den fernsten Zacken. Alles ueber
// userData.applyDayTint(state) — keine Shader-Rekompilierung, nur Farben.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

function makeRidgeGeometry(radius, height, segments, jitter, seed) {
  // Zackenprofil ueber Cylinder (openEnded) + Oberkante jittern.
  const topR = radius;
  const bottomR = radius;
  const geo = new THREE.CylinderGeometry(topR, bottomR, height, segments, 1, true);
  const pos = geo.attributes.position;
  const vCount = pos.count;
  // Pro-Vertex: aTop = 1 wenn oben, 0 wenn unten. Zusaetzlich aPeakStrength (0..1)
  // damit das Shader-/CPU-Tint die hoechsten Spitzen anders faerben kann (Schnee).
  const topFlag = new Float32Array(vCount);
  const peakF   = new Float32Array(vCount);
  for (let i = 0; i < vCount; i++) {
    const y = pos.getY(i);
    if (y > 0) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const n = Math.sin(ang * 5 + seed) * 0.5
              + Math.sin(ang * 11.3 + seed * 2.1) * 0.3
              + Math.sin(ang * 23.7 - seed * 1.3) * 0.2;
      const extra = Math.max(0, n) * jitter * height;
      pos.setY(i, y + extra);
      topFlag[i] = 1.0;
      // Peak = wie hoch im Vergleich zum max extraY — fuer Schnee-Mix.
      peakF[i] = Math.max(0, n);
    } else {
      topFlag[i] = 0.0;
      peakF[i] = 0.0;
    }
  }
  // Max peakF normalisieren.
  let maxP = 0;
  for (let i = 0; i < vCount; i++) if (peakF[i] > maxP) maxP = peakF[i];
  if (maxP > 0) {
    for (let i = 0; i < vCount; i++) peakF[i] /= maxP;
  }
  // Vertex-Colors: wir setzen initial alle auf weiss — ein Tint in applyDayTint
  // schreibt per-vertex-Farben dann dynamisch.
  const colors = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) {
    colors[i * 3 + 0] = 1;
    colors[i * 3 + 1] = 1;
    colors[i * 3 + 2] = 1;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.userData.topFlag = topFlag;
  geo.userData.peakF   = peakF;
  geo.computeVertexNormals();
  return geo;
}

// Pro-Ring: baut einen Mesh + liefert applyTint(nightMask)-Callback.
function buildRing({
  radius, height, segs, jitter, seed, y, renderOrder,
  dayBase, dayTop, dayPeak,     // 3 Farben (bottom / top / snow peak)
  nightBase, nightTop, nightPeak,
  fog,
}) {
  const geo = makeRidgeGeometry(radius, height, segs, jitter, seed);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    fog,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;

  const topFlag = geo.userData.topFlag;
  const peakF   = geo.userData.peakF;
  const cAttr   = geo.attributes.color;
  const _cDay = new THREE.Color();
  const _cNight = new THREE.Color();
  const _c = new THREE.Color();

  // Wird extern bei Tageszeitwechsel aufgerufen.
  function applyTint(nightMask) {
    const nm = THREE.MathUtils.clamp(nightMask, 0, 1);
    const cDayBase  = new THREE.Color(dayBase);
    const cDayTop   = new THREE.Color(dayTop);
    const cDayPeak  = new THREE.Color(dayPeak);
    const cNightBase= new THREE.Color(nightBase);
    const cNightTop = new THREE.Color(nightTop);
    const cNightPeak= new THREE.Color(nightPeak);
    for (let i = 0; i < topFlag.length; i++) {
      const isTop = topFlag[i] > 0.5;
      const pk = peakF[i];
      if (isTop) {
        // Tag: bottom -> top -> peak (Schnee)
        _cDay.copy(cDayTop).lerp(cDayPeak, pk);
        _cNight.copy(cNightTop).lerp(cNightPeak, pk);
      } else {
        _cDay.copy(cDayBase);
        _cNight.copy(cNightBase);
      }
      _c.copy(_cDay).lerp(_cNight, nm);
      cAttr.setXYZ(i, _c.r, _c.g, _c.b);
    }
    cAttr.needsUpdate = true;
  }
  // Initial: Nacht-Look
  applyTint(1.0);
  return { mesh, applyTint };
}

export function createHills() {
  const group = new THREE.Group();
  group.name = 'hills';

  // Ring 1: ganz nah — folgt dem Terrainrand, am hellsten tagsueber (gruene Haenge).
  const near = buildRing({
    radius: 82, height: 6, segs: 200, jitter: 1.4, seed: 11.1,
    y: 0.5, renderOrder: -7,
    dayBase: 0x3f5a38, dayTop: 0x6b8a52, dayPeak: 0x96b482,
    nightBase: PALETTE.hillsNear, nightTop: 0x151840, nightPeak: 0x2a2c58,
    fog: true,
  });
  group.add(near.mesh);

  // Ring 2: mitte — Luftperspektive, Dunst-Blaugrau.
  const mid = buildRing({
    radius: 110, height: 10, segs: 180, jitter: 1.1, seed: 5.3,
    y: 1.5, renderOrder: -7,
    dayBase: 0x475a60, dayTop: 0x6a7e8a, dayPeak: 0x9fb2be,
    nightBase: PALETTE.hillsFar, nightTop: 0x1a2048, nightPeak: 0x2a305c,
    fog: true,
  });
  group.add(mid.mesh);

  // Ring 3: ganz fern — tiefblauer Dunst mit Schneekuppen (Luftperspektive).
  const far = buildRing({
    radius: 145, height: 14, segs: 160, jitter: 0.9, seed: 1.7,
    y: 3.0, renderOrder: -7,
    dayBase: 0x506a80, dayTop: 0x7890a8, dayPeak: 0xe4ebf4,
    nightBase: PALETTE.hillsFar, nightTop: 0x1a2048, nightPeak: 0x283060,
    fog: false,
  });
  group.add(far.mesh);

  group.userData.applyDayTint = (st) => {
    const nm = st.nightMask;
    near.applyTint(nm);
    mid.applyTint(nm);
    far.applyTint(nm);
  };

  return group;
}
