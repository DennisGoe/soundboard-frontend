// Lichter-Pool: konstante Anzahl echter PointLights, die pro Frame (gedrosselt)
// den NAECHSTEN lamp registrations zugewiesen werden.
//
// WICHTIG: Lichtanzahl ist KONSTANT (sonst Shader-Rekompilierung + Ruckler).
// Alle Lampen registrieren sich beim Pool mit einer Position + optionalem
// Target-PointLight-Config (color, distance, baseIntensity). Pro Tick (alle
// 150 ms) weist der Pool die nearestN-Lampen echtes Licht zu — alle anderen
// werden dunkel geschaltet (intensity=0) bleiben aber als Pool-PointLights
// bestehen.
//
// Zusaetzlich: jede Lampe darf emissive-Material halten — dann leuchtet sie
// weiterhin (ohne Schatten auf andere zu werfen) und sieht auch "an" aus,
// wenn sie gerade kein Licht hat.
//
// Nutzung:
//   const pool = createLightsPool(scene, { count: 6 });
//   pool.register({ position, color, distance, baseIntensity, emissiveMaterials });
//   pool.setCameraPosition(cam.position);
//   pool.setMultiplier(0.8);  // tagsueber niedriger, nachts 1.0
//   pool.updateAssignment();  // in loop gedrosselt aufrufen

import * as THREE from 'three';

export function createLightsPool(scene, {
  count = 6,
  color = 0xffa858,
  distance = 7,
  decay = 1.8,
} = {}) {
  const lights = [];
  for (let i = 0; i < count; i++) {
    const l = new THREE.PointLight(color, 0, distance, decay);
    l.castShadow = false;
    l.name = 'poolLight';
    // Weit weg initialisieren — damit three.js nichts rendert.
    l.position.set(1e6, 1e6, 1e6);
    scene.add(l);
    lights.push(l);
  }
  // Registrierungen: jede Lampe
  const regs = []; // [{position: Vector3, color: Color, distance, baseIntensity, emissiveMaterials, phase}]
  let multiplier = 1.0;
  const camPos = new THREE.Vector3();
  let lastUpdate = -1e6;
  let dirty = true;

  function register(opts) {
    const r = {
      position: opts.position.clone(),
      color: new THREE.Color(opts.color ?? color),
      distance: opts.distance ?? distance,
      baseIntensity: opts.baseIntensity ?? 2.4,
      emissiveMaterials: opts.emissiveMaterials || [],
      baseEmissive: (opts.emissiveMaterials || []).map((m) => m.emissiveIntensity),
      phase: Math.random() * Math.PI * 2,
    };
    regs.push(r);
    dirty = true;
    return r;
  }

  function unregister(r) {
    const i = regs.indexOf(r);
    if (i >= 0) {
      regs.splice(i, 1);
      dirty = true;
    }
  }

  function setCameraPosition(v) {
    if (Math.hypot(camPos.x - v.x, camPos.y - v.y, camPos.z - v.z) > 0.5) {
      camPos.copy(v);
      dirty = true;
    } else {
      camPos.copy(v);
    }
  }

  function setMultiplier(m) {
    multiplier = m;
  }

  // Aktualisiert: welche PointLights kriegen welche Registration?
  // Berechnet alle 150ms (gedrosselt).
  function updateAssignment(forceNow = false) {
    const now = performance.now();
    if (!forceNow && !dirty && now - lastUpdate < 150) {
      // Nichts zu tun — aber baseIntensity * mult * flicker trotzdem anwenden:
      applyIntensities(now);
      return;
    }
    lastUpdate = now;
    dirty = false;

    // Alle regs nach Entfernung zur Kamera sortieren.
    const scored = regs.map((r, i) => ({
      i,
      d: camPos.distanceToSquared(r.position),
    }));
    scored.sort((a, b) => a.d - b.d);
    const nearest = scored.slice(0, lights.length);

    // Lampen zuweisen: light[i] -> nearest[i].reg
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (i < nearest.length) {
        const r = regs[nearest[i].i];
        l.position.copy(r.position);
        l.color.copy(r.color);
        l.distance = r.distance;
        // intensity wird in applyIntensities gesetzt
        l.userData.reg = r;
      } else {
        // kein reg mehr -> dunkel
        l.userData.reg = null;
        l.intensity = 0;
      }
    }
    applyIntensities(now);
  }

  const _nowSec = () => performance.now() / 1000;
  function applyIntensities(now) {
    const t = now / 1000;
    for (const l of lights) {
      const r = l.userData.reg;
      if (!r) { l.intensity = 0; continue; }
      const f = 1.0 + Math.sin(t * 7 + r.phase) * 0.08 + Math.sin(t * 11 + r.phase * 2) * 0.05;
      l.intensity = r.baseIntensity * f * multiplier;
    }
    // Emissive-Materialien aller registrierten Lampen pulsen immer — unabhaengig
    // davon, ob sie gerade ein echtes PointLight haben. Das ist der sichtbare
    // "Glow" auch wenn kein Licht zugewiesen wurde.
    for (const r of regs) {
      const f = 1.0 + Math.sin(t * 2.3 + r.phase) * 0.06 + Math.sin(t * 5.3 + r.phase) * 0.04;
      for (let k = 0; k < r.emissiveMaterials.length; k++) {
        const mat = r.emissiveMaterials[k];
        const base = r.baseEmissive[k] ?? 2.0;
        mat.emissiveIntensity = base * f * multiplier;
      }
    }
  }

  function clear() {
    for (const l of lights) scene.remove(l);
    lights.length = 0;
    regs.length = 0;
  }

  function stats() {
    return {
      total: lights.length,
      active: lights.filter((l) => l.userData.reg).length,
      registrations: regs.length,
    };
  }

  return {
    register, unregister,
    setCameraPosition, setMultiplier,
    updateAssignment, clear, stats,
    get lights() { return lights; },
    get regs() { return regs; },
  };
}
