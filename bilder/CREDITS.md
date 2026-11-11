# Credits – 3D-Assets

Alle 3D-Modelle in `public/models/` sind externe Assets und bleiben Eigentum
ihrer jeweiligen Autoren. Dieses Projekt verwendet ausschliesslich Pakete
unter Lizenzen, die eine kommerzielle und private Nutzung ohne
Namensnennungs-Pflicht erlauben (CC0). Die Autoren werden hier dennoch
genannt – aus Dank und Transparenz.

---

## KayKit – Medieval Hexagon Pack 1.0

- **Autor:** Kay Lousberg ("KayKit")
- **Lizenz:** CC0 (Public Domain)
- **Quelle:** <https://kaylousberg.itch.io/kaykit-medieval-hexagon>
- **GitHub-Mirror:** <https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0>
- **Verwendete Modelle (in `public/models/kaykit/`):**
  - Gebaeude: `building_home_A_blue`, `building_home_A_red`, `building_home_B_blue`,
    `building_home_B_red`, `building_home_B_yellow`, `building_tavern_blue`,
    `building_market_green`, `building_blacksmith_red`, `building_well_blue`,
    `building_watermill_blue`
  - Deko: `barrel`, `crate_A_big`, `crate_A_small`, `bucket_water`, `sack`,
    `wheelbarrow`, `pallet`, `ladder`, `flag_blue`
  - Natur: `tree_single_A`, `tree_single_B`, `rock_single_A`,
    `rock_single_C`, `rock_single_E`
  - Textur-Atlas: `hexagons_medieval.png`

Alle Modelle wurden unveraendert aus dem Original-Pack uebernommen (gltf +
dazugehoerige `.bin`), nur fuer das Repo-Volumen auf die tatsaechlich
benutzten Dateien reduziert.

---

## Prozedurale Elemente (ohne externe Assets)

- Boden mit Vertex-Color-Noise, zentraler Pflasterplatz und Wege aus
  instanzierten Kleinsteinen, Gras-Instancing mit Wind-Shader, Blumen,
  Laternen mit Glow – alles im Quellcode generiert.
- **Branch `map-village`:** Fluss-Mesh + Wasser-Shader, Holz-/Steinbruecke,
  Tempel/Rathaus, Burg (Palisade + Keep + Fackeln), gepfluegte Felder mit
  Furchen + Hecken, Streuobstwiese — alles rein prozedural aus Three.js-
  Grundformen und Shadern.

---

## Three.js

- **Lizenz:** MIT
- **Quelle:** <https://threejs.org/>
- Verwendete Module unter anderem: `GLTFLoader`, `OrbitControls`,
  `EffectComposer`, `UnrealBloomPass`, `GTAOPass`, `OutputPass`, eigener
  `ShaderPass` fuer Farbkorrektur/Vignette.
