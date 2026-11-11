// Baeume: zwei Varianten — stilisierte Tannen (Zacken-Etagen) und runde
// Laubbaeume (Blob-Krone aus ueberlagerten Icospheres). Beide instanziert,
// mit Wind-Wiegen im Vertex-Shader und Farbverlauf unten dunkel -> oben hell.

import * as THREE from 'three';
import { sampleHeight } from './terrain.js';

// ---------- Geometrie-Helper -----------------------------------------------

function rand(i, seed) {
  const s = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// -- Tannen-Etage: Scheibe mit gezacktem Rand ------------------------------
function makeBranchLayer({ bottomR, height, segments, seed, droop = 0.35, jaggedness = 0.75 }) {
  const segs = Math.max(10, segments);
  const positions = [];
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const ang = t * Math.PI * 2;
    const r = bottomR * (1 - jaggedness * 0.18 * rand(i, seed));
    const y = -droop * (0.55 + rand(i + 50, seed) * 0.8);
    positions.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
  }
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const ang = t * Math.PI * 2;
    const r = bottomR * 0.68;
    const y = height * 0.32;
    positions.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
  }
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const ang = t * Math.PI * 2;
    const r = bottomR * 0.32;
    const y = height * 0.78;
    positions.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
  }
  positions.push(0, height * 1.02, 0);

  const ringRim = 0;
  const ringMid = segs;
  const ringUp  = segs * 2;
  const peak    = segs * 3;

  const indices = [];
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % segs;
    indices.push(ringRim + i, ringRim + i2, ringMid + i2);
    indices.push(ringRim + i, ringMid + i2, ringMid + i);
    indices.push(ringMid + i, ringMid + i2, ringUp + i2);
    indices.push(ringMid + i, ringUp + i2, ringUp + i);
    indices.push(ringUp + i, ringUp + i2, peak);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// -- Stamm: schmaler, leicht gekruemmter Zylinder --------------------------
function makeTrunk(height, baseR, topR, bend = 0) {
  const segs = 6;
  const radial = 7;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = t * height;
    const b = Math.sin(t * Math.PI) * bend;
    pts.push(new THREE.Vector3(b, y, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, segs * 2, baseR, radial, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / height, 0, 1);
    const rScale = THREE.MathUtils.lerp(1.0, topR / baseR, t);
    const cx = curve.getPointAt(t).x;
    const cz = curve.getPointAt(t).z;
    const dx = pos.getX(i) - cx;
    const dz = pos.getZ(i) - cz;
    pos.setXYZ(i, cx + dx * rScale, y, cz + dz * rScale);
  }
  geo.computeVertexNormals();
  return geo;
}

// -- Tanne: mehrere Etagen gestapelt ---------------------------------------
function buildPineTree(seed, { layers = 7, baseHeight = 3.2 } = {}) {
  const geos = [];
  let yCursor = 0.35;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const bottomR = THREE.MathUtils.lerp(1.15, 0.22, Math.pow(t, 0.9));
    const h = THREE.MathUtils.lerp(0.95, 0.5, t);
    const g = makeBranchLayer({
      bottomR,
      height: h,
      segments: 12,
      seed: seed + i * 3.7,
      droop: 0.32 + t * 0.08,
      jaggedness: 0.85,
    });
    g.translate(0, yCursor, 0);
    geos.push(g);
    yCursor += h * 0.52;
  }
  const merged = mergeGeometries(geos);
  merged.computeBoundingBox();
  const h = merged.boundingBox.max.y - merged.boundingBox.min.y;
  const s = baseHeight / h;
  merged.scale(s, s, s);
  return merged;
}

// -- Laubbaum: Krone aus mehreren Icospheres, leicht verformt --------------
function buildLeafyTree(seed, { blobs = 4, baseHeight = 2.8 } = {}) {
  const geos = [];
  // Zentrale grosse Blase als Grundkoerper
  const center = new THREE.IcosahedronGeometry(1.0, 1);
  // Noise-Deformation fuer organische Kanten
  {
    const pos = center.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const n = Math.sin(vx * 2.1 + seed) * 0.5
              + Math.sin(vy * 2.7 - seed * 0.7) * 0.3
              + Math.sin(vz * 1.8 + seed * 1.4) * 0.2;
      const s = 1.0 + n * 0.14;
      pos.setXYZ(i, vx * s, vy * s * 1.1, vz * s);
    }
    center.computeVertexNormals();
  }
  center.translate(0, 0.3, 0);
  geos.push(center);

  // Weitere Blobs am Rand
  for (let b = 0; b < blobs; b++) {
    const ang = (b / blobs) * Math.PI * 2 + seed * 0.7;
    const r = 0.55 + rand(b, seed) * 0.2;
    const h = 0.4 + rand(b + 20, seed) * 0.35;
    const sx = 0.55 + rand(b + 40, seed) * 0.25;
    const bg = new THREE.IcosahedronGeometry(sx, 1);
    const pos = bg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const n = Math.sin(vx * 2.8 + seed + b) * 0.5
              + Math.sin(vy * 2.1 + seed * 0.9) * 0.5;
      const s = 1.0 + n * 0.12;
      pos.setXYZ(i, vx * s, vy * s, vz * s);
    }
    bg.computeVertexNormals();
    bg.translate(Math.cos(ang) * r, 0.1 + h, Math.sin(ang) * r);
    geos.push(bg);
  }

  // Oberer Blob (Spitze der Krone)
  const top = new THREE.IcosahedronGeometry(0.55, 1);
  {
    const pos = top.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const n = Math.sin(vx * 3.0 + seed * 1.3) * 0.5
              + Math.sin(vz * 2.6 - seed) * 0.5;
      const s = 1.0 + n * 0.1;
      pos.setXYZ(i, vx * s, vy * s, vz * s);
    }
    top.computeVertexNormals();
  }
  top.translate(0, 0.95, 0);
  geos.push(top);

  const merged = mergeGeometries(geos);
  merged.computeBoundingBox();
  const h = merged.boundingBox.max.y - merged.boundingBox.min.y;
  const s = baseHeight / h;
  merged.scale(s, s, s);
  return merged;
}

// ---------- Materialien ----------------------------------------------------

function makeCrownMaterial(colorDark, colorLight, heightRef, windStrength = 0.08) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: windStrength };
    shader.uniforms.uColDark = { value: new THREE.Color(colorDark) };
    shader.uniforms.uColLight = { value: new THREE.Color(colorLight) };
    shader.uniforms.uHeight = { value: heightRef };
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWind;
         uniform float uHeight;
         varying float vHeight;
         attribute float aPhase;
        `
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
         vHeight = clamp(position.y / uHeight, 0.0, 1.0);
         float sway = pow(vHeight, 1.5);
         #ifdef USE_INSTANCING
           float ph = aPhase;
         #else
           float ph = 0.0;
         #endif
         float w = sin(uTime * 0.9 + ph) * 0.6 + sin(uTime * 2.1 + ph * 1.7) * 0.4;
         transformed.x += w * uWind * sway;
         transformed.z += w * 0.5 * uWind * sway;
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying float vHeight;
         uniform vec3 uColDark;
         uniform vec3 uColLight;
        `
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 gradCol = mix(uColDark, uColLight, smoothstep(0.05, 0.98, vHeight));
         vec4 diffuseColor = vec4( gradCol, opacity );`
      );
  };
  return mat;
}

function makeTrunkMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.95,
    metalness: 0.0,
  });
}

// ---------- Merge-Hilfsfunktion --------------------------------------------

function mergeGeometries(geos) {
  let total = 0, totalIndex = 0;
  for (const g of geos) {
    total += g.attributes.position.count;
    totalIndex += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const indices = new Uint32Array(totalIndex);
  let p = 0, idx = 0, off = 0;
  for (const g of geos) {
    const pc = g.attributes.position.count;
    positions.set(g.attributes.position.array.subarray(0, pc * 3), p * 3);
    normals.set(g.attributes.normal.array.subarray(0, pc * 3), p * 3);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) indices[idx + i] = src[i] + off;
      idx += src.length;
    } else {
      for (let i = 0; i < pc; i++) indices[idx + i] = off + i;
      idx += pc;
    }
    off += pc;
    p += pc;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// ---------- Hauptfunktion: 2 InstancedMeshes (Pine/Leafy) ------------------
//
// placements: Array von { x,y,z, scale, rotY, tilt, type?: 'pine'|'leafy' }
// Alle ohne type werden als 'pine' behandelt (Backwards-Compat).

// Cache fuer Standalone-Tree-Geometrien, damit die Editor-Materialisierung
// nicht pro Baum einen neuen Build-Pass braucht.
const _STANDALONE_CACHE = { pine: null, leafy: null, trunkMat: null };
function _ensureStandalone() {
  if (_STANDALONE_CACHE.pine) return _STANDALONE_CACHE;
  _STANDALONE_CACHE.pine = {
    crown: buildPineTree(0.73, { layers: 7, baseHeight: 3.2 }),
    trunk: makeTrunk(0.55, 0.11, 0.07, 0.03),
    crownMat: makeCrownMaterial(0x071814, 0x4d7a62, 3.2, 0.08),
  };
  _STANDALONE_CACHE.leafy = {
    crown: buildLeafyTree(1.31, { blobs: 5, baseHeight: 2.6 }),
    trunk: makeTrunk(0.75, 0.13, 0.09, 0.05),
    crownMat: makeCrownMaterial(0x16301c, 0x6ba27a, 2.6, 0.1),
  };
  _STANDALONE_CACHE.trunkMat = makeTrunkMaterial(0x201208);
  return _STANDALONE_CACHE;
}

// Erzeugt eine Einzelbaum-Group fuer den Editor (procPicker-Materialisierung).
// Dieselbe Geometrie/Materialien wie der InstancedMesh-Pool, damit das
// Picking-Ergebnis visuell identisch bleibt.
export function buildStandaloneTree({ type = 'pine', x = 0, y = 0, z = 0, rotY = 0, scale = 1 }) {
  const cache = _ensureStandalone();
  const t = type === 'leafy' ? cache.leafy : cache.pine;
  const g = new THREE.Group();
  g.name = 'standaloneTree:' + type;
  const crown = new THREE.Mesh(t.crown, t.crownMat);
  const trunk = new THREE.Mesh(t.trunk, cache.trunkMat);
  crown.castShadow = true;
  crown.receiveShadow = true;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(crown);
  g.add(trunk);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);
  return g;
}

export function createTreesInstanced(placements) {
  const group = new THREE.Group();
  group.name = 'trees';
  if (placements.length === 0) return group;

  const pineGeo  = buildPineTree(0.73, { layers: 7, baseHeight: 3.2 });
  const leafyGeo = buildLeafyTree(1.31, { blobs: 5, baseHeight: 2.6 });
  const pineTrunk  = makeTrunk(0.55, 0.11, 0.07, 0.03);
  const leafyTrunk = makeTrunk(0.75, 0.13, 0.09, 0.05);

  const trunkMat = makeTrunkMaterial(0x201208);

  const pines = [];
  const leafys = [];
  for (const p of placements) {
    (p.type === 'leafy' ? leafys : pines).push(p);
  }

  const allMats = [];
  // Pro-Typ procMeta fuer Editor-Picker: wird nach Build ausserhalb gelesen.
  const procMeta = { pine: null, leafy: null };

  function buildInstanceMesh(geo, trunkGeo, subset, {
    crownDark, crownLight, heightRef, wind, typeKey,
  }) {
    const geoClone = geo.clone();
    const phases = new Float32Array(subset.length);
    for (let i = 0; i < subset.length; i++) phases[i] = Math.random() * Math.PI * 2;
    geoClone.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

    const matClone = makeCrownMaterial(crownDark, crownLight, heightRef, wind);
    const crownInst = new THREE.InstancedMesh(geoClone, matClone, subset.length);
    crownInst.castShadow = true;
    crownInst.receiveShadow = true;

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, subset.length);
    trunkInst.castShadow = true;
    trunkInst.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qTilt = new THREE.Quaternion();
    const tiltAxis = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const colorAttr = new Float32Array(subset.length * 3);
    const c = new THREE.Color();

    for (let i = 0; i < subset.length; i++) {
      const pl = subset[i];
      const y = pl.y ?? sampleHeight(pl.x, pl.z);
      pos.set(pl.x, y, pl.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rotY ?? 0);
      const tilt = pl.tilt ?? ((Math.random() - 0.5) * 0.08);
      const tAng = Math.random() * Math.PI * 2;
      tiltAxis.set(Math.cos(tAng), 0, Math.sin(tAng)).normalize();
      qTilt.setFromAxisAngle(tiltAxis, tilt);
      q.multiply(qTilt);
      scl.setScalar(pl.scale ?? 1);
      m.compose(pos, q, scl);
      crownInst.setMatrixAt(i, m);
      trunkInst.setMatrixAt(i, m);

      // kleine Farbvariation pro Baum
      const satOffset = (Math.random() - 0.5) * 0.15;
      const ligOffset = (Math.random() - 0.5) * 0.12;
      c.copy(new THREE.Color(crownLight));
      const hsl = {};
      c.getHSL(hsl);
      c.setHSL(
        hsl.h,
        THREE.MathUtils.clamp(hsl.s + satOffset, 0, 1),
        THREE.MathUtils.clamp(hsl.l + ligOffset, 0, 1),
      );
      colorAttr[i * 3 + 0] = c.r;
      colorAttr[i * 3 + 1] = c.g;
      colorAttr[i * 3 + 2] = c.b;
    }
    crownInst.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3);
    crownInst.instanceMatrix.needsUpdate = true;
    trunkInst.instanceMatrix.needsUpdate = true;
    crownInst.computeBoundingSphere(); crownInst.computeBoundingBox();
    trunkInst.computeBoundingSphere(); trunkInst.computeBoundingBox();
    group.add(crownInst);
    group.add(trunkInst);
    allMats.push(matClone);

    // procMeta registrieren: pro Instanz ein Eintrag fuer Editor-Picker.
    const meta = subset.map((pl, i) => {
      const t = pl.type === 'leafy' ? 'tree.leafy' : 'tree.pine';
      return {
        id: 'p:' + t + ':' + pl.procIndex,
        type: t,
        x: pl.x, y: pl.y ?? sampleHeight(pl.x, pl.z), z: pl.z,
        rotY: pl.rotY ?? 0,
        scale: pl.scale ?? 1,
      };
    });
    procMeta[typeKey] = {
      instancedMeshes: [crownInst, trunkInst],
      meta,
    };
  }

  // procIndex global vergeben, damit stable IDs ueber beide Pools eindeutig bleiben.
  let idxCounter = 0;
  for (const p of pines) p.procIndex = idxCounter++;
  for (const p of leafys) p.procIndex = idxCounter++;

  if (pines.length > 0) {
    buildInstanceMesh(pineGeo, pineTrunk, pines, {
      crownDark:  0x071814,
      crownLight: 0x4d7a62,
      heightRef:  3.2,
      wind:       0.08,
      typeKey:    'pine',
    });
  }
  if (leafys.length > 0) {
    buildInstanceMesh(leafyGeo, leafyTrunk, leafys, {
      crownDark:  0x16301c,
      crownLight: 0x6ba27a,
      heightRef:  2.6,
      wind:       0.1,
      typeKey:    'leafy',
    });
  }

  group.userData.update = (t) => {
    for (const mat of allMats) {
      const sh = mat.userData.shader;
      if (sh) sh.uniforms.uTime.value = t;
    }
  };
  // procMeta nach aussen fuer Editor-Picker (main.js).
  group.userData.procMeta = procMeta;

  return group;
}

// (placeForest aus der alten Datei ist nicht mehr noetig; scatterNature
//  pflanzt direkt aus FOREST_PATCHES — siehe village.js.)
