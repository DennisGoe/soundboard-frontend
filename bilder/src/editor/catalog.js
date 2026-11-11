// Palette-Katalog: alle platzierbaren Objekt-Typen, gruppiert nach Kategorie.
// Jeder Eintrag beschreibt, wie das Objekt gespawnt und auf den Boden gesetzt
// wird. "icon" ist ein kleines SVG/Emoji zur schnellen visuellen Erkennung.
//
// Phase 1: alles, was es im Dorf jetzt schon gibt. Phase 2 wird Pinsel-
// Varianten (z.B. "Weg malen") als eigene Modi oben in der UI dazuschalten,
// nicht als Palette-Eintrag.

export const CATEGORIES = [
  { id: 'houses',   label: 'Häuser' },
  { id: 'special',  label: 'Besondere Gebäude' },
  { id: 'bridges',  label: 'Brücken' },
  { id: 'nature',   label: 'Natur' },
  { id: 'fences',   label: 'Zäune & Gärten' },
  { id: 'decor',    label: 'Deko' },
  { id: 'light',    label: 'Licht' },
];

// type-string ist stabil (wird in JSON gespeichert). Prefix:
//   house.*  -> KayKit Haeuser (Standard-Maßstab ~3.2)
//   tree.*   -> Baeume
//   rock.*   -> Felsen
//   prop.*   -> Kleinteile
//   fence.*  -> einfache Zaunelemente
//   light.*  -> Laternen / Lampen
export const CATALOG = [
  // ---- Haeuser ----------------------------------------------------------
  { type: 'house.homeA_blue',   category: 'houses',  label: 'Haus A blau',   asset: 'building_home_A_blue',   defaultScale: 3.2, icon: '🏠' },
  { type: 'house.homeA_red',    category: 'houses',  label: 'Haus A rot',    asset: 'building_home_A_red',    defaultScale: 3.2, icon: '🏠' },
  { type: 'house.homeB_blue',   category: 'houses',  label: 'Haus B blau',   asset: 'building_home_B_blue',   defaultScale: 3.2, icon: '🏡' },
  { type: 'house.homeB_red',    category: 'houses',  label: 'Haus B rot',    asset: 'building_home_B_red',    defaultScale: 3.2, icon: '🏡' },
  { type: 'house.homeB_yellow', category: 'houses',  label: 'Haus B gelb',   asset: 'building_home_B_yellow', defaultScale: 3.2, icon: '🏡' },
  { type: 'house.tavern',       category: 'houses',  label: 'Taverne',       asset: 'building_tavern_blue',   defaultScale: 4.0, icon: '🍺' },
  { type: 'house.blacksmith',   category: 'houses',  label: 'Schmiede',      asset: 'building_blacksmith_red',defaultScale: 3.6, icon: '⚒️' },

  // ---- Besondere Gebaeude ----------------------------------------------
  { type: 'house.market',       category: 'special', label: 'Markthalle',    asset: 'building_market_green',  defaultScale: 2.6, icon: '🏪' },
  { type: 'house.watermill',    category: 'special', label: 'Wassermühle',   asset: 'building_watermill_blue',defaultScale: 4.0, icon: '🌾' },
  { type: 'house.well',         category: 'special', label: 'Brunnen',       asset: 'building_well_blue',     defaultScale: 1.8, icon: '🪣' },
  // Burg: nur zum Materialisieren (die Burg wird prozedural beim Start erzeugt
  // und im Editor selektierbar; manuelles Platzieren erzeugt hier nur ein
  // Platzhalter-Haus). Icon zeigt das Gesamt-Konzept.
  { type: 'castle.main',        category: 'special', label: 'Burg',          asset: 'building_market_green',  defaultScale: 3.6, icon: '🏰' },
  // Tempel: prozedural gebaut (src/scene/temple.js). asset=null — spawnPlaceable
  // ruft createTemple() auf. defaultScale deckt den Standard-Dorf-Wert ab, damit
  // Skalieren/Undo richtige Grenzen (0.5x..2x) berechnet.
  { type: 'house.temple',       category: 'special', label: 'Tempel',        asset: null,                     defaultScale: 3.6, icon: '⛪' },

  // ---- Natur (Baeume + Felsen) -----------------------------------------
  { type: 'tree.leafy',         category: 'nature',  label: 'Laubbaum',      asset: 'tree_single_A',          defaultScale: 1.2, icon: '🌳' },
  { type: 'tree.pine',          category: 'nature',  label: 'Tanne',         asset: 'tree_single_B',          defaultScale: 1.2, icon: '🌲' },
  { type: 'tree.orchard',       category: 'nature',  label: 'Obstbaum',      asset: 'tree_single_A',          defaultScale: 1.0, icon: '🍎' },
  { type: 'rock.a',             category: 'nature',  label: 'Felsen klein',  asset: 'rock_single_A',          defaultScale: 0.9, icon: '🪨' },
  { type: 'rock.c',             category: 'nature',  label: 'Felsen mittel', asset: 'rock_single_C',          defaultScale: 1.0, icon: '🪨' },
  { type: 'rock.e',             category: 'nature',  label: 'Felsen groß',   asset: 'rock_single_E',          defaultScale: 1.2, icon: '🪨' },

  // ---- Zaeune & Gaerten (Phase 1: einfache Elemente) --------------------
  // Fuer Phase 2 wird "Zaun malen" als Pinsel-Modus ergaenzt.
  { type: 'prop.pallet',        category: 'fences',  label: 'Palette',       asset: 'pallet',                 defaultScale: 0.6, icon: '🪵' },
  { type: 'prop.ladder',        category: 'fences',  label: 'Leiter',        asset: 'ladder',                 defaultScale: 0.7, icon: '🪜' },

  // ---- Deko (Props) -----------------------------------------------------
  { type: 'prop.barrel',        category: 'decor',   label: 'Fass',          asset: 'barrel',                 defaultScale: 0.6, icon: '🛢' },
  { type: 'prop.crate_small',   category: 'decor',   label: 'Kiste klein',   asset: 'crate_A_small',          defaultScale: 0.6, icon: '📦' },
  { type: 'prop.crate_big',     category: 'decor',   label: 'Kiste groß',    asset: 'crate_A_big',            defaultScale: 0.6, icon: '📦' },
  { type: 'prop.sack',          category: 'decor',   label: 'Sack',          asset: 'sack',                   defaultScale: 0.6, icon: '🛍' },
  { type: 'prop.bucket',        category: 'decor',   label: 'Eimer',         asset: 'bucket_water',           defaultScale: 0.6, icon: '🪣' },
  { type: 'prop.wheelbarrow',   category: 'decor',   label: 'Schubkarre',    asset: 'wheelbarrow',            defaultScale: 0.6, icon: '🛒' },
  { type: 'prop.flag_blue',     category: 'decor',   label: 'Flagge',        asset: 'flag_blue',              defaultScale: 0.6, icon: '🚩' },

  // ---- Bruecken ---------------------------------------------------------
  { type: 'bridge.wood',        category: 'bridges', label: 'Holzbrücke',    asset: null,                     defaultScale: 1.0, icon: '🌉' },
  { type: 'bridge.stone',       category: 'bridges', label: 'Steinbrücke',   asset: null,                     defaultScale: 1.0, icon: '🌉' },

  // ---- Licht: mehrere Lichtarten mit echtem Licht-Pool-Verhalten --------
  // Alle Lichter nutzen einen gemeinsamen PointLight-Pool (siehe lightsPool.js).
  { type: 'light.lantern',      category: 'light',   label: 'Laterne',       asset: null,                     defaultScale: 1.0, icon: '🏮' },
  { type: 'light.streetlamp',   category: 'light',   label: 'Straßenlaterne',asset: null,                     defaultScale: 1.0, icon: '🪔' },
  { type: 'light.groundLamp',   category: 'light',   label: 'Bodenlampe',    asset: null,                     defaultScale: 1.0, icon: '💡' },
  { type: 'light.torch',        category: 'light',   label: 'Wandfackel',    asset: null,                     defaultScale: 1.0, icon: '🔥' },
  { type: 'light.brazier',      category: 'light',   label: 'Feuerschale',   asset: null,                     defaultScale: 1.0, icon: '🔥' },
];

export function getCatalogEntry(type) {
  return CATALOG.find((e) => e.type === type) || null;
}

export function catalogByCategory() {
  const out = {};
  for (const c of CATEGORIES) out[c.id] = [];
  for (const e of CATALOG) {
    if (!out[e.category]) out[e.category] = [];
    out[e.category].push(e);
  }
  return out;
}
