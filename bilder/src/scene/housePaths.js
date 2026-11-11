// Haus-Wege: schmale geschwungene Erdpfade zwischen jedem Haus und dem
// naechsten Hauptweg, plus Querverbindungen zwischen Nachbarhaeusern.
//
// Technik:
//  - Pro Haus: Tuer-Anker (vor dem Haus in frontDir) + Zielpunkt auf naechstem
//    PATHS-Polygonsegment. Spline mit 3 Zwischenpunkten -> sanfte Kurve.
//  - Querverbindungen: fuer jeden Haus-Anker ein Kandidat zum naechsten Nachbarhaus
//    (max. Distanz ~5) wenn beide noch wenige Verbindungen haben.
//  - Platzierung: InstancedMesh (ein Draw-Call) kleiner Pflaster-/Erdflecken
//    entlang der Spline. Jitter in Breite + Position.
//  - Export: distanceToHousePaths(x,z) — wird in main/grass/decor benutzt, um
//    die neuen Wege von Gras/Deko freizuhalten.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import {
  PATHS, toWorldX, toWorldZ, distanceToPaths, distanceToRivers, isInField,
} from './mapLayout.js';

// Modul-globale Segmentliste (wird zur Laufzeit gefuellt).
const HOUSE_PATH_SEGS = []; // {ax, az, bx, bz, halfW}

export function distanceToHousePaths(wx, wz) {
  let dMin = Infinity;
  for (const s of HOUSE_PATH_SEGS) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const l2 = dx * dx + dz * dz;
    let t = ((wx - s.ax) * dx + (wz - s.az) * dz) / Math.max(l2, 1e-6);
    t = Math.max(0, Math.min(1, t));
    const cx = s.ax + t * dx, cz = s.az + t * dz;
    const d = Math.hypot(wx - cx, wz - cz) - s.halfW;
    if (d < dMin) dMin = d;
  }
  return Math.max(0, dMin);
}

// Naechster Punkt auf einem beliebigen PATHS-Segment zu einem Zielpunkt.
function nearestMainPathPoint(tx, tz) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (const p of PATHS) {
    const pts = p.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = toWorldX(pts[i][0]), az = toWorldZ(pts[i][1]);
      const bx = toWorldX(pts[i + 1][0]), bz = toWorldZ(pts[i + 1][1]);
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-6) continue;
      let t = ((tx - ax) * dx + (tz - az) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cz = az + t * dz;
      const d = Math.hypot(tx - cx, tz - cz);
      if (d < best.d) best = { d, x: cx, z: cz };
    }
  }
  return best;
}

// Catmull-Rom-aehnliche Kurve ueber 4 Punkte, samplet n Punkte.
function sampleSpline(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const t2 = t * t, t3 = t2 * t;
    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );
    const z = 0.5 * (
      (2 * p1.z) +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
    );
    out.push({ x, z });
  }
  return out;
}

// Kollidiert ein Segment mit einem Haus-Rect (ohne das Haus des Anfangs/Ende)?
function segmentHitsHouse(ax, az, bx, bz, houses, ignoreIds) {
  for (const h of houses) {
    if (ignoreIds.has(h.id)) continue;
    // Haus-Rect: axis-aligned im Weltkoordinatensystem (gut genug fuer Kollisions-Check).
    const hw = h.bboxW * 0.5 + 0.25;
    const hd = h.bboxD * 0.5 + 0.25;
    // Grobtest: Segment-Ende/Anfang in Box?
    if (Math.abs(ax - h.x) < hw && Math.abs(az - h.z) < hd) return true;
    if (Math.abs(bx - h.x) < hw && Math.abs(bz - h.z) < hd) return true;
    // Mittelpunkt
    const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
    if (Math.abs(mx - h.x) < hw && Math.abs(mz - h.z) < hd) return true;
  }
  return false;
}

/**
 * @param sampleHeight  fn(x,z) -> y
 * @param placedHouses  [{id, x, z, rotY, bboxW, bboxD, model}]
 * @returns { group, segments, pathCount }
 */
export function createHousePaths(sampleHeight, placedHouses) {
  // Modul-Reset fuer Hot-Reload im Dev.
  HOUSE_PATH_SEGS.length = 0;

  const group = new THREE.Group();
  group.name = 'housePaths';
  const stoneGeo = new THREE.BoxGeometry(0.34, 0.08, 0.34);
  // vertexColors:false + weisse Grundfarbe; instanceColor multipliziert korrekt rein.
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1.0, vertexColors: false,
  });

  const matrices = [];
  const colors = [];
  // Naturalstein-Palette identisch zur Haupt-paths.js: warmgrau/beige, matt,
  // KEIN minL-Boost, KEIN Emissive — die Haus-Trampelpfade sollen natuerlich
  // aussehen und sich wie normaler Boden beleuchten lassen.
  const STONE_WARMGRAY = new THREE.Color(0x6b6155);
  const STONE_TAUPE    = new THREE.Color(0x7a6b58);
  const STONE_ASHEN    = new THREE.Color(0x524a42);
  const STONE_EARTH    = new THREE.Color(0x3d3024);  // dirt-Einschlag
  const STONE_EARTHLT  = new THREE.Color(0x5a4a38);  // heller dirt
  const tmp = new THREE.Color();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function emitAlongSpline(spline, halfW) {
    for (let i = 0; i < spline.length - 1; i++) {
      const a = spline[i], b = spline[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 1e-3) continue;
      const nx = -dz / segLen, nz = dx / segLen;
      // Mehrere Steine pro Segment (dichter als paths.js um klare Linie zu bekommen).
      const steps = Math.max(2, Math.round(segLen / 0.14));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const mx = a.x + dx * t;
        const mz = a.z + dz * t;
        // 2-3 Steine in der Breite
        const samples = 3;
        for (let k = 0; k < samples; k++) {
          if (Math.random() < 0.25) continue;
          const u = (k / (samples - 1) - 0.5) * 2 * halfW * (0.75 + 0.3 * Math.sin(s * 1.7 + k));
          const jx = (Math.random() - 0.5) * 0.14;
          const jz = (Math.random() - 0.5) * 0.14;
          const x = mx + nx * u + jx;
          const z = mz + nz * u + jz;
          if (distanceToRivers(x, z) < 1.3) continue;
          if (isInField(x, z)) continue;
          const y = sampleHeight(x, z) + 0.028;
          pos.set(x, y, z);
          q.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
          const sc = 0.4 + Math.random() * 0.4;
          scl.setScalar(sc);
          m.compose(pos, q, scl);
          matrices.push(m.clone());
          // Warmgraue Pflastersteine mit sanfter Variation + dezenter Erd-Einschlag
          // fuer den Trampelpfad-Look. KEIN Mindesthelligkeits-Boost.
          const rr = Math.random();
          tmp.copy(STONE_WARMGRAY);
          if (rr < 0.38) tmp.lerp(STONE_TAUPE,  0.25 + Math.random() * 0.30);
          else if (rr < 0.70) tmp.lerp(STONE_ASHEN, 0.15 + Math.random() * 0.25);
          // Trampelpfade mischen etwas Erde rein (mehr als Hauptwege).
          tmp.lerp(STONE_EARTH, 0.12 + Math.random() * 0.18);
          if (Math.random() < 0.15) tmp.lerp(STONE_EARTHLT, Math.random() * 0.20);
          colors.push(tmp.r, tmp.g, tmp.b);
        }
      }
      // Registriere Segment fuer distanceToHousePaths.
      HOUSE_PATH_SEGS.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, halfW });
    }
  }

  // ---- 1) Jedes Haus -> naechstster Hauptweg ----
  const placedPairs = new Set();
  let pathCount = 0;
  for (const h of placedHouses) {
    if (h.model === 'temple' || h.model === 'market') continue;
    // Tuer-Anker: in frontDir, ca. bboxD/2 + 0.4 vor der Hauswand.
    const fwdX = Math.cos(h.rotY), fwdZ = Math.sin(h.rotY);
    // Note: frontDir = (1,0,0) rotated by rotY around Y -> (cos(rotY), 0, -sin(rotY))?
    // In anderen Modulen: new Vector3(1,0,0).applyAxisAngle(UP, rotY) -> (cos, 0, -sin)
    // Use same convention:
    const ffx = Math.cos(h.rotY);
    const ffz = -Math.sin(h.rotY);
    const doorOffset = Math.max(h.bboxW, h.bboxD) * 0.5 + 0.4;
    const doorX = h.x + ffx * doorOffset;
    const doorZ = h.z + ffz * doorOffset;
    const target = nearestMainPathPoint(doorX, doorZ);
    if (target.d > 60) continue; // zu weit weg — skip
    // Wenn Tuer direkt auf einem Weg steht, sehr kurzer Weg: trotzdem erzeugen.
    const dxTot = target.x - doorX, dzTot = target.z - doorZ;
    const dist = Math.hypot(dxTot, dzTot);
    if (dist < 0.3) continue; // schon drauf
    // Spline mit sanftem Bogen: Mittelpunkt leicht versetzt.
    const mid1x = doorX + dxTot * 0.33 + (-dzTot / dist) * 0.3 * (Math.random() - 0.5);
    const mid1z = doorZ + dzTot * 0.33 + ( dxTot / dist) * 0.3 * (Math.random() - 0.5);
    const mid2x = doorX + dxTot * 0.66 + (-dzTot / dist) * 0.3 * (Math.random() - 0.5);
    const mid2z = doorZ + dzTot * 0.66 + ( dxTot / dist) * 0.3 * (Math.random() - 0.5);
    const p0 = { x: doorX - ffx * 0.4, z: doorZ - ffz * 0.4 };
    const p1 = { x: doorX, z: doorZ };
    const pMid = [{ x: mid1x, z: mid1z }, { x: mid2x, z: mid2z }];
    const p2 = { x: target.x, z: target.z };
    const p3 = { x: target.x + (target.x - mid2x) * 0.2, z: target.z + (target.z - mid2z) * 0.2 };
    // 3-Kurven-Pass
    const ignoreIds = new Set([h.id]);
    const seg1 = sampleSpline(p0, p1, pMid[0], pMid[1], 6);
    const seg2 = sampleSpline(p1, pMid[0], pMid[1], p2, 8);
    const seg3 = sampleSpline(pMid[0], pMid[1], p2, p3, 4);
    // Kollisionscheck gegen Haeuser nur grob: wenn eines der Segmente den Nachbar
    // trifft, Kurve dennoch rendern (meistens ok, Haus-Pads sind klein).
    emitAlongSpline([...seg1, ...seg2.slice(1), ...seg3.slice(1)], 0.35);
    pathCount++;
  }

  // ---- 2) Querverbindungen zwischen Nachbarhaeusern (10-15 Stueck) ----
  const neighbors = [];
  for (let i = 0; i < placedHouses.length; i++) {
    for (let j = i + 1; j < placedHouses.length; j++) {
      const a = placedHouses[i], b = placedHouses[j];
      if (a.model === 'temple' || b.model === 'temple') continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 2.5 && d < 5.5) neighbors.push({ a, b, d });
    }
  }
  neighbors.sort((a, b) => a.d - b.d);
  const usedCross = new Map();
  let crossBuilt = 0;
  for (const nb of neighbors) {
    if (crossBuilt >= 14) break;
    const ca = usedCross.get(nb.a.id) ?? 0;
    const cb = usedCross.get(nb.b.id) ?? 0;
    if (ca >= 1 || cb >= 1) continue;
    usedCross.set(nb.a.id, ca + 1);
    usedCross.set(nb.b.id, cb + 1);
    const a = nb.a, b = nb.b;
    const p0 = { x: a.x, z: a.z };
    const p3 = { x: b.x, z: b.z };
    // Mittelpunkt mit leichtem Offset
    const midX = (a.x + b.x) * 0.5 + (Math.random() - 0.5) * 0.4;
    const midZ = (a.z + b.z) * 0.5 + (Math.random() - 0.5) * 0.4;
    const spline = sampleSpline(p0, p0, { x: midX, z: midZ }, p3, 8);
    emitAlongSpline(spline, 0.28);
    crossBuilt++;
  }

  if (matrices.length === 0) return { group, pathCount: 0, crossCount: crossBuilt };

  const inst = new THREE.InstancedMesh(stoneGeo, stoneMat, matrices.length);
  const colorAttr = new Float32Array(colors);
  inst.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3);
  for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.computeBoundingBox();
  inst.receiveShadow = true;
  group.add(inst);
  return { group, pathCount, crossCount: crossBuilt, instCount: matrices.length };
}
