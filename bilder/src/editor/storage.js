// LocalStorage + Export/Import des SceneDoc.
import { normalize, defaultDoc, SCENE_DOC_VERSION } from './sceneDoc.js';

const LS_KEY = 'dnd-world.sceneDoc.v1';

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultDoc();
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch (e) {
    console.warn('[editor] localStorage load failed:', e);
    return defaultDoc();
  }
}

export function saveToStorage(doc) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(doc));
    return true;
  } catch (e) {
    console.warn('[editor] localStorage save failed:', e);
    return false;
  }
}

export function clearStorage() {
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* noop */ }
}

// Datei-Download als .json
export function exportDoc(doc, filename = 'dorf.json') {
  const data = JSON.stringify({ ...doc, version: SCENE_DOC_VERSION }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// Dateiauswahl + Parsen
export function importDocFromFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        resolve(normalize(parsed));
      } catch (e) { reject(e); }
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
