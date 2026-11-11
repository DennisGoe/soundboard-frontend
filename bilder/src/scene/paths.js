// Wegenetz auf Basis der Kartenpolylinien aus mapLayout.js.
// Baut Cobble-/Erd-Instanzen entlang aller Segmente. Die Distanzfunktion
// fuer Terrain/Flatten/Gras-Exclusion ist in mapLayout exportiert.
import * as THREE from 'three';
import { PATHS, distanceToPaths as _distToPaths } from './mapLayout.js';

export { _distToPaths as distanceToPaths };
export { PATHS };

// Natuerliche, matte Pflastersteine: warmgrau/beige mit leichter Variation.
// KEIN minL-Boost, KEIN Emissive, KEINE Bloom-gefaehrdeten Werte — die Steine
// sollen sich wie normaler Boden beleuchten lassen. Max channel ~0.56, damit
// selbst im Mittagslicht weit unterhalb der Bloom-Threshold (0.88).
const STONE_PALETTE = {
  warmGray:  new THREE.Color(0x6b6155),   // Basisfarbe: warmes Grau-Beige
  taupe:     new THREE.Color(0x7a6b58),   // etwas heller/beiger
  ashen:     new THREE.Color(0x524a42),   // dunklere Variante
  earth:     new THREE.Color(0x4a3c2c),   // Erde-Einschlag
};

export function createPathCobbles(sampleHeight) {
  const group = new THREE.Group();
  group.name = 'pathCobbles';
  const geo = new THREE.BoxGeometry(0.4, 0.14, 0.4);
  // vertexColors:false + weisse Grundfarbe; instanceColor multipliziert sauber rein.
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1.0, metalness: 0.0, vertexColors: false,
  });
  const matrices = [];
  const colors = [];
  const tmp = new THREE.Color();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();

  for (const p of PATHS) {
    const pts = p.pts.map(([px, py]) => ({
      x: (px - 350) * 0.22, z: (py - 247.5) * 0.22,
    }));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const tangentX = dx / len, tangentZ = dz / len;
      const normalX = -tangentZ, normalZ = tangentX;
      const perStep = Math.max(6, Math.round(len * (p.kind === 'main' ? 2.0 : 2.4)));
      const samples = p.kind === 'main' ? 5 : 3;
      for (let j = 0; j < perStep; j++) {
        const t = j / perStep;
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        const widthMod = 0.7 + 0.35 * Math.sin(j * 1.7 + len);
        const localWidth = p.width * 0.4 * widthMod;
        for (let k = 0; k < samples; k++) {
          if (Math.random() < 0.3) continue;
          const u = (k / Math.max(1, samples - 1) - 0.5) * 2 * localWidth
                  + (Math.random() - 0.5) * 0.25;
          const jx = (Math.random() - 0.5) * 0.2;
          const jz = (Math.random() - 0.5) * 0.2;
          const x = px + normalX * u + jx;
          const z = pz + normalZ * u + jz;
          const y = sampleHeight(x, z) + 0.035;
          pos.set(x, y, z);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
          scl.setScalar(0.42 + Math.random() * 0.45);
          m.compose(pos, q, scl);
          matrices.push(m.clone());
          // Warmgraue Pflastersteine mit sanfter Variation: Basis warmGray,
          // 50% Taupe-Boost fuer helle Varianten, 30% Ashen-Boost fuer dunkle,
          // dazu kleiner Erd-Einschlag. KEIN Mindesthelligkeits-Boost.
          const r = Math.random();
          tmp.copy(STONE_PALETTE.warmGray);
          if (r < 0.38) tmp.lerp(STONE_PALETTE.taupe,  0.25 + Math.random() * 0.35);
          else if (r < 0.70) tmp.lerp(STONE_PALETTE.ashen, 0.15 + Math.random() * 0.30);
          tmp.lerp(STONE_PALETTE.earth, Math.random() * 0.18);
          colors.push(tmp.r, tmp.g, tmp.b);
        }
      }
    }
  }
  if (matrices.length === 0) return group;
  const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
  const colorAttr = new Float32Array(colors);
  inst.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3);
  for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.computeBoundingBox();
  inst.receiveShadow = true;
  group.add(inst);
  return group;
}
