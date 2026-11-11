// Shared helpers for InstancedMesh pools.
//
// Three.js Frustum-Culling bug: InstancedMesh.boundingSphere ist standardmaessig
// null. Der Culler faellt dann auf geometry.boundingSphere zurueck — eine Kugel
// um den ORIGIN (0,0,0). Sobald die Kamera vom Origin weg schaut, werden alle
// Instanz-Pools gecullt, auch wenn ihre tatsaechlichen Instanzen sichtbar waeren.
// Das war die Ursache dafuer, dass Gaerten/Zaeune/Marktstaende aus der Startansicht
// unsichtbar waren. Fix: nach dem Setzen aller Matrizen computeBoundingSphere()
// aufrufen. Die Methode scannt alle Instanz-Matrizen und erzeugt eine Kugel,
// die den gesamten Pool umschliesst.
import * as THREE from 'three';

export function finalizeInstanced(inst) {
  if (!inst) return inst;
  inst.instanceMatrix.needsUpdate = true;
  // instanceColor ggf. auch synchronisieren
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  // computeBoundingSphere/Box scannen alle Instanz-Matrizen -> echte Welt-BBox.
  if (typeof inst.computeBoundingSphere === 'function') inst.computeBoundingSphere();
  if (typeof inst.computeBoundingBox === 'function') inst.computeBoundingBox();
  return inst;
}
