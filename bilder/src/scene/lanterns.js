// Laterne mit warmem Glow. Deutlich dezenter abgestimmt — kleine warme
// Lichtinseln statt ausbrennender Glow-Flaechen.
// Fuer Performance gibt es zusaetzlich einen Pool-Builder (poolLanterns),
// der alle Laternen (ohne eigenes PointLight) als InstancedMeshes bündelt.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2814, roughness: 0.9 });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 0.8, metalness: 0.4 });

// Geteilte Geometrien fuer Pool + Einzel-Laternen (identisch mit Legacy).
const postGeo  = new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8);
const armGeo   = new THREE.BoxGeometry(0.45, 0.06, 0.06);
const chainGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4);
const cageGeo  = new THREE.CylinderGeometry(0.12, 0.14, 0.28, 6);
const capGeo   = new THREE.ConeGeometry(0.17, 0.13, 6);
const bulbGeo  = new THREE.SphereGeometry(0.1, 10, 8);

function makeGlassMat() {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.lanternGlow,
    emissive: PALETTE.lanternHot,
    emissiveIntensity: 3.2,   // halbiert (vorher 8.0)
    roughness: 0.3,
    transparent: true,
    opacity: 0.95,
  });
}

/**
 * @param {Object} opts
 * @param {boolean} opts.useLight    – echtes PointLight hinzufuegen (sonst nur emissiv)
 * @param {boolean} opts.castShadow  – PointLight-Shadow (6 Renderpasses, sehr teuer!)
 * @param {number}  opts.distance    – PointLight-Range
 * @param {number}  opts.intensity   – PointLight-Grundhelligkeit
 */
export function createLantern({
  useLight = true,
  castShadow = false,
  distance = 8,
  intensity = 3.2,
} = {}) {
  const g = new THREE.Group();
  const glass = makeGlassMat();

  // Pfosten
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8),
    woodMat,
  );
  post.position.y = 0.95;
  post.castShadow = true;
  g.add(post);
  // Querarm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), woodMat);
  arm.position.set(0.22, 1.78, 0);
  arm.castShadow = true;
  g.add(arm);
  // Kette
  const chain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4),
    ironMat,
  );
  chain.position.set(0.4, 1.63, 0);
  g.add(chain);
  // Kaefig
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.28, 6),
    ironMat,
  );
  cage.position.set(0.4, 1.4, 0);
  cage.castShadow = true;
  g.add(cage);
  // Dach
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.13, 6), ironMat);
  cap.position.set(0.4, 1.6, 0);
  g.add(cap);
  // Gluehender Kern — bei emissive-only Variante staerker, damit sie auch
  // ohne PointLight warm leuchtet.
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glass);
  bulb.position.set(0.4, 1.4, 0);
  if (!useLight) glass.emissiveIntensity = 5.5;
  g.add(bulb);

  let light = null;
  if (useLight) {
    light = new THREE.PointLight(PALETTE.lanternGlow, intensity, distance, 1.8);
    light.position.set(0.4, 1.42, 0);
    if (castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(256, 256);
      light.shadow.bias = -0.0015;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = distance;
    }
    g.add(light);
  }

  const baseI = intensity;
  const baseE = glass.emissiveIntensity;
  g.userData.flicker = (t, phase) => {
    const f = 1.0
      + Math.sin(t * 7 + phase) * 0.08
      + Math.sin(t * 11 + phase * 2) * 0.05;
    if (light) light.intensity = baseI * f;
    glass.emissiveIntensity = baseE * f;
  };
  g.name = 'lantern';
  return g;
}

/**
 * Pool: alle Laternen ohne eigenes PointLight in InstancedMeshes bündeln.
 * placements: [{x, y, z, rotY}]
 * Erzeugt EINEN flickernden Glow-Shared-Material-Pool.
 */
export function poolLanterns(placements) {
  const group = new THREE.Group();
  if (placements.length === 0) return group;
  const glass = makeGlassMat();
  glass.emissiveIntensity = 5.5;

  const n = placements.length;
  const postInst  = new THREE.InstancedMesh(postGeo,  woodMat, n);
  const armInst   = new THREE.InstancedMesh(armGeo,   woodMat, n);
  const chainInst = new THREE.InstancedMesh(chainGeo, ironMat, n);
  const cageInst  = new THREE.InstancedMesh(cageGeo,  ironMat, n);
  const capInst   = new THREE.InstancedMesh(capGeo,   ironMat, n);
  const bulbInst  = new THREE.InstancedMesh(bulbGeo,  glass,   n);
  postInst.castShadow = true;
  cageInst.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const base = new THREE.Vector3();
  const temp = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);

  const setAt = (inst, i, offLocal) => {
    // World-Pos = base + rotation.applyToOffset(offLocal)
    const rotated = offLocal.clone().applyQuaternion(q);
    temp.copy(base).add(rotated);
    m.compose(temp, q, scl);
    inst.setMatrixAt(i, m);
  };

  for (let i = 0; i < n; i++) {
    const pl = placements[i];
    base.set(pl.x, pl.y, pl.z);
    q.setFromAxisAngle(upVec, pl.rotY ?? 0);
    setAt(postInst,  i, new THREE.Vector3(0,    0.95, 0));
    setAt(armInst,   i, new THREE.Vector3(0.22, 1.78, 0));
    setAt(chainInst, i, new THREE.Vector3(0.4,  1.63, 0));
    setAt(cageInst,  i, new THREE.Vector3(0.4,  1.4,  0));
    setAt(capInst,   i, new THREE.Vector3(0.4,  1.6,  0));
    setAt(bulbInst,  i, new THREE.Vector3(0.4,  1.4,  0));
  }
  for (const inst of [postInst, armInst, chainInst, cageInst, capInst, bulbInst]) {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.computeBoundingBox();
    group.add(inst);
  }

  const baseE = 5.5;
  group.userData.flicker = (t) => {
    const f = 1.0 + Math.sin(t * 2.3) * 0.06 + Math.sin(t * 5.3) * 0.04;
    glass.emissiveIntensity = baseE * f;
  };
  group.name = 'lanternPool';
  return group;
}

/**
 * Lagerfeuer am Brunnen. Wenn useOwnLight=false uebernimmt der zentrale
 * Lichter-Pool das PointLight.
 */
export function createCampfire({ useOwnLight = true } = {}) {
  const g = new THREE.Group();

  const fireGlassMat = new THREE.MeshStandardMaterial({
    color: PALETTE.fireHot,
    emissive: PALETTE.fireGlow,
    emissiveIntensity: 2.8, // vorher 5.0
    roughness: 0.4,
  });

  // Holzscheite (Kreuz)
  const logMat = new THREE.MeshStandardMaterial({ color: 0x2b1a0f, roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.6, 7),
      logMat,
    );
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 3) * Math.PI;
    log.position.y = 0.08;
    log.castShadow = true;
    g.add(log);
  }

  // Flamme: 3 verformte emissive Spheres
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16 - i * 0.025, 1),
      fireGlassMat.clone(),
    );
    f.position.set(
      (Math.random() - 0.5) * 0.08,
      0.22 + i * 0.09,
      (Math.random() - 0.5) * 0.08,
    );
    f.scale.set(0.9, 1.3 + i * 0.1, 0.9);
    g.add(f);
    flames.push(f);
  }

  let light = null;
  if (useOwnLight) {
    light = new THREE.PointLight(PALETTE.fireGlow, 2.6, 8, 1.8);
    light.position.set(0, 0.5, 0);
    light.castShadow = false;
    g.add(light);
  }
  // Exposure fuer Pool-Registrierung
  g.userData.poolMaterials = flames.map((f) => f.material);

  g.userData.flicker = (t) => {
    const f = 1.0
      + Math.sin(t * 9) * 0.15
      + Math.sin(t * 17) * 0.1
      + (Math.random() - 0.5) * 0.08;
    if (light) light.intensity = 2.6 * f;
    for (let i = 0; i < flames.length; i++) {
      const fm = flames[i].material;
      fm.emissiveIntensity = (2.8 - i * 0.3) * f;
      flames[i].scale.y = (1.3 + i * 0.1) * (0.9 + Math.sin(t * 6 + i) * 0.12);
    }
  };
  g.name = 'campfire';
  return g;
}
