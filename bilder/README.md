# dnd-world

Ein winziger 3D-Prototyp für Dennis' eigenes D&D-Spiel im Browser.

## Branches

- **`main`** – Variante A: alles prozedural aus Three.js-Geometrien
  (keine externen 3D-Assets).
- **`test-assets`** – Variante B: stilisiertes Dorf mit echten CC0-3D-Modellen
  aus dem **KayKit Medieval Hexagon Pack 1.0**, geladen über `GLTFLoader`.
  Boden, Pflaster, Gras, Blumen und Laternen bleiben prozedural.

Dieses README beschreibt den `test-assets`-Branch.

![Screenshot Tag](docs/screenshot-assets.png)
![Screenshot Nacht](docs/screenshot-night.png)

## Setup

Node 20+ wird benötigt.

```bash
npm install
npm run dev
```

Dev-Server läuft dann auf `http://localhost:5173` (oder dem von Vite
gewählten Port).

## Build

```bash
npm run build
```

Produktions-Build landet in `dist/`. Die GLTFs unter `public/models/` werden
dabei direkt mitkopiert.

## Steuerung

- **Linke Maustaste ziehen**: Szene drehen
- **Mausrad**: zoomen (Grenzen gesetzt, damit man das Dorf im Blick behält)
- Keine Tastatursteuerung / Charakter – das kommt später.

## Projektstruktur

```
src/
  main.js              Renderer, Kamera, Licht, Postprocessing, Loop
  palette.js           Farb-Palette (Nacht: Mondlicht, warme Lampen, …)
  scene/
    assets.js          GLTF-Loader + Cache + Spawn-/Platzierungs-Helfer
    village.js         Komposition: Häuser, Brunnen, Deko, Natur
    ground.js          Boden mit Noise, zentraler Pflasterplatz, Wege
    grass.js           Instanziertes Gras (gebogene Bezier-Halme, Wind) + Blumen
    trees.js           Stylisierte Bäume: Noise-Blobs als Kronen + Bezier-Stamm
    lanterns.js        Prozedurale Laterne + Lagerfeuer (Glow + Flackern)
    windows.js         Warme Fenster-Patches + Innenlicht
    sky.js             Nachthimmel-Dome (Gradient), Sterne, Mond + Halo
    fireflies.js       Glühwürmchen (GPU-Points, pulsierend)
    fog.js             Bodennebel in mehreren Lagen (Noise-Shader)
public/
  models/kaykit/       Alle benutzten GLTFs + Textur-Atlas (~1.2 MB)
docs/
  references/          Stil-Vorlagen
  screenshot.png       Look der prozeduralen Variante (main-Branch)
  screenshot-assets.png Tag-Look mit echten Assets
  screenshot-night.png Aktueller Nacht-Look
```

## Technik-Details (Nacht-Szene)

- **Rendering:** Three.js r169, `WebGLRenderer` mit ACES-Tonemapping,
  PixelRatio ≤ 1.75.
- **Postprocessing:** `EffectComposer` mit `GTAOPass` (Ambient Occlusion),
  gezieltem `UnrealBloomPass` (hoher Threshold: nur Mond, Laternen,
  Fenster, Feuer), eigenem Color-Grade-Pass (kühle Schatten / warme
  Highlights + Vignette), `OutputPass`.
- **Mondlicht:** `DirectionalLight` mit kühlem Blau, 4096er-Shadowmap
  (im `?lite`-Modus 2048), Frustum eng um das Dorf.
- **Himmel:** halbkugeliger Sky-Dome (Gradient-Shader) + ~900 Sterne
  (GL Points mit Twinkle) + Mond-Mesh mit Halo-Billboard.
- **Lichter:** Lagerfeuer am Brunnen (Shadowmap), 8 Laternen (2 davon
  mit Shadowmap, Rest nur Spill-Light), 7 warme Haus-Innenlichter.
- **Nebel:** `FogExp2` für Tiefe + 3 geschichtete Noise-Shader-Planes
  für Bodennebel.
- **Bäume:** `InstancedMesh` aus zusammengeführten Noise-Icospheres mit
  Vertex-Shader-Wind, Höhen-Gradient im Fragment-Shader, leicht
  gebogene Stämme aus `TubeGeometry`.
- **Gras:** `InstancedMesh` aus ~16000 Bezier-Halmen (5 Segmente,
  oben spitz, Farbgradient Wurzel→Spitze), Wind als sin/cos-Welle
  abhängig von Instanzposition.
- **Glühwürmchen:** 70 GPU-Points, additiv, mit Pulse und Drift.

## Lite-Modus (Headless-Screenshots)

Mit `?lite=1` werden die teuersten Parameter reduziert
(Grashalme 16k→5.5k, Shadowmap 4096→2048, Glühwürmchen 70→40) – nur für
headless-Chrome-Screenshots sinnvoll.

## Assets & Lizenzen

Alle 3D-Modelle sind **CC0** (Public Domain) und stammen aus dem
**KayKit Medieval Hexagon Pack 1.0** von Kay Lousberg.

Vollständige Quellenangaben und Datei-Liste: siehe [`CREDITS.md`](./CREDITS.md).

Download-Grösse des benutzten Teilsatzes: ca. **1.2 MB** (24 GLTFs +
gemeinsamer 15 KB Textur-Atlas).

## Nächste Schritte (Ideen)

- Charakter einsetzen + über die Wiese laufen lassen
- Tag/Nacht-Zyklus mit animiertem Sonnen-Direktionallicht
- mehr Dorf-Dekoration (Markt, Brücke, Fluss)
- alternative Asset-Sets testen (Quaternius, Kenney) zum Stil-Vergleich
