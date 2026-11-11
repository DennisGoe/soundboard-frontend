// Fenster-Glow-Quads: ENTFERNT (Aufgabe 9 / Runde A).
// Die Quads passten nicht zu den KayKit-Modellen und sassen oft neben den
// tatsaechlichen Fenstern. Fuer eine spaetere Runde ist geplant, die Fenster
// ueber Material-Emissive der Haus-Meshes anzusteuern — siehe
// docs/review-r2/notizen.md ("Fenster-Licht spaeter").
//
// attachWindowGlow bleibt als Dummy, damit village.js weiter kompiliert.

import * as THREE from 'three';

export function attachWindowGlow(houseRoot, _opts) {
  // Rueckgabe eines leeren Nodes mit userData, damit bestehender Code (flicker)
  // weiterlaeuft (no-op).
  const g = new THREE.Group();
  g.name = 'windowGlow_disabled';
  g.userData.flicker = () => {};
  g.userData.phase = 0;
  houseRoot.add(g);
  return g;
}
