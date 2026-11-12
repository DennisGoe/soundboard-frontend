// Bit-Maske fuer den Nebel. Identisches Format wie BE src/lightingOps.js
// (row-major, LSB-first). Base64 <-> Uint8Array.

export function base64ToBytes(b64: string): Uint8Array {
    if (!b64) return new Uint8Array(0);
    try {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return new Uint8Array(0);
    }
}

export function bytesToBase64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

export function bitAt(bytes: Uint8Array, w: number, x: number, y: number): 0 | 1 {
    const i = y * w + x;
    return (((bytes[i >> 3] || 0) >> (i & 7)) & 1) as 0 | 1;
}

// Rendert die Fog-Maske auf ein ImageData-Buffer. Jede abgedeckte Zelle wird
// im Zielbild mit alpha=255 gemalt, aufgedeckte Zellen mit alpha=0. Die
// Groesse des ImageData ist w*h (eine Pixel pro Feld). Spaeter zeichnen wir
// das Bild mit drawImage + scaling in Spiel-Pixel.
export function fogToImageData(bytes: Uint8Array, w: number, h: number): ImageData {
    const img = new ImageData(Math.max(1, w), Math.max(1, h));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const covered = bitAt(bytes, w, x, y);
            const i = (y * w + x) * 4;
            img.data[i] = 0;
            img.data[i + 1] = 0;
            img.data[i + 2] = 0;
            img.data[i + 3] = covered ? 255 : 0;
        }
    }
    return img;
}
