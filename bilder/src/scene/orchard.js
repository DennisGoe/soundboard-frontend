// Streuobstwiese: kleine runde Obstbaeume, komplett instanziert.
// Statt 25 x 4 Meshes = 100 Draws jetzt nur 4 Draws (Stamm + 3 Kronen-Blobs).
// Jeder Obstbaum bekommt stabile procId ('p:orchard:i') + procMeta fuer Editor-
// Picking (Runde C).
import * as THREE from 'three';
import { orchardPositions } from './mapLayout.js';
import { sampleHeight } from './terrain.js';

export function createOrchard() {
  const group = new THREE.Group();
  group.name = 'orchard';
  const positions = orchardPositions();

  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6);
  const crownGeoA = new THREE.IcosahedronGeometry(0.75, 0);
  const crownGeoB = new THREE.IcosahedronGeometry(0.48, 0);
  const crownGeoC = new THREE.IcosahedronGeometry(0.42, 0);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3e24, roughness: 1.0 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3e5b2e, roughness: 1.0 });
  const foliageLitMat = new THREE.MeshStandardMaterial({ color: 0x6a8b48, roughness: 1.0 });

  const n = positions.length;
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  const crownAInst = new THREE.InstancedMesh(crownGeoA, foliageMat, n);
  const crownBInst = new THREE.InstancedMesh(crownGeoB, foliageLitMat, n);
  const crownCInst = new THREE.InstancedMesh(crownGeoC, foliageMat, n);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();

  // procMeta fuer Editor-Picker: pro Instance { id, type, x, z, rotY, scale }.
  // Wichtig: seed-deterministisch -> ueber Index positionsindiziert.
  const meta = new Array(n);

  // Lokaler, stabil-deterministischer RNG, damit die i-te Instanz nach Reload
  // dieselbe Rotation/Scale bekommt — sonst zeigen procOverrides spaeter auf
  // das falsche Objekt.
  let _seed = 42424242;
  const rnd = () => {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return _seed / 0x100000000;
  };

  for (let i = 0; i < n; i++) {
    const pt = positions[i];
    const y = sampleHeight(pt.x, pt.z);
    const s = 0.9 + rnd() * 0.3;
    const rotY = rnd() * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    scl.setScalar(s);

    pos.set(pt.x, y + 0.45 * s, pt.z);
    m.compose(pos, q, scl);
    trunkInst.setMatrixAt(i, m);

    pos.set(pt.x, y + 1.15 * s, pt.z);
    m.compose(pos, q, scl);
    crownAInst.setMatrixAt(i, m);

    pos.set(pt.x + 0.3 * s, y + 1.25 * s, pt.z + 0.1 * s);
    m.compose(pos, q, scl);
    crownBInst.setMatrixAt(i, m);

    pos.set(pt.x - 0.25 * s, y + 1.1 * s, pt.z - 0.2 * s);
    m.compose(pos, q, scl);
    crownCInst.setMatrixAt(i, m);

    meta[i] = {
      id: 'p:orchard:' + i,
      type: 'tree.orchard',
      x: pt.x, z: pt.z,
      y, rotY, scale: s,
    };
  }
  for (const inst of [trunkInst, crownAInst, crownBInst, crownCInst]) {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.computeBoundingBox();
  }
  trunkInst.castShadow = true;
  crownAInst.castShadow = true;
  group.add(trunkInst, crownAInst, crownBInst, crownCInst);

  // procMeta: alle 4 InstancedMeshes teilen sich Index -> Editor kann per
  // instanceId den passenden Meta-Eintrag finden und beim Materialisieren
  // alle 4 Instanz-Blocks (Stamm + 3 Kronen) am gleichen Index verstecken.
  group.userData.procMeta = {
    instancedMeshes: [trunkInst, crownAInst, crownBInst, crownCInst],
    meta,
    procType: 'tree.orchard',
  };

  return group;
}
