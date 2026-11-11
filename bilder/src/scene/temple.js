// Tempel/Rathaus in der Dorfmitte: breiter heller Steinbau mit Holzakzenten,
// Satteldach, kleiner Dachreiter (Glockenturm) im richtigen Verhaeltnis.
// Dimensionen sind bewusst klein — der Skalierungsfaktor kommt von aussen
// aus mapLayout.HOUSES[temple].scale.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

export function createTemple({ scale = 1 } = {}) {
  const g = new THREE.Group();

  // Materialien — kuehle Steinfarben, dunkles Holz, dunkles Schieferdach.
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x9a988e, roughness: 1.0, metalness: 0.0,
  });
  const stoneDarkMat = new THREE.MeshStandardMaterial({
    color: 0x6d6b62, roughness: 1.0, metalness: 0.0,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x3b2514, roughness: 1.0, metalness: 0.0,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x4a2a36, roughness: 1.0, metalness: 0.0,
  });
  const roofDarkMat = new THREE.MeshStandardMaterial({
    color: 0x2a1824, roughness: 1.0, metalness: 0.0,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffd48a,
    emissive: new THREE.Color(PALETTE.windowGlow),
    emissiveIntensity: 1.2,
  });

  // --- Hauptbau: laenglicher Steinblock, 2.4w x 1.7d x 1.4h -----------------
  const bodyW = 2.4, bodyD = 1.7, bodyH = 1.4;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW, bodyH, bodyD),
    stoneMat,
  );
  body.position.y = bodyH / 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // --- Steinsockel (dunkler Fusskranz, breiter + hoeher — Treppe-Optik) -----
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW + 0.32, 0.30, bodyD + 0.32),
    stoneDarkMat,
  );
  base.position.y = 0.15;
  base.receiveShadow = true;
  g.add(base);
  const step = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW + 0.60, 0.15, bodyD + 0.60),
    stoneDarkMat,
  );
  step.position.y = 0.075;
  step.receiveShadow = true;
  g.add(step);

  // --- Eckquader (corner quoins) als helle Steinbloecke an den 4 Ecken ------
  const quoinMat = new THREE.MeshStandardMaterial({ color: 0xbab6a8, roughness: 1.0 });
  const quoinGeo = new THREE.BoxGeometry(0.22, bodyH, 0.22);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const q = new THREE.Mesh(quoinGeo, quoinMat);
      q.position.set(sx * (bodyW / 2 - 0.02), bodyH / 2, sz * (bodyD / 2 - 0.02));
      q.castShadow = true;
      g.add(q);
    }
  }

  // --- Satteldach (Prisma) -------------------------------------------------
  const roofRise = 0.8;
  const roofGeo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -bodyW/2 - 0.1, bodyH,              bodyD/2 + 0.08,
     bodyW/2 + 0.1, bodyH,              bodyD/2 + 0.08,
     bodyW/2 + 0.1, bodyH + roofRise,   0,
    -bodyW/2 - 0.1, bodyH + roofRise,   0,
    -bodyW/2 - 0.1, bodyH,             -bodyD/2 - 0.08,
     bodyW/2 + 0.1, bodyH,             -bodyD/2 - 0.08,
  ]);
  const idx = [
    0, 1, 2,  0, 2, 3,        // Front-Dachflaeche (oben)
    3, 2, 5,  3, 5, 4,        // Back-Dachflaeche
    0, 3, 4,  5, 2, 1,        // Giebel (Dreiecke an den Enden)
  ];
  roofGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = true;
  g.add(roof);

  // Dachkante / Holzbalken
  const eaves = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW + 0.25, 0.08, bodyD + 0.22),
    woodMat,
  );
  eaves.position.y = bodyH + 0.04;
  g.add(eaves);

  // --- Dachziegel-Linien (horizontale Latten) — 4 Reihen pro Dachseite ------
  const tileMat = new THREE.MeshStandardMaterial({
    color: 0x361920, roughness: 1.0,
  });
  // Dachseite geht von y=bodyH am Traufende zu y=bodyH+roofRise am First.
  // Jede Linie ist ein schmales Box-Mesh, parallel zum First (X-Achse).
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    const slopeLen = Math.hypot(bodyD / 2 + 0.08, roofRise);
    const nTiles = 4;
    for (let t = 1; t <= nTiles; t++) {
      const fT = t / (nTiles + 1);
      const yT = bodyH + fT * roofRise;
      const zT = sgn * (bodyD / 2 + 0.08) * (1 - fT);
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(bodyW + 0.22, 0.03, 0.09),
        tileMat,
      );
      tile.position.set(0, yT + 0.015, zT);
      // Neigung der Dachflaeche
      const angle = Math.atan2(roofRise, bodyD / 2 + 0.08);
      tile.rotation.x = sgn > 0 ? -angle : angle;
      g.add(tile);
    }
  }

  // --- Dachreiter / Glockenturm --------------------------------------------
  // Deutlich kleiner als vorher (0.42 statt 0.55, Hoehe 0.95 statt 1.4).
  const towerW = 0.42, towerH = 0.95;
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(towerW, towerH, towerW),
    stoneDarkMat,
  );
  tower.position.set(0, bodyH + roofRise + towerH / 2 - 0.1, 0);
  tower.castShadow = true;
  g.add(tower);
  // Turmdach (schlanke Pyramide)
  const towerRoof = new THREE.Mesh(
    new THREE.ConeGeometry(towerW * 0.72, 0.65, 4),
    roofDarkMat,
  );
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.position.set(0, tower.position.y + towerH / 2 + 0.32, 0);
  towerRoof.castShadow = true;
  g.add(towerRoof);

  // Glocken-Oeffnung: dunkles Rechteck pro Seite
  const bellOpen = new THREE.MeshStandardMaterial({
    color: 0x1c1420, roughness: 1.0,
  });
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * Math.PI * 2;
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), bellOpen);
    q.position.set(
      tower.position.x + Math.cos(a) * (towerW / 2 + 0.005),
      tower.position.y + 0.08,
      Math.sin(a) * (towerW / 2 + 0.005),
    );
    q.lookAt(
      tower.position.x + Math.cos(a) * 2,
      q.position.y,
      Math.sin(a) * 2,
    );
    g.add(q);
  }

  // --- Fenster (rundbogen-artig als kleine Planes) mit Holzrahmen + Kreuz ---
  const winPlane = new THREE.PlaneGeometry(0.28, 0.42);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 1.0 });
  const sillMat  = new THREE.MeshStandardMaterial({ color: 0xa08560, roughness: 1.0 });
  for (let i = -1; i <= 1; i++) {
    for (const side of [1, -1]) {
      const w = new THREE.Mesh(winPlane, windowMat);
      w.position.set(i * 0.7, 0.82, side * (bodyD / 2 + 0.012));
      w.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(w);
      // Rahmen (4 Boxes um das Fenster herum)
      const fw = 0.28 + 0.08, fh = 0.42 + 0.08, ft = 0.05, fd = 0.06;
      const zOff = side * (bodyD / 2 + 0.03);
      for (const [dx, dy, sxw, syh] of [
        [0,  fh/2 - ft/2, fw, ft],   // oben
        [0, -fh/2 + ft/2, fw, ft],   // unten
        [-fw/2 + ft/2, 0, ft, fh],   // links
        [ fw/2 - ft/2, 0, ft, fh],   // rechts
      ]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(sxw, syh, fd), frameMat);
        f.position.set(i * 0.7 + dx, 0.82 + dy, zOff);
        g.add(f);
      }
      // Querbalken (Fensterkreuz, duenn)
      const horiz = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.04), frameMat);
      horiz.position.set(i * 0.7, 0.82, zOff);
      g.add(horiz);
      const vert = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.42, 0.04), frameMat);
      vert.position.set(i * 0.7, 0.82, zOff);
      g.add(vert);
      // Fensterbank
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.08), sillMat);
      sill.position.set(i * 0.7, 0.57, side * (bodyD / 2 + 0.04));
      g.add(sill);
    }
  }

  // --- Fachwerk: horizontale + vertikale Balken auf den Laengswaenden --------
  // sichtbare Holzgliederung (Timber-Framing-Look) laengs beider Seiten.
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 1.0 });
  for (const side of [1, -1]) {
    const zOff = side * (bodyD / 2 + 0.02);
    // oberer Horizontalbalken knapp unter dem Dach
    const top = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.1, 0.08, 0.04), beamMat);
    top.position.set(0, bodyH - 0.1, zOff);
    g.add(top);
    // mittlerer Horizontalbalken auf Hoehe 0.55
    const mid = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.1, 0.06, 0.04), beamMat);
    mid.position.set(0, 0.45, zOff);
    g.add(mid);
    // vertikale Pfosten zwischen den Fenstern
    for (const xC of [-1.05, -0.35, 0.35, 1.05]) {
      const vb = new THREE.Mesh(new THREE.BoxGeometry(0.08, bodyH - 0.3, 0.04), beamMat);
      vb.position.set(xC, (bodyH - 0.3) / 2 + 0.3, zOff);
      g.add(vb);
    }
  }
  // Giebel-Holzbalken (an den Stirnseiten unterm Dach)
  for (const sx of [-1, 1]) {
    const diag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.04), beamMat);
    diag.position.set(sx * (bodyW / 2 + 0.02), bodyH + roofRise * 0.5, 0);
    diag.rotation.y = Math.PI / 2;
    diag.rotation.z = sx > 0 ? -0.7 : 0.7;
    g.add(diag);
  }
  // --- Tuer (dunkles Holz) --------------------------------------------------
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x1f1208, roughness: 1.0 }),
  );
  door.position.set(0, 0.48, bodyD / 2 + 0.014);
  g.add(door);

  // Pfosten links/rechts der Tuer
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a190a, roughness: 1.0 });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.96, 0.08), postMat);
    p.position.set(sx * 0.32, 0.5, bodyD / 2 + 0.03);
    g.add(p);
  }

  g.scale.setScalar(scale);
  g.name = 'temple';
  return g;
}
