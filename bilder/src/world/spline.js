// Spline-Helfer fuer das Pfad-Toolsystem.
//
// Datenmodell:
//   points: Array von { x, z }  (Welt-Koordinaten; y wird dynamisch aus sampleHeight gezogen)
//   closed: bool
//
// Primaerfunktion: sampleCurve(points, opts) -> Array<{x, z}>
//   gibt dicht abgetastete Kurvenpunkte zurueck. Die Kurve laeuft durch alle
//   Anker (Catmull-Rom); automatische Tangenten. Bei nur 2 Punkten wird die
//   Kurve zur geraden Linie.
//
// Weitere: curvePointAt, closestPointIndex (fuer Point-Handles).
//
// DESIGN: Dieses Modul kennt kein three.js — nur reine Mathematik. So laesst
// es sich auch fuer Weg- und Fluss-Generatoren wiederverwenden (Runde C).
// Fuer eine three.js-Curve laesst sich das Ergebnis trivial in Vector2/3 heben.

const EPS = 1e-6;

// --- Catmull-Rom segment (uniform) ---------------------------------------
// Fuer t ∈ [0,1] zwischen p1 und p2 mit Nachbarn p0 und p3.
function catmullRomSegment(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
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
  return { x, z };
}

// Nachbarn (Index-Form, duplizieren an den Enden fuer offene Kurven).
function neighborsAt(points, i, closed) {
  const n = points.length;
  if (closed) {
    return [
      points[(i - 1 + n) % n],
      points[i],
      points[(i + 1) % n],
      points[(i + 2) % n],
    ];
  }
  const a = i - 1 >= 0 ? points[i - 1] : points[i];
  const d = i + 2 < n ? points[i + 2] : points[i + 1];
  return [a, points[i], points[i + 1], d];
}

// --- Haupt-API ------------------------------------------------------------

export function sampleCurve(points, {
  samplesPerSegment = 12, closed = false,
} = {}) {
  if (!points || points.length < 2) return points ? points.slice() : [];
  // Bei 2 Punkten: gerade Linie, feiner abtasten.
  const n = points.length;
  const out = [];
  if (n === 2) {
    const [a, b] = points;
    const segSamples = Math.max(2, samplesPerSegment);
    for (let s = 0; s <= segSamples; s++) {
      const t = s / segSamples;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
    return out;
  }
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const [p0, p1, p2, p3] = neighborsAt(points, i, closed);
    const segSamples = Math.max(2, samplesPerSegment);
    const last = (i === segCount - 1);
    const until = last ? segSamples : segSamples - 1;
    for (let s = 0; s <= until; s++) {
      const t = s / segSamples;
      out.push(catmullRomSegment(p0, p1, p2, p3, t));
    }
  }
  return out;
}

// Gesamtkurvenlaenge (fuer gleichmaessige Verteilung).
export function cumulativeLengths(sampled) {
  const L = new Float32Array(sampled.length);
  let acc = 0;
  L[0] = 0;
  for (let i = 1; i < sampled.length; i++) {
    const dx = sampled[i].x - sampled[i - 1].x;
    const dz = sampled[i].z - sampled[i - 1].z;
    acc += Math.hypot(dx, dz);
    L[i] = acc;
  }
  return L;
}

// Gleichmaessig verteilte Punkte entlang der gesampleten Kurve: Pfosten-,
// Lattenteilung etc. step = gewuenschter Abstand; returns [{x,z,tangentX,tangentZ,s}]
// mit s = Bogenlaenge am Punkt.
export function distributeAlong(sampled, step) {
  const L = cumulativeLengths(sampled);
  const total = L[L.length - 1];
  if (total < EPS || step <= 0) return [];
  // Mindestens 2 Punkte (Anfang + Ende).
  const n = Math.max(1, Math.round(total / step));
  const out = [];
  let idx = 0;
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * total;
    while (idx < L.length - 1 && L[idx + 1] < s) idx++;
    const lo = L[idx];
    const hi = L[idx + 1] ?? total;
    const span = Math.max(EPS, hi - lo);
    const t = (s - lo) / span;
    const a = sampled[idx];
    const b = sampled[Math.min(idx + 1, sampled.length - 1)];
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const tangentX = (b.x - a.x) / Math.hypot(b.x - a.x, b.z - a.z || EPS);
    const tangentZ = (b.z - a.z) / Math.hypot(b.x - a.x, b.z - a.z || EPS);
    out.push({ x, z, tangentX, tangentZ, s });
  }
  return out;
}

// Finde Punkt-Index, der einem Welt-Punkt am naechsten ist (in XZ-Ebene).
// pickRadius: maximale Distanz; wenn > pickRadius -> -1
export function closestPointIndex(points, worldX, worldZ, pickRadius = 1.5) {
  let best = -1;
  let bestD = pickRadius * pickRadius;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - worldX;
    const dz = points[i].z - worldZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) { best = i; bestD = d2; }
  }
  return best;
}

// Totale Laenge einer sampled Kurve (bequem).
export function totalLength(sampled) {
  if (!sampled || sampled.length < 2) return 0;
  const L = cumulativeLengths(sampled);
  return L[L.length - 1];
}
