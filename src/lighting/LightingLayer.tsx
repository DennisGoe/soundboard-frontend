import React, { useEffect, useRef } from "react";
import { MapLighting, LightSource, TokenInstance } from "../modules/api";
import { base64ToBytes, fogToImageData } from "./fogBits";

// Gemeinsame View-Transform-Beschreibung (Feldkoordinaten -> Bildschirm-Pixel).
// Dupliziert deliberately die Interface-Form aus GamePage, damit die Komponente
// autark ist (kein Zirkel-Import).
export interface ViewT {
    baseFieldPx: number; // Pixel pro Feld bei scale=1
    baseOffsetX: number;
    baseOffsetY: number;
    scale: number;
    panX: number;
    panY: number;
}

export interface LightingLayerProps {
    lighting: MapLighting;
    vt: ViewT;
    isOwner: boolean;
    // Fuer Token-Lichter brauchen wir die aktuelle Token-Liste (Position live).
    tokens: TokenInstance[];
    // Deckkraft fuer den GM, wenn abgedeckt (default 0.5). Spieler sehen die
    // Nebel-/Dunkelheits-Overlays mit playerFogAlpha bzw. playerDarknessAlpha
    // (default 1 = voller Nebel/voll schwarz).
    gmFogAlpha?: number;
    gmDarkAlpha?: number;
    // Spieler-Deckkraft, vom GM pro Karte eingestellt (0..1). 1 = wie bisher
    // (komplett schwarz / voller Nebel), kleiner = Spieler sehen die Karte
    // schemenhaft durch das Overlay.
    playerFogAlpha?: number;
    playerDarknessAlpha?: number;
    // Falls die Karte eine endliche Welt hat (2d-editor hat width/height, oder
    // 2d-image hat imgW/cellPx-cols). Wir zeichnen Fog nur in diesem Rechteck.
    worldFieldsW: number;
    worldFieldsH: number;
    // Falls die Karte ein Welt-Offset hat (2d-editor rendert bei (0..w,0..h) in Feld-Koords).
}

function fieldToScreen(vt: ViewT, fx: number, fy: number) {
    return {
        sx: vt.panX + (vt.baseOffsetX + fx * vt.baseFieldPx) * vt.scale,
        sy: vt.panY + (vt.baseOffsetY + fy * vt.baseFieldPx) * vt.scale,
    };
}

// Faktor Fuss -> Feld: 5 ft = 1 Feld.
function feetToFields(feet: number): number {
    return feet / 5;
}

/**
 * Overlay-Canvas ueber der Karte.
 *
 * Reihenfolge:
 *  1. Alles mit gefuelltem schwarzem Overlay vorbelegen (abhaengig von darkness/fog).
 *  2. Lichter bei darkness=true "ausstanzen" (destination-out in einem Hilfs-Canvas).
 *  3. Nebel-Maske zusaetzlich ueberlagern (bits -> ImageData -> drawImage mit Nearest-Neighbor).
 *  4. Spieler sehen abgedecktes 100 % schwarz, GM nur ~50 %.
 *
 * Wichtig: wir trennen die beiden Overlays, weil Nebel immer deckt, auch dort,
 * wo Licht faellt (abgedeckt bleibt abgedeckt — das ist die Produktregel).
 */
const LightingLayer: React.FC<LightingLayerProps> = ({
    lighting, vt, isOwner, tokens,
    gmFogAlpha = 0.5, gmDarkAlpha = 0.55,
    playerFogAlpha = 1, playerDarknessAlpha = 1,
    worldFieldsW, worldFieldsH,
}) => {
    // Clamp 0..1, damit kaputte Server-Payloads oder NaN niemals zu komisch
    // aussehenden Canvas-Werten fuehren.
    const pFA = Math.max(0, Math.min(1, Number.isFinite(playerFogAlpha) ? playerFogAlpha : 1));
    const pDA = Math.max(0, Math.min(1, Number.isFinite(playerDarknessAlpha) ? playerDarknessAlpha : 1));
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const cv = canvasRef.current;
        const wrap = containerRef.current;
        if (!cv || !wrap) return;
        const dpr = window.devicePixelRatio || 1;
        const cw = wrap.clientWidth, ch = wrap.clientHeight;
        if (cw <= 0 || ch <= 0) return;
        cv.width = Math.max(1, Math.floor(cw * dpr));
        cv.height = Math.max(1, Math.floor(ch * dpr));
        cv.style.width = cw + "px";
        cv.style.height = ch + "px";
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);

        // Feld-Rechteck in Screen-Koords.
        const topLeft = fieldToScreen(vt, 0, 0);
        const bottomRight = fieldToScreen(vt, worldFieldsW, worldFieldsH);
        const worldX = topLeft.sx;
        const worldY = topLeft.sy;
        const worldW = bottomRight.sx - topLeft.sx;
        const worldH = bottomRight.sy - topLeft.sy;

        // ---- (1) Dunkelheit ----
        if (lighting.darkness) {
            // Wir nehmen ein zweites, Offscreen-Canvas: schwarz fuellen, dann per
            // destination-out die Lichter rauszeichnen, danach ins Haupt-Canvas blitten
            // mit entsprechendem globalAlpha je nach Rolle.
            const off = document.createElement("canvas");
            off.width = Math.max(1, Math.floor(cw * dpr));
            off.height = Math.max(1, Math.floor(ch * dpr));
            const octx = off.getContext("2d");
            if (octx) {
                octx.setTransform(dpr, 0, 0, dpr, 0, 0);
                // Schwarz auf WELT-Rechteck (nicht ueber Chat/UI). Dann bleibt die
                // Welt rundherum (Rand) ohnehin leer/unbenutzt.
                octx.fillStyle = "#000";
                octx.fillRect(worldX, worldY, worldW, worldH);
                // Lichter rausstanzen (weicher Gradient).
                octx.globalCompositeOperation = "destination-out";
                for (const light of lighting.lights) {
                    if (!light.enabled) continue;
                    const pos = resolveLightPos(light, tokens);
                    if (!pos) continue;
                    const brightFlds = feetToFields(light.bright);
                    const dimFlds = feetToFields(light.dim);
                    const totalFlds = brightFlds + dimFlds;
                    if (totalFlds <= 0) continue;
                    const s = fieldToScreen(vt, pos.x, pos.y);
                    const rPx = totalFlds * vt.baseFieldPx * vt.scale;
                    const brightPx = brightFlds * vt.baseFieldPx * vt.scale;
                    // Radial gradient: hell (alpha=1) -> weniger hell (0.7 bei Beginn dim) -> 0.
                    const g = octx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, rPx);
                    g.addColorStop(0, "rgba(255,255,255,1)");
                    g.addColorStop(Math.max(0.001, brightPx / rPx), "rgba(255,255,255,0.75)");
                    g.addColorStop(1, "rgba(255,255,255,0)");
                    octx.fillStyle = g;
                    octx.beginPath();
                    octx.arc(s.sx, s.sy, rPx, 0, Math.PI * 2);
                    octx.fill();
                }
                octx.globalCompositeOperation = "source-over";

                // In Haupt-Canvas blitten; GM gedaempft, Spieler mit der
                // server-persistierten Deckkraft (1 = komplett schwarz, 0 = aus).
                ctx.save();
                ctx.globalAlpha = isOwner ? gmDarkAlpha : pDA;
                // DPR-Normalisierung: off ist in Device-Pixel, wir zeichnen mit resetter Transform in Logical-Coords.
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(off, 0, 0);
                ctx.restore();
                // Zuruecksetzen fuer Fog.
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

                // Dezente farbige Lichter als zweite, additive Schicht (nur wenn
                // mindestens eine Lampe eine Farbe != neutral hat). Rein kosmetisch.
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                ctx.globalAlpha = isOwner ? 0.08 : 0.15;
                for (const light of lighting.lights) {
                    if (!light.enabled) continue;
                    const pos = resolveLightPos(light, tokens);
                    if (!pos) continue;
                    const brightFlds = feetToFields(light.bright);
                    const dimFlds = feetToFields(light.dim);
                    const totalFlds = brightFlds + dimFlds;
                    if (totalFlds <= 0) continue;
                    const s = fieldToScreen(vt, pos.x, pos.y);
                    const rPx = totalFlds * vt.baseFieldPx * vt.scale;
                    const g = ctx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, rPx);
                    g.addColorStop(0, hexToRgba(light.color, 1));
                    g.addColorStop(1, hexToRgba(light.color, 0));
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(s.sx, s.sy, rPx, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        // ---- (2) Nebel ----
        if (lighting.fogW > 0 && lighting.fogH > 0) {
            const bytes = base64ToBytes(lighting.fogBits);
            if (bytes.length > 0) {
                const fogImg = fogToImageData(bytes, lighting.fogW, lighting.fogH);
                // Nebel-Dimension kann von world-dim abweichen (2d-image rechnet Fog
                // basierend auf imgW/cellPx; world-Dim entspricht i.d.R. aber dem).
                // Wir malen die Fog-Maske mit scale auf world-Rect.
                const tmp = document.createElement("canvas");
                tmp.width = lighting.fogW;
                tmp.height = lighting.fogH;
                const tctx = tmp.getContext("2d");
                if (tctx) {
                    tctx.putImageData(fogImg, 0, 0);
                    ctx.save();
                    ctx.globalAlpha = isOwner ? gmFogAlpha : pFA;
                    // Nearest-Neighbor: Pixel pro Feld, keine Weichzeichnung.
                    (ctx as any).imageSmoothingEnabled = false;
                    ctx.drawImage(
                        tmp,
                        0, 0, lighting.fogW, lighting.fogH,
                        worldX, worldY, worldW, worldH
                    );
                    ctx.restore();
                }
            }
        }

        // Kleine Marker fuer static-Lichter beim GM (damit er sieht, wo sie sind).
        if (isOwner) {
            ctx.save();
            for (const light of lighting.lights) {
                if (light.kind !== 'static') continue;
                const pos = { x: light.x, y: light.y };
                const s = fieldToScreen(vt, pos.x, pos.y);
                ctx.beginPath();
                ctx.arc(s.sx, s.sy, 6, 0, Math.PI * 2);
                ctx.fillStyle = light.enabled ? light.color : "#555";
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "#1b120a";
                ctx.stroke();
            }
            ctx.restore();
        }
    }, [
        lighting, vt.baseFieldPx, vt.baseOffsetX, vt.baseOffsetY, vt.scale, vt.panX, vt.panY,
        isOwner, tokens, gmFogAlpha, gmDarkAlpha, pFA, pDA, worldFieldsW, worldFieldsH,
    ]);

    return (
        <div
            ref={containerRef}
            className="lighting-layer"
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}
        >
            <canvas ref={canvasRef} />
        </div>
    );
};

function resolveLightPos(light: LightSource, tokens: TokenInstance[]): { x: number; y: number } | null {
    if (light.kind === 'static') return { x: light.x, y: light.y };
    if (light.kind === 'token') {
        const t = tokens.find((tk) => tk.id === light.tokenId);
        if (!t) return null;
        // Mitte des Tokens.
        return { x: t.x + t.size / 2, y: t.y + t.size / 2 };
    }
    return null;
}

function hexToRgba(hex: string, a: number): string {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
    if (!m) return `rgba(255,207,128,${a})`;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r},${g},${b},${a})`;
}

export default LightingLayer;
