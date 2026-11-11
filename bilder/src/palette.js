// Nacht-Palette: monochrom blau-violett (Palia / Tiny Glade Vibe).
// Himmel + Nebel + Schatten in gesaettigtem Nachtblau, warme Lichter
// nur als kleine Akzente (Laternen, Fenster, Lagerfeuer, Lichterketten).
// Kein echtes Schwarz.
export const PALETTE = {
  // Himmel — satter Nachthimmel mit Violett-Einschlag
  skyTop:         0x151a48, // tiefes blau-violett oben
  skyMid:         0x242c6c, // mittlerer Horizont
  skyHorizon:     0x3a3878, // leicht violett am Horizont
  skyGlow:        0x5a5aa0, // mond-naher Halo (dezent)

  // Wolken (Billboard/Noise) — dunkel violett, deutlich sichtbar gegenueber Himmel
  cloudDark:      0x08092a, // tiefdunkel, hebt sich klar gegen Himmel ab
  cloudLight:     0x5c48a0, // deutlich heller violett
  cloudEdge:      0x9070d8, // heller Rand nahe Mond

  // Berge-Silhouette
  hillsFar:       0x1b2048,
  hillsNear:      0x121634,

  // Mond — dezent, matter, nicht zu hell
  moonCore:       0xb7c2e0,
  moonCrater:     0x7784b0,
  moonHalo:       0x4d5a9c,

  // Nebel (Exp2) — satter Nachtblauton, hebt Tiefe hervor
  fogColor:       0x1e2558,

  // Gras: SATTES Wiesengruen (statt vorher blaeulich-grau). Gilt fuer Boden
  // UND Halme. Der Boden darf zwischen den Halmen nicht als grau-blauer Fleck
  // durchscheinen — sondern in warmem Wiesengruen.
  grass:          0x5a8a4a,
  grassDark:      0x3d6a36,
  grassLit:       0x8ab86a,
  grassMeadow:    0x6ea04e, // helles Wiesengruen (Tag)
  grassMoss:      0x4a7540, // moosiger Schatten fuer Gras-Insel-Bueschel

  // Boden-Erde & Waldboden (jetzt mit Gruen-Einschlag statt rein braun-blau)
  dirt:           0x3b2d20,
  dirtLight:      0x55402b,
  forestFloor:    0x1e2a1a, // dunkler Waldboden mit Gruen-Einschlag
  cobble:         0x58647a,
  cobbleDark:     0x343a52,

  // Mondlicht & Hemisphere — kuehles Blau, lesbar
  moonLight:      0xaec4ff,
  hemiSky:        0x4a5c90,
  hemiGround:     0x2a4225, // sattgruener Grund-Reflex (vorher blaeulich)

  // Warme Akzent-Lichter (klein, aber gesaettigt)
  lanternGlow:    0xffa858,
  lanternHot:     0xffe4b0,
  fireGlow:       0xff7a2a,
  fireHot:        0xffcc85,
  windowGlow:     0xffb867,
  stringLight:    0xffdca0, // Lichterketten warmgelb
  fireflyGlow:    0xfff4b0,
};
