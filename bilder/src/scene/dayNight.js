// Tageszeit: fuer Stunde h (0..24) die Szenenparameter berechnen.
// Keine Shader-Rekompilierungen — nur Uniform-/Color-/Intensitaetswerte.
// Eingesetzt in main.js durch applyTimeOfDay(state, h).
import * as THREE from 'three';

// Hilfs-Interpolation entlang Key-Frames.
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, t) {
  const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

// Keyframes als Array von { h, value }. Value kann number oder Color (hex) sein.
// Zwischen den Nachbarkeys wird linear interpoliert; Wrap-around an Mitternacht.
// Annahme: keys ist aufsteigend nach h sortiert.
function sampleKeys(keys, h) {
  const n = keys.length;
  // Finde ersten Key, dessen h > h ist -> kB. Vorheriger ist kA.
  let kB = null;
  for (let i = 0; i < n; i++) {
    if (keys[i].h > h) { kB = keys[i]; break; }
  }
  let kA;
  if (kB === null) {
    // h liegt nach dem letzten Key -> wrap: kA = last, kB = first + 24
    kA = keys[n - 1];
    kB = keys[0];
  } else {
    const idxB = keys.indexOf(kB);
    kA = idxB === 0 ? keys[n - 1] : keys[idxB - 1];
  }
  let span = kB.h - kA.h;
  if (span <= 0) span += 24;
  let dt = h - kA.h;
  if (dt < 0) dt += 24;
  const t = span < 1e-6 ? 0 : THREE.MathUtils.clamp(dt / span, 0, 1);
  return { kA, kB, t };
}

function sampleNumber(keys, h) {
  const { kA, kB, t } = sampleKeys(keys, h);
  return lerp(kA.value, kB.value, t);
}
function sampleColor(keys, h, out = new THREE.Color()) {
  const { kA, kB, t } = sampleKeys(keys, h);
  const a = new THREE.Color(kA.value), b = new THREE.Color(kB.value);
  out.copy(a).lerp(b, t);
  return out;
}

// --- KEYFRAMES ------------------------------------------------------------
// h steht fuer Uhrzeit (0..24). Morgen (6-8) warm-rosa, Mittag (12) klar, Abend
// (18-20) orange, Nacht (22-4) tief-blau-violett.

const SKY_TOP = [
  { h:  2, value: 0x0b1130 }, // tiefe Nacht
  { h:  5, value: 0x16214a }, // Morgendaemmerung
  { h:  7, value: 0x3f4e82 }, // Morgenrot
  { h:  9, value: 0x4c80c4 }, // Morgen blau
  { h: 12, value: 0x4fa0e0 }, // Mittag
  { h: 16, value: 0x4a92d4 },
  { h: 18, value: 0x5a79b0 },
  { h: 19, value: 0x4a3a6a }, // Abenddaemmerung lila
  { h: 20, value: 0x2a2458 },
  { h: 22, value: 0x151a48 }, // Nacht-Palette-Wert
];
const SKY_MID = [
  { h:  2, value: 0x1a2048 },
  { h:  5, value: 0x2a3366 },
  { h:  7, value: 0x8266a0 },
  { h:  9, value: 0x7eb0dc },
  { h: 12, value: 0x9ad0ea },
  { h: 16, value: 0x8ec4e2 },
  { h: 18, value: 0xb08866 }, // warm goldener Horizont
  { h: 19, value: 0xa05a66 }, // Rosa-Lila Abend
  { h: 20, value: 0x4a3a6c },
  { h: 22, value: 0x242c6c },
];
const SKY_HORIZON = [
  { h:  2, value: 0x2a2858 },
  { h:  5, value: 0x4a3a6c },
  { h:  7, value: 0xd09060 }, // Morgen-Orange
  { h:  9, value: 0xb2d8ee },
  { h: 12, value: 0xcae6f4 },
  { h: 16, value: 0xc4dcee },
  { h: 18, value: 0xe28a4a }, // Sonnenuntergang-Orange
  { h: 19, value: 0xc06050 }, // Rot-Orange
  { h: 20, value: 0x6a4a78 },
  { h: 22, value: 0x3a3878 },
];
const SKY_GLOW = [
  { h:  2, value: 0x5a5aa0 },
  { h:  5, value: 0x8a7ab0 },
  { h:  7, value: 0xffd199 },
  { h:  9, value: 0xffeab0 },
  { h: 12, value: 0xfff4c0 },
  { h: 16, value: 0xffe8a0 },
  { h: 18, value: 0xffb060 },
  { h: 19, value: 0xff8040 },
  { h: 20, value: 0x7a5aa0 },
  { h: 22, value: 0x5a5aa0 },
];

const CLOUD_DARK = [
  { h:  2, value: 0x08092a }, { h:  5, value: 0x24204a }, { h:  7, value: 0x604060 },
  { h:  9, value: 0x9aa4b4 }, { h: 12, value: 0xaebac8 }, { h: 16, value: 0x9ea8ba },
  { h: 18, value: 0x7a5a52 }, { h: 19, value: 0x5a3848 }, { h: 20, value: 0x20204a },
  { h: 22, value: 0x08092a },
];
const CLOUD_LIGHT = [
  { h:  2, value: 0x5c48a0 }, { h:  5, value: 0x7868a8 }, { h:  7, value: 0xe4b890 },
  { h:  9, value: 0xdeeaf4 }, { h: 12, value: 0xf0f5fa }, { h: 16, value: 0xe4eef8 },
  { h: 18, value: 0xf0c48a }, { h: 19, value: 0xe08060 }, { h: 20, value: 0x7868a8 },
  { h: 22, value: 0x5c48a0 },
];
const CLOUD_EDGE = [
  { h:  2, value: 0x9070d8 }, { h:  5, value: 0xa088c0 }, { h:  7, value: 0xffe8c0 },
  { h:  9, value: 0xffffff }, { h: 12, value: 0xffffff }, { h: 16, value: 0xffffff },
  { h: 18, value: 0xffd09a }, { h: 19, value: 0xffb080 }, { h: 20, value: 0xa088c0 },
  { h: 22, value: 0x9070d8 },
];

// Haupt-Directional-Licht: Mond blau-weiss nachts, Sonne warmweiss tags.
// NACHT DEUTLICH DUNKLER (Aufgabe 10): um 0 Uhr soll das Mondlicht nur sehr
// schwach + kuehl sein, damit die Lampen wirklich wirken.
const LIGHT_COLOR = [
  { h:  0, value: 0x7a8ccc }, // tiefe Nacht — kuehler Mond
  { h:  2, value: 0x7a8ccc },
  { h:  4, value: 0x8aa0d8 },
  { h:  5, value: 0xa0b4e0 }, // Daemmerung
  { h:  6, value: 0xd4b0a0 }, // Sonnenaufgang warm
  { h:  7, value: 0xffd4b0 }, // Morgensonne warm
  { h:  9, value: 0xfff0d8 },
  { h: 12, value: 0xffffff }, // klares Tageslicht
  { h: 16, value: 0xfff0d0 },
  { h: 18, value: 0xffc080 },
  { h: 19, value: 0xff8858 }, // Sonnenuntergang
  { h: 20, value: 0x6878a8 },
  { h: 21, value: 0x6478b0 },
  { h: 22, value: 0x7a8ccc },
];
const LIGHT_INTENSITY = [
  { h:  0, value: 0.45 }, // Nacht sehr schwach
  { h:  2, value: 0.5 },
  { h:  4, value: 0.6 },
  { h:  5, value: 1.0 },
  { h:  6, value: 2.4 }, // schneller Anstieg bei Sonnenaufgang
  { h:  7, value: 4.0 },
  { h:  9, value: 5.8 },
  { h: 12, value: 6.5 }, // Mittagssonne
  { h: 16, value: 5.4 },
  { h: 18, value: 4.0 },
  { h: 19, value: 2.0 },
  { h: 20, value: 1.1 },
  { h: 21, value: 0.7 },
  { h: 22, value: 0.5 },
];

const HEMI_SKY = [
  { h:  0, value: 0x25305a }, { h:  2, value: 0x252f58 }, { h:  5, value: 0x4a5f90 },
  { h:  7, value: 0xc8d2e4 },
  { h:  9, value: 0xbcd6ec }, { h: 12, value: 0xcae0f0 }, { h: 16, value: 0xc0d8ec },
  { h: 18, value: 0xd8a070 }, { h: 19, value: 0x9a5a70 }, { h: 20, value: 0x3a4a78 },
  { h: 22, value: 0x25305a },
];
const HEMI_GROUND = [
  { h:  0, value: 0x121c20 }, { h:  2, value: 0x121c20 }, { h:  5, value: 0x1a2a20 },
  { h:  7, value: 0x5a7040 },
  { h:  9, value: 0x6a8048 }, { h: 12, value: 0x6a8045 }, { h: 16, value: 0x5e7a40 },
  { h: 18, value: 0x604028 }, { h: 19, value: 0x4a3028 }, { h: 20, value: 0x182418 },
  { h: 22, value: 0x121c20 },
];
const HEMI_INTENSITY = [
  { h:  0, value: 0.35 }, { h:  2, value: 0.35 }, { h:  5, value: 0.9 },
  { h:  7, value: 1.6 },
  { h:  9, value: 1.8 }, { h: 12, value: 2.1 }, { h: 16, value: 1.9 },
  { h: 18, value: 1.6 }, { h: 19, value: 1.2 }, { h: 20, value: 0.6 },
  { h: 22, value: 0.4 },
];
const AMBIENT_INTENSITY = [
  { h:  0, value: 0.15 }, { h:  2, value: 0.15 }, { h:  5, value: 0.35 },
  { h:  7, value: 0.6 },
  { h:  9, value: 0.55 }, { h: 12, value: 0.5 }, { h: 16, value: 0.55 },
  { h: 18, value: 0.7 }, { h: 19, value: 0.5 }, { h: 20, value: 0.3 },
  { h: 22, value: 0.2 },
];

const FOG_COLOR = [
  { h:  2, value: 0x1e2558 }, { h:  5, value: 0x2a3564 }, { h:  7, value: 0x7a7488 },
  { h:  9, value: 0xb0c4d4 }, { h: 12, value: 0xc8dce8 }, { h: 16, value: 0xbcd0dc },
  { h: 18, value: 0xa08866 }, { h: 19, value: 0x7a5064 }, { h: 20, value: 0x2a2a52 },
  { h: 22, value: 0x1e2558 },
];
const FOG_DENSITY = [
  { h:  2, value: 0.0055 }, { h:  5, value: 0.0060 }, { h:  7, value: 0.0045 },
  { h:  9, value: 0.0032 }, { h: 12, value: 0.0025 }, { h: 16, value: 0.0030 },
  { h: 18, value: 0.0040 }, { h: 19, value: 0.0050 }, { h: 20, value: 0.0055 },
  { h: 22, value: 0.0055 },
];

const EXPOSURE = [
  { h:  0, value: 1.05 }, // Nacht KEINE hohe Exposure mehr, damit es wirklich dunkel wird
  { h:  2, value: 1.05 }, { h:  5, value: 1.2 },  { h:  7, value: 1.35 },
  { h:  9, value: 1.15 }, { h: 12, value: 1.05 }, { h: 16, value: 1.15 },
  { h: 18, value: 1.3 },  { h: 19, value: 1.4 },  { h: 20, value: 1.2 },
  { h: 22, value: 1.05 },
];

// Lampen (Laternen/Fenster/Lichterketten/Fireflies) gehen in der Daemmerung an.
// 1.0 = voll, 0.0 = aus. Nicht Lichteranzahl aendern — nur intensity!
const LAMPS_ON = [
  { h:  2, value: 1.0 },
  { h:  5, value: 1.0 },
  { h:  7, value: 0.3 },
  { h:  9, value: 0.0 },
  { h: 16, value: 0.0 },
  { h: 18, value: 0.3 },
  { h: 19, value: 0.7 },
  { h: 20, value: 1.0 },
  { h: 22, value: 1.0 },
];
// Sterne/Mond: nur Nacht sichtbar.
const NIGHT_MASK = [
  { h:  2, value: 1.0 },
  { h:  5, value: 1.0 },
  { h:  6, value: 0.4 },
  { h:  7, value: 0.0 },
  { h: 18, value: 0.0 },
  { h: 19, value: 0.3 },
  { h: 20, value: 0.9 },
  { h: 22, value: 1.0 },
];

// Grading (Shader-Pass im main): Nachts kaelter, tags warmer/neutraler.
const GRADE_AMOUNT = [
  { h:  2, value: 0.16 }, { h:  5, value: 0.14 }, { h:  7, value: 0.08 },
  { h:  9, value: 0.04 }, { h: 12, value: 0.03 }, { h: 16, value: 0.05 },
  { h: 18, value: 0.10 }, { h: 19, value: 0.14 }, { h: 20, value: 0.16 },
  { h: 22, value: 0.16 },
];

// --- SONNEN-/MONDRICHTUNG ------------------------------------------------
// Vereinfachte Himmelsmechanik: ein Bogen von Osten (6h) ueber Sueden (12h)
// nach Westen (18h) fuer die SONNE, und ein Bogen von Westen (18h) ueber Norden
// (0h) nach Osten (6h) fuer den MOND. Wir verwenden EINEN Directional-Light
// und EINE Sky-Dir, die zwischen Sonne und Mond ueberblendet (hart ueber die
// Daemmerung — da eh nur ein Licht zur selben Zeit sichtbar ist).

export function computeSunDir(h) {
  // Sonne: h=6 -> horizon-east (y~0.05), h=12 -> hoch, h=18 -> horizon-west
  const t = (h - 6) / 12; // 0..1 fuer 6..18
  const tc = THREE.MathUtils.clamp(t, -0.2, 1.2);
  const angle = tc * Math.PI; // 0..PI
  // X: ost(-1) -> mittag(0) -> west(1) im Welt-X-System? Wir legen Ost = -X (vom
  // Dorf aus) und West = +X. Egal — wichtig ist die Bewegung.
  const x = -Math.cos(angle); // -1 (Ost) .. 1 (West)
  const y = Math.sin(angle);  // 0 .. 1 .. 0
  const z = -0.2; // leicht nach Nord geneigt, fuer Schattenrichtung
  const v = new THREE.Vector3(x, Math.max(0.02, y), z).normalize();
  return v;
}
export function computeMoonDir(h) {
  // Mond: um 12h phasenverschoben
  const hm = (h + 12) % 24;
  return computeSunDir(hm);
}

// Welches Licht ist "aktiv"? Sonne wenn h in [5.5 .. 18.5], sonst Mond.
export function isDaytime(h) {
  const hh = ((h % 24) + 24) % 24;
  return hh >= 5.5 && hh <= 18.5;
}

export function sampleState(h) {
  const hh = ((h % 24) + 24) % 24;
  const dir = isDaytime(hh) ? computeSunDir(hh) : computeMoonDir(hh);
  return {
    hour: hh,
    isDay: isDaytime(hh),
    dir,
    skyTop:      sampleColor(SKY_TOP, hh),
    skyMid:      sampleColor(SKY_MID, hh),
    skyHorizon:  sampleColor(SKY_HORIZON, hh),
    skyGlow:     sampleColor(SKY_GLOW, hh),
    cloudDark:   sampleColor(CLOUD_DARK, hh),
    cloudLight:  sampleColor(CLOUD_LIGHT, hh),
    cloudEdge:   sampleColor(CLOUD_EDGE, hh),
    lightColor:  sampleColor(LIGHT_COLOR, hh),
    lightIntensity: sampleNumber(LIGHT_INTENSITY, hh),
    hemiSky:     sampleColor(HEMI_SKY, hh),
    hemiGround:  sampleColor(HEMI_GROUND, hh),
    hemiIntensity: sampleNumber(HEMI_INTENSITY, hh),
    ambientIntensity: sampleNumber(AMBIENT_INTENSITY, hh),
    fogColor:    sampleColor(FOG_COLOR, hh),
    fogDensity:  sampleNumber(FOG_DENSITY, hh),
    exposure:    sampleNumber(EXPOSURE, hh),
    lampsOn:     sampleNumber(LAMPS_ON, hh),
    nightMask:   sampleNumber(NIGHT_MASK, hh),
    gradeAmount: sampleNumber(GRADE_AMOUNT, hh),
  };
}

export function formatClock(h) {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
