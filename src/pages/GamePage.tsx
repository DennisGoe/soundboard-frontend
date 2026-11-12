import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiService, {
    Campaign, CharacterDoc, ChatMessage, MapFull, MapGrid, MapListItem,
    MapLighting, LightSource,
    TokenGroup, TokenInstance,
    Initiative, InventoryDoc,
} from "../modules/api";
import { InitiativePanel, InventoryPanel } from "./combatPanels";
import { getSocket } from "../modules/notifications/socket";
import { useAuth } from "../hooks/useAuth";
import "./campaigns.css";
import "./game.css";
import "./mapEditor.css";
import "./characters.css";
import { EditorDoc, normalizeDoc } from "../mapEditor/engine";
import { Transform, render as renderMap } from "../mapEditor/renderer";
import { TokenPreview } from "./CharactersPage";
import LightingLayer, { ViewT } from "../lighting/LightingLayer";

// D&D-Fackel-Presets: bright, dim (in Fuss).
// Fackel seit Runde 3e: Radius nur 5 ft (= 1 Feld), weicher Verlauf.
// bright=2.5 + dim=2.5 ergibt total 5 ft mit mittigem Falloff.
const LIGHT_PRESETS: { key: string; name: string; bright: number; dim: number; color: string }[] = [
    { key: 'kerze',  name: 'Kerze (5/5)',       bright: 5,   dim: 5,   color: '#ffe3a1' },
    { key: 'fackel', name: 'Fackel (5 ft)',     bright: 2.5, dim: 2.5, color: '#ffbb66' },
    { key: 'laterne',name: 'Laterne (30/30)',   bright: 30,  dim: 30,  color: '#ffd891' },
    { key: 'feuer',  name: 'Lagerfeuer (20/40)',bright: 20,  dim: 40,  color: '#ff8a3c' },
    { key: 'tages',  name: 'Tageslicht (60/60)',bright: 60,  dim: 60,  color: '#fff2c8' },
];

interface PresenceUser { _id: string; username: string; }

function colorFor(name: string): string {
    const palette = [
        "#9b2a1e", "#3d4a2a", "#3a4a6d", "#6d3a5a", "#5a3a2a",
        "#2a4a4a", "#6d5a2a", "#4a2a3a", "#2a5a3a", "#5a2a5a",
    ];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
}

function initials(name: string): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function timeHHMM(iso: string): string {
    try { return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
}

// Base view: eine gemeinsame "Welt-Koordinate pro Feld". Fuer 2d-image ist
// baseFieldPx die kalibrierte cellPx, fuer 2d-editor 32 (TILE_PX im Editor).
// Pan (x,y) und scale werden on-top gefahren und sind pro Kartentyp lokal.
interface ViewTransform {
    baseFieldPx: number; // Pixel pro Feld bei scale=1 (relativ zur Karte, 2d-image: abs. Pixel; 2d-editor: tilePx)
    baseOffsetX: number; // Verschiebung relativ zur Welt-(0,0) in Basispixeln
    baseOffsetY: number;
    scale: number;
    panX: number;
    panY: number;
}

function fieldToScreen(t: ViewTransform, fx: number, fy: number): { sx: number; sy: number } {
    const sx = t.panX + (t.baseOffsetX + fx * t.baseFieldPx) * t.scale;
    const sy = t.panY + (t.baseOffsetY + fy * t.baseFieldPx) * t.scale;
    return { sx, sy };
}
function screenToField(t: ViewTransform, sx: number, sy: number): { fx: number; fy: number } {
    const fx = ((sx - t.panX) / t.scale - t.baseOffsetX) / t.baseFieldPx;
    const fy = ((sy - t.panY) / t.scale - t.baseOffsetY) / t.baseFieldPx;
    return { fx, fy };
}

const GamePage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { userName } = useAuth();
    const myName = (userName as string) || localStorage.getItem("username") || "";

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [maps, setMaps] = useState<MapListItem[]>([]);
    const [activeMapFull, setActiveMapFull] = useState<MapFull | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [presence, setPresence] = useState<PresenceUser[]>([]);
    const [activeMapId, setActiveMapId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [joined, setJoined] = useState(false);
    const [myCharacters, setMyCharacters] = useState<CharacterDoc[]>([]);

    // Tokens pro (campaign, activeMap).
    const [tokens, setTokens] = useState<TokenInstance[]>([]);
    const [groups, setGroups] = useState<TokenGroup[]>([]);

    // Lighting (Nebel + Dunkelheit + Lichter).
    const [lighting, setLighting] = useState<MapLighting | null>(null);
    const [fogTool, setFogTool] = useState<null | 'brush-cover' | 'brush-reveal' | 'rect-cover' | 'rect-reveal' | 'poly-cover' | 'poly-reveal' | 'place-light'>(null);
    const [fogRadius, setFogRadius] = useState<number>(3); // in Feldern
    const [gmFogAlpha, setGmFogAlpha] = useState<number>(0.5);
    const [gmDarkAlpha, setGmDarkAlpha] = useState<number>(0.55);
    // Rect-Preview
    const rectStartRef = useRef<{ fx: number; fy: number } | null>(null);
    const [rectPreview, setRectPreview] = useState<null | { x: number; y: number; w: number; h: number }>(null);
    // Poly-Punkte
    const [polyPoints, setPolyPoints] = useState<Array<[number, number]>>([]);
    const [polyMouse, setPolyMouse] = useState<{ fx: number; fy: number } | null>(null);
    // Light-Preset fuer Platzieren
    const [lightPreset, setLightPreset] = useState<string>('fackel');
    // Fog-Brush-Stroke: Mausposition als letzte-verarbeitete Zelle, damit wir
    // bei flueckigem Drag kein Op-Sturm senden.
    const brushLastRef = useRef<{ fx: number; fy: number } | null>(null);

    const chatInputRef = useRef<HTMLInputElement | null>(null);
    const chatLogRef = useRef<HTMLDivElement | null>(null);

    // Meine User-Id. Wir lesen sie aus der ID im JWT via /api/auth oder schlicht
    // aus der presence (wir listen erst spaeter). Besser: aus /api/characters? Dort
    // sind Owner-IDs enthalten. Nehmen wir die erste Chars[0].owner — eigentlich
    // brauchen wir die User-ID. Der useAuth-Hook liefert sie nicht direkt; also
    // laden wir sie aus der Chars-Antwort (owner-Feld des eigenen Chars).
    const [myUserId, setMyUserId] = useState<string | null>(null);

    // Initiative + Inventar (Panels in der rechten Seitenleiste).
    const [initiative, setInitiative] = useState<Initiative | null>(null);
    const [myInventory, setMyInventory] = useState<InventoryDoc | null>(null);
    const [allInventories, setAllInventories] = useState<InventoryDoc[]>([]);
    const [rightTab, setRightTab] = useState<'chat' | 'initiative' | 'inventory'>('chat');

    // Initial-Load
    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        (async () => {
            try {
                const [cRes, mRes, chRes, chaRes, iniRes, invRes] = await Promise.all([
                    apiService.getCampaign(id),
                    apiService.listMaps(),
                    apiService.getChat(id),
                    apiService.listCharacters(),
                    apiService.getInitiative(id).catch(() => null),
                    apiService.getMyInventory(id).catch(() => null),
                ]);
                if (cancelled) return;
                setCampaign(cRes.campaign);
                setActiveMapId(cRes.campaign.activeMapId);
                setMaps(mRes.maps);
                setMessages(chRes.messages);
                setMyCharacters(chaRes.characters);
                if (chaRes.characters.length > 0) setMyUserId(String(chaRes.characters[0].owner));
                if (iniRes) setInitiative(iniRes.initiative);
                if (invRes) setMyInventory(invRes.inventory);
                // GM: alle Inventare in einem Rutsch.
                if (cRes.campaign.role === 'owner') {
                    apiService.getAllInventories(id).then((r) => {
                        if (!cancelled) setAllInventories(r.inventories);
                    }).catch(() => {});
                }
            } catch (e: any) {
                if (!cancelled) setLoadError(e?.msg || "Spielbrett konnte nicht geladen werden.");
            }
        })();
        return () => { cancelled = true; };
    }, [id]);

    // Socket join + event handler
    useEffect(() => {
        if (!id || !campaign) return;
        const socket = getSocket();
        if (!socket.connected) { try { socket.connect(); } catch {} }
        const join = () => {
            socket.emit("campaign:join", { campaignId: id }, (ack: any) => {
                if (ack?.ok) {
                    setJoined(true);
                    if (ack.presence) setPresence(ack.presence);
                    if (ack.activeMapId !== undefined) setActiveMapId(ack.activeMapId);
                }
            });
        };
        if (socket.connected) join();
        socket.on("connect", join);

        const onPresence = (p: { campaignId: string; users: PresenceUser[] }) => {
            if (p.campaignId === id) setPresence(p.users);
        };
        const onChat = (m: ChatMessage) => {
            if ((m as any).campaignId && (m as any).campaignId !== id) return;
            setMessages((prev) => [...prev, m]);
        };
        const onActive = (p: { campaignId: string; activeMapId: string | null }) => {
            if (p.campaignId === id) setActiveMapId(p.activeMapId);
        };
        const onMapUpdated = (p: { campaignId: string; mapId: string; map: MapFull }) => {
            if (p.campaignId !== id) return;
            setActiveMapFull((prev) => (prev && prev._id === p.mapId ? p.map : prev));
            setMaps((prev) => prev.map((m) => (m._id === p.mapId ? {
                _id: p.map._id, name: p.map.name, owner: p.map.owner as any,
                isExample: p.map.isExample, kind: p.map.kind, imageUrl: p.map.imageUrl,
                createdAt: p.map.createdAt, updatedAt: p.map.updatedAt,
                grid: p.map.grid,
            } : m)));
        };
        const onMapGrid = (p: { campaignId: string; mapId: string; grid: MapGrid | null }) => {
            if (p.campaignId !== id) return;
            setActiveMapFull((prev) => (prev && prev._id === p.mapId ? { ...prev, grid: p.grid || undefined } : prev));
            setMaps((prev) => prev.map((m) => (m._id === p.mapId ? { ...m, grid: p.grid || null } : m)));
        };
        const onCharSel = (p: { campaignId: string; userId: string; characterId: string | null }) => {
            if (p.campaignId !== id) return;
            // Kampagne frisch nachladen, damit hydratisiertes characters-Array
            // sicher den neu ausgewaehlten Char enthaelt.
            void apiService.getCampaign(id).then(({ campaign: c }) => {
                setCampaign(c);
            }).catch(() => {});
        };
        const onTokUpdate = (p: { campaignId: string; mapId: string; tokens: TokenInstance[]; groups: TokenGroup[] }) => {
            if (p.campaignId !== id) return;
            if (p.mapId !== activeMapId) return;
            setTokens(p.tokens);
            setGroups(p.groups);
        };
        const onLighting = (p: { campaignId: string; mapId: string; lighting: MapLighting }) => {
            if (p.campaignId !== id) return;
            if (p.mapId !== activeMapId) return;
            setLighting(p.lighting);
        };
        const onTokTick = (p: { campaignId: string; mapId: string; updates: Array<{ id: string; x: number; y: number }> }) => {
            if (p.campaignId !== id) return;
            if (p.mapId !== activeMapId) return;
            setTokens((prev) => prev.map((t) => {
                const u = p.updates.find((x) => x.id === t.id);
                return u ? { ...t, x: u.x, y: u.y } : t;
            }));
        };

        const onInitiative = (p: { campaignId: string; initiative: Initiative }) => {
            if (p.campaignId !== id) return;
            setInitiative(p.initiative);
        };
        const onInventory = (p: { campaignId: string; inventory: InventoryDoc }) => {
            if (p.campaignId !== id) return;
            // Mein eigenes Inventar aktualisieren:
            if (myUserId && p.inventory.userId === myUserId) {
                setMyInventory(p.inventory);
            }
            // Falls GM: Liste aller Inventare mitpflegen.
            setAllInventories((prev) => {
                const idx = prev.findIndex((x) => x.userId === p.inventory.userId);
                if (idx === -1) return [...prev, p.inventory];
                const next = prev.slice();
                next[idx] = { ...next[idx], ...p.inventory };
                return next;
            });
        };

        socket.on("campaign:presence", onPresence);
        socket.on("campaign:chat", onChat);
        socket.on("campaign:activeMap", onActive);
        socket.on("campaign:mapUpdated", onMapUpdated);
        socket.on("campaign:mapGrid", onMapGrid);
        socket.on("campaign:characterSelection", onCharSel);
        socket.on("campaign:tokens:update", onTokUpdate);
        socket.on("campaign:tokens:tick", onTokTick);
        socket.on("campaign:lighting:update", onLighting);
        socket.on("campaign:initiative:update", onInitiative);
        socket.on("campaign:inventory:update", onInventory);

        return () => {
            socket.off("connect", join);
            socket.off("campaign:presence", onPresence);
            socket.off("campaign:chat", onChat);
            socket.off("campaign:activeMap", onActive);
            socket.off("campaign:mapUpdated", onMapUpdated);
            socket.off("campaign:mapGrid", onMapGrid);
            socket.off("campaign:characterSelection", onCharSel);
            socket.off("campaign:tokens:update", onTokUpdate);
            socket.off("campaign:tokens:tick", onTokTick);
            socket.off("campaign:lighting:update", onLighting);
            socket.off("campaign:initiative:update", onInitiative);
            socket.off("campaign:inventory:update", onInventory);
            try { socket.emit("campaign:leave", { campaignId: id }); } catch {}
            setJoined(false);
        };
    }, [id, campaign, activeMapId, myUserId]);

    // Autoscroll chat
    useEffect(() => {
        const el = chatLogRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages]);

    // (Esc/Enter-Hotkeys werden weiter unten registriert, nachdem sendFogOps definiert ist.)


    const sendChat = useCallback(() => {
        const text = chatInputRef.current?.value?.trim();
        if (!text || !id) return;
        const socket = getSocket();
        socket.emit("campaign:chat", { campaignId: id, text }, (ack: any) => {
            if (ack?.ok && chatInputRef.current) chatInputRef.current.value = "";
        });
    }, [id]);

    const onChatKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
    };

    const activeMap: MapListItem | null = useMemo(() => {
        if (!activeMapId) return null;
        return maps.find((m) => m._id === activeMapId) || null;
    }, [activeMapId, maps]);

    const isOwner = campaign?.role === "owner";
    const ownerId = campaign?.owner;

    // activeMap volles Doc + Tokens + Lighting laden wenn ID wechselt
    useEffect(() => {
        if (!activeMapId || !id) {
            setActiveMapFull(null);
            setTokens([]);
            setGroups([]);
            setLighting(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { map } = await apiService.getMap(activeMapId);
                if (!cancelled) setActiveMapFull(map);
            } catch { if (!cancelled) setActiveMapFull(null); }
            try {
                const { tokens: ts, groups: gs } = await apiService.getMapTokens(id, activeMapId);
                if (!cancelled) { setTokens(ts || []); setGroups(gs || []); }
            } catch { if (!cancelled) { setTokens([]); setGroups([]); } }
            try {
                const { lighting: lt } = await apiService.getMapLighting(id, activeMapId);
                if (!cancelled) setLighting(lt);
            } catch { if (!cancelled) setLighting(null); }
        })();
        return () => { cancelled = true; };
    }, [activeMapId, id]);

    const handleSelectMap = (mid: string) => {
        if (!id) return;
        const socket = getSocket();
        const nextId = mid || null;
        socket.emit("campaign:setActiveMap", { campaignId: id, mapId: nextId }, (ack: any) => {
            if (!ack?.ok) void apiService.setActiveMap(id, nextId).catch(() => {});
        });
    };

    // --- Characters (fuer Picker + Palette) ---
    const myCurrentCharId: string | null = useMemo(() => {
        if (!campaign || !myUserId) return null;
        const sel = campaign.characterSelections.find((s) => s.userId === myUserId);
        return sel?.characterId || null;
    }, [campaign, myUserId]);

    // Index: userId -> character (aus hydratisiertem Array)
    const charByUser: Map<string, CharacterDoc> = useMemo(() => {
        const m = new Map<string, CharacterDoc>();
        if (!campaign) return m;
        for (const sel of campaign.characterSelections) {
            const c = campaign.characters.find((x) => String(x._id) === String(sel.characterId));
            if (c) m.set(sel.userId, c);
        }
        return m;
    }, [campaign]);

    const setMyChar = async (charId: string | null) => {
        if (!id) return;
        try {
            const { campaign: upd } = await apiService.setMyCharacter(id, charId);
            setCampaign(upd);
        } catch (e: any) {
            alert(e?.msg || "Charakter-Auswahl fehlgeschlagen.");
        }
    };

    // --- View-Transform fuer Token-Overlay und Karte ---
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const dragRef = useRef<{ x: number; y: number } | null>(null);
    const centreRef = useRef<HTMLDivElement | null>(null);

    // 2d-editor Canvas + Transform
    const [editorMapCache, setEditorMapCache] = useState<Map<string, MapFull>>(new Map());
    const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const editorWrapRef = useRef<HTMLDivElement | null>(null);
    const editorTransformRef = useRef<Transform>({ x: 0, y: 0, scale: 1, tilePx: 32 });
    const editorPanRef = useRef<{ x: number; y: number } | null>(null);
    const [editorTick, setEditorTick] = useState(0); // force re-render overlay

    // Image-ref fuer 2d-image Pan/Zoom
    const imageWrapRef = useRef<HTMLDivElement | null>(null);
    const imageSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

    // Reset zoom bei Kartenwechsel
    useEffect(() => { setTransform({ x: 0, y: 0, scale: 1 }); }, [activeMapId]);

    useEffect(() => {
        if (!activeMapFull) return;
        if (activeMapFull.kind !== "2d-editor") return;
        setEditorMapCache((prev) => {
            const next = new Map(prev);
            next.set(activeMapFull._id, activeMapFull);
            return next;
        });
    }, [activeMapFull]);

    const activeEditorDoc: EditorDoc | null = useMemo(() => {
        if (!activeMap || activeMap.kind !== "2d-editor") return null;
        const full = editorMapCache.get(activeMap._id) || (activeMapFull && activeMapFull._id === activeMap._id ? activeMapFull : null);
        if (!full || !full.doc) return null;
        return normalizeDoc(full.doc);
    }, [activeMap, editorMapCache, activeMapFull]);

    // Zentriert die Karte beim ersten Draw.
    const editorCenteredRef = useRef<string | null>(null);
    useEffect(() => {
        if (!activeEditorDoc) { editorCenteredRef.current = null; return; }
        const wrap = editorWrapRef.current;
        if (!wrap) return;
        if (editorCenteredRef.current === activeMap?._id) return;
        const w = wrap.clientWidth, h = wrap.clientHeight;
        const tile = 24;
        const maxScale = Math.min(w / (activeEditorDoc.width * tile), h / (activeEditorDoc.height * tile));
        const scale = Math.max(0.2, Math.min(1.5, maxScale * 0.95));
        editorTransformRef.current = {
            tilePx: tile, scale,
            x: (w - activeEditorDoc.width * tile * scale) / 2,
            y: (h - activeEditorDoc.height * tile * scale) / 2,
        };
        editorCenteredRef.current = activeMap?._id || null;
        setEditorTick((n) => n + 1);
    }, [activeEditorDoc, activeMap?._id]);

    // Redraw bei Doc-Aenderung / Groesse
    const editorRedraw = useCallback(() => {
        if (!activeEditorDoc) return;
        const cv = editorCanvasRef.current;
        if (!cv) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderMap(ctx, activeEditorDoc, editorTransformRef.current, { showGrid: true });
    }, [activeEditorDoc]);

    useEffect(() => {
        if (!activeEditorDoc) return;
        const cv = editorCanvasRef.current;
        const wrap = editorWrapRef.current;
        if (!cv || !wrap) return;
        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const w = wrap.clientWidth, h = wrap.clientHeight;
            cv.width = Math.max(100, Math.floor(w * dpr));
            cv.height = Math.max(100, Math.floor(h * dpr));
            cv.style.width = w + "px";
            cv.style.height = h + "px";
            const ctx = cv.getContext("2d");
            if (!ctx) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            renderMap(ctx, activeEditorDoc, editorTransformRef.current, { showGrid: true });
        };
        draw();
        const obs = new ResizeObserver(() => { draw(); setEditorTick((n) => n + 1); });
        obs.observe(wrap);
        return () => obs.disconnect();
    }, [activeEditorDoc, editorTick]);

    const onEditorPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        editorPanRef.current = { x: e.clientX - editorTransformRef.current.x, y: e.clientY - editorTransformRef.current.y };
    };
    const onEditorPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!editorPanRef.current) return;
        editorTransformRef.current = {
            ...editorTransformRef.current,
            x: e.clientX - editorPanRef.current.x,
            y: e.clientY - editorPanRef.current.y,
        };
        editorRedraw();
        setEditorTick((n) => n + 1);
    };
    const onEditorPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {}
        editorPanRef.current = null;
    };
    const onEditorWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const cv = editorCanvasRef.current;
        if (!cv) return;
        const rect = cv.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const prev = editorTransformRef.current;
        const nextScale = Math.max(0.2, Math.min(4, prev.scale * factor));
        const wx = (cx - prev.x) / (prev.tilePx * prev.scale);
        const wy = (cy - prev.y) / (prev.tilePx * prev.scale);
        editorTransformRef.current = {
            tilePx: prev.tilePx, scale: nextScale,
            x: cx - wx * prev.tilePx * nextScale,
            y: cy - wy * prev.tilePx * nextScale,
        };
        editorRedraw();
        setEditorTick((n) => n + 1);
    };

    const onMouseDown = (e: React.MouseEvent) => {
        dragRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    };
    const onMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current) return;
        setTransform((prev) => ({ ...prev, x: e.clientX - dragRef.current!.x, y: e.clientY - dragRef.current!.y }));
    };
    const onMouseUp = () => { dragRef.current = null; };
    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? -1 : 1;
        setTransform((prev) => ({ ...prev, scale: Math.max(0.1, Math.min(6, prev.scale * (dir > 0 ? 1.1 : 0.9))) }));
    };
    const bumpZoom = (dir: number) => {
        setTransform((prev) => ({ ...prev, scale: Math.max(0.1, Math.min(6, prev.scale * (dir > 0 ? 1.2 : 0.8))) }));
    };
    const resetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

    // --- Image size (fuer Grid-Overlay-Default) ---
    const onImageLoad = (ev: React.SyntheticEvent<HTMLImageElement>) => {
        imageSizeRef.current = { w: ev.currentTarget.naturalWidth, h: ev.currentTarget.naturalHeight };
    };

    // --- View-Transform fuer Tokens (gilt pro Kartentyp) ---
    const viewTransform: ViewTransform | null = useMemo(() => {
        if (!activeMap) return null;
        if (activeMap.kind === "2d-image") {
            const grid = (activeMapFull?.grid || activeMap.grid || null) as MapGrid | null;
            if (!grid || !grid.cellPx) {
                // Schaetzwert: Bildbreite / 30 (nur wenn Image geladen)
                const guess = imageSizeRef.current.w > 0 ? imageSizeRef.current.w / 30 : 64;
                // Pan+scale sind auf den IMG mit center-origin. Im Overlay rechnen wir
                // relativ zum IMG-Center. offset = -imgW/2, -imgH/2.
                const imgW = imageSizeRef.current.w || 0;
                const imgH = imageSizeRef.current.h || 0;
                const wrap = imageWrapRef.current;
                const cx = wrap ? wrap.clientWidth / 2 : 0;
                const cy = wrap ? wrap.clientHeight / 2 : 0;
                return {
                    baseFieldPx: guess,
                    baseOffsetX: -imgW / 2,
                    baseOffsetY: -imgH / 2,
                    scale: transform.scale,
                    panX: cx + transform.x,
                    panY: cy + transform.y,
                };
            }
            const imgW = imageSizeRef.current.w || 0;
            const imgH = imageSizeRef.current.h || 0;
            const wrap = imageWrapRef.current;
            const cx = wrap ? wrap.clientWidth / 2 : 0;
            const cy = wrap ? wrap.clientHeight / 2 : 0;
            return {
                baseFieldPx: grid.cellPx,
                baseOffsetX: -imgW / 2 + (grid.offsetX || 0),
                baseOffsetY: -imgH / 2 + (grid.offsetY || 0),
                scale: transform.scale,
                panX: cx + transform.x,
                panY: cy + transform.y,
            };
        }
        if (activeMap.kind === "2d-editor") {
            const t = editorTransformRef.current;
            return {
                baseFieldPx: t.tilePx,
                baseOffsetX: 0, baseOffsetY: 0,
                scale: t.scale,
                panX: t.x, panY: t.y,
            };
        }
        return null;
        // editorTick triggert Memo-Refresh wenn Editor-Transform sich aendert
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeMap, activeMapFull, transform, editorTick]);

    // Welt-Dimensionen in Feldern. Fuer 2d-editor direkt aus dem Doc; fuer
    // 2d-image aus Bildgroesse/cellPx (nur wenn kalibriert).
    const worldDims: { w: number; h: number } | null = useMemo(() => {
        if (!activeMap) return null;
        if (activeMap.kind === '2d-editor' && activeEditorDoc) {
            return { w: activeEditorDoc.width, h: activeEditorDoc.height };
        }
        if (activeMap.kind === '2d-image') {
            const grid = (activeMapFull?.grid || activeMap.grid || null) as MapGrid | null;
            const imgW = imageSizeRef.current.w || 0;
            const imgH = imageSizeRef.current.h || 0;
            if (grid?.cellPx && grid.cellPx > 0 && imgW > 0 && imgH > 0) {
                return {
                    w: Math.max(1, Math.round(imgW / grid.cellPx)),
                    h: Math.max(1, Math.round(imgH / grid.cellPx)),
                };
            }
            // Schaetzwert bei nicht kalibrierter Karte: 30 Felder breit.
            if (imgW > 0 && imgH > 0) {
                return { w: 30, h: Math.max(1, Math.round((imgH / imgW) * 30)) };
            }
        }
        return null;
    }, [activeMap, activeEditorDoc, activeMapFull, editorTick]);

    // GM ensureFog, sobald wir Welt-Dim kennen und noch keine Fog-Dim gesetzt ist
    // (oder gewachsen/geschrumpft sind).
    useEffect(() => {
        if (!isOwner || !id || !activeMapId || !lighting || !worldDims) return;
        if (lighting.fogW === worldDims.w && lighting.fogH === worldDims.h) return;
        const socket = getSocket();
        socket.emit('campaign:lighting:ensureFog', {
            campaignId: id, mapId: activeMapId, w: worldDims.w, h: worldDims.h,
        });
    }, [isOwner, id, activeMapId, lighting, worldDims]);

    // --- Grid-Overlay (nur 2d-image) ---
    const effectiveGrid: MapGrid | null = useMemo(() => {
        if (!activeMap || activeMap.kind !== "2d-image") return null;
        return (activeMapFull?.grid || activeMap.grid || null) as MapGrid | null;
    }, [activeMap, activeMapFull]);

    const [showGridSettings, setShowGridSettings] = useState(false);
    const [calibrateMode, setCalibrateMode] = useState<null | "two-point" | "n-fields">(null);
    const calibrationStart = useRef<{ x: number; y: number } | null>(null);

    const persistGrid = async (g: MapGrid) => {
        if (!activeMap) return;
        try {
            await apiService.setMapGrid(activeMap._id, g);
            // Live-Update kommt per socket zurueck (campaign:mapGrid).
        } catch (e: any) {
            alert(e?.msg || "Grid speichern fehlgeschlagen.");
        }
    };

    const defaultGrid = (): MapGrid => {
        const w = imageSizeRef.current.w || 1800;
        return { cellPx: Math.round(w / 30), offsetX: 0, offsetY: 0, show: true, color: "#000000", opacity: 0.4 };
    };

    // --- Token Drag-Logik ---
    const dragTokenRef = useRef<{
        pointerId: number;
        startField: { fx: number; fy: number };
        tokenIds: string[]; // alle Tokens die mit mir mitziehen (Gruppe)
        originals: Map<string, { x: number; y: number }>;
    } | null>(null);
    const [draggingIds, setDraggingIds] = useState<string[]>([]);

    const canMoveToken = (t: TokenInstance): boolean => {
        if (!myUserId) return false;
        if (isOwner) return true;
        if (t.locked) return false;
        if (t.groupId) {
            const g = groups.find((x) => x.id === t.groupId);
            if (g && g.locked) return false;
        }
        if (String(t.ownerUserId || "") === String(myUserId)) return true;
        if (t.groupId) {
            return tokens.some((x) => x.groupId === t.groupId && String(x.ownerUserId || "") === String(myUserId));
        }
        return false;
    };

    const tokenGroupIds = (t: TokenInstance): string[] => {
        if (!t.groupId) return [t.id];
        return tokens.filter((x) => x.groupId === t.groupId).map((x) => x.id);
    };

    // Globale Drag-Listener: sobald wir auf einem Token mousedown bekommen,
    // installieren wir window-level mousemove/mouseup — so verlieren wir den
    // Drag auch dann nicht, wenn die Maus das Token verlaesst. Playwright-
    // Freundlich (dispatcht via document).
    const tokensRef = useRef<TokenInstance[]>([]);
    tokensRef.current = tokens;
    const viewTransformRef = useRef<ViewTransform | null>(null);
    viewTransformRef.current = viewTransform;
    const throttleRef = useRef<number>(0);

    const startTokenDrag = (e: React.PointerEvent | React.MouseEvent, t: TokenInstance) => {
        if (!viewTransformRef.current) return;
        if (!canMoveToken(t)) return;
        e.stopPropagation();
        // NICHT preventDefault() — das wuerde Follow-up mouse/move-Events unterdruecken (Chromium).
        const { fx, fy } = screenToField(viewTransformRef.current, (e as any).clientX, (e as any).clientY);
        const ids = tokenGroupIds(t);
        const originals = new Map<string, { x: number; y: number }>();
        for (const id of ids) {
            const ot = tokensRef.current.find((x) => x.id === id);
            if (ot) originals.set(id, { x: ot.x, y: ot.y });
        }
        dragTokenRef.current = {
            pointerId: (e as any).pointerId || 0,
            startField: { fx, fy }, tokenIds: ids, originals,
        };
        setDraggingIds(ids);

        const onMove = (ev: MouseEvent) => {
            const st = dragTokenRef.current;
            if (!st || !viewTransformRef.current || !id || !activeMapId) return;
            const { fx: cx, fy: cy } = screenToField(viewTransformRef.current, ev.clientX, ev.clientY);
            const dx = cx - st.startField.fx;
            const dy = cy - st.startField.fy;
            const snap = !ev.altKey;
            const updates: Array<{ id: string; x: number; y: number }> = [];
            setTokens((prev) => prev.map((tok) => {
                if (!st.tokenIds.includes(tok.id)) return tok;
                const o = st.originals.get(tok.id)!;
                let nx = o.x + dx, ny = o.y + dy;
                if (snap) { nx = Math.round(nx * 2) / 2; ny = Math.round(ny * 2) / 2; }
                updates.push({ id: tok.id, x: nx, y: ny });
                return { ...tok, x: nx, y: ny };
            }));
            const now = performance.now();
            if (now - throttleRef.current > 66) {
                throttleRef.current = now;
                const socket = getSocket();
                socket.emit("campaign:tokens:move", { campaignId: id, mapId: activeMapId, updates });
            }
        };        const onUp = () => {
            const st = dragTokenRef.current;
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("mouseup", onUp, true);
            if (!st || !id || !activeMapId) { dragTokenRef.current = null; setDraggingIds([]); return; }
            const updates: Array<{ id: string; x: number; y: number }> = [];
            for (const tid of st.tokenIds) {
                const cur = tokensRef.current.find((x) => x.id === tid);
                if (cur) updates.push({ id: tid, x: cur.x, y: cur.y });
            }
            const socket = getSocket();
            socket.emit("campaign:tokens:drop", { campaignId: id, mapId: activeMapId, updates }, () => {});
            dragTokenRef.current = null;
            setDraggingIds([]);
        };
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
    };

    // nicht mehr gebraucht — Drag haengt am window.
    const continueTokenDrag = (_e: React.PointerEvent) => {};
    const endTokenDrag = (_e: React.PointerEvent) => {};

    // --- GM: Token zur Karte hinzufuegen (per Klick auf einen Char in der Sidebar) ---
    const addTokenAtCentre = (char: CharacterDoc | null, label?: string) => {
        if (!id || !activeMapId || !viewTransform) return;
        // Setze Token in die Bildschirm-Mitte der aktuellen View.
        const wrap = activeMap?.kind === "2d-editor" ? editorWrapRef.current : imageWrapRef.current;
        const cx = wrap ? wrap.clientWidth / 2 : 0;
        const cy = wrap ? wrap.clientHeight / 2 : 0;
        const { fx, fy } = screenToField(viewTransform, cx, cy);
        const token = char
            ? {
                  id: `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                  characterId: char._id,
                  ownerUserId: char.owner,
                  x: Math.round(fx), y: Math.round(fy), size: 1,
                  color: "#9b2a1e", label: "", locked: false, groupId: null,
              }
            : {
                  id: `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                  characterId: null, ownerUserId: null,
                  x: Math.round(fx), y: Math.round(fy), size: 1,
                  color: "#c2a053", label: label || "GM", locked: false, groupId: null,
              };
        const socket = getSocket();
        socket.emit("campaign:tokens:add", { campaignId: id, mapId: activeMapId, token }, (_ack: any) => {});
    };

    const removeToken = (t: TokenInstance) => {
        if (!id || !activeMapId || !isOwner) return;
        const socket = getSocket();
        socket.emit("campaign:tokens:remove", { campaignId: id, mapId: activeMapId, tokenId: t.id }, (_ack: any) => {});
    };

    const resizeToken = (t: TokenInstance, size: number) => {
        if (!id || !activeMapId || !isOwner) return;
        const socket = getSocket();
        socket.emit("campaign:tokens:resize", { campaignId: id, mapId: activeMapId, tokenId: t.id, size }, (_ack: any) => {});
    };

    const toggleLock = (t: TokenInstance) => {
        if (!id || !activeMapId || !isOwner) return;
        const socket = getSocket();
        socket.emit("campaign:tokens:lock", { campaignId: id, mapId: activeMapId, tokenId: t.id, locked: !t.locked }, (_ack: any) => {});
    };

    // --- Selektion fuer GM-Gruppierung ---
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const toggleSelect = (tid: string, shift: boolean) => {
        setSelection((prev) => {
            const next = new Set(prev);
            if (shift) {
                if (next.has(tid)) next.delete(tid); else next.add(tid);
            } else {
                next.clear(); next.add(tid);
            }
            return next;
        });
    };
    const clearSelection = () => setSelection(new Set());
    const groupSelection = () => {
        if (!id || !activeMapId || !isOwner || selection.size < 2) return;
        const name = window.prompt("Name der Gruppe?", "Trupp") || "";
        const socket = getSocket();
        socket.emit("campaign:tokens:group", {
            campaignId: id, mapId: activeMapId, name, tokenIds: Array.from(selection),
        }, () => clearSelection());
    };
    const ungroup = (groupId: string) => {
        if (!id || !activeMapId || !isOwner) return;
        const socket = getSocket();
        socket.emit("campaign:tokens:ungroup", { campaignId: id, mapId: activeMapId, groupId }, () => {});
    };

    // --- Fog-/Light-Werkzeuge ---

    const sendFogOps = useCallback((ops: Array<Record<string, any>>) => {
        if (!id || !activeMapId) return;
        const socket = getSocket();
        socket.emit('campaign:lighting:fog', { campaignId: id, mapId: activeMapId, ops }, () => {});
    }, [id, activeMapId]);

    // Esc beendet Fog-Tools / Poly; Enter commitet Poly.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setFogTool(null);
                setPolyPoints([]);
                setPolyMouse(null);
                setRectPreview(null);
            } else if (e.key === 'Enter' && (fogTool === 'poly-cover' || fogTool === 'poly-reveal') && polyPoints.length >= 3) {
                sendFogOps([{
                    kind: fogTool === 'poly-cover' ? 'cover' : 'reveal',
                    shape: 'poly', points: polyPoints,
                }]);
                setPolyPoints([]);
                setPolyMouse(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [fogTool, polyPoints, sendFogOps]);

    const setDarknessOnServer = (on: boolean) => {
        if (!id || !activeMapId || !isOwner) return;
        const socket = getSocket();
        socket.emit('campaign:lighting:darkness', { campaignId: id, mapId: activeMapId, on }, () => {});
    };

    // Spieler-Deckkraft fuer Dunkelheit + Nebel. Server persistiert + broadcastet.
    // Wir machen eine simple Throttle-via-Timeout, damit Slider-Dragging keinen
    // Event-Sturm erzeugt (mind. 80 ms Abstand zwischen Emits reichen).
    const darkOpaDebounce = useRef<number | null>(null);
    const fogOpaDebounce = useRef<number | null>(null);
    const sendPlayerDarknessOpacity = (v: number) => {
        if (!id || !activeMapId || !isOwner) return;
        if (darkOpaDebounce.current) window.clearTimeout(darkOpaDebounce.current);
        darkOpaDebounce.current = window.setTimeout(() => {
            const socket = getSocket();
            socket.emit('campaign:lighting:setDarknessOpacity', {
                campaignId: id, mapId: activeMapId, opacity: v,
            }, () => {});
        }, 80);
    };
    const sendPlayerFogOpacity = (v: number) => {
        if (!id || !activeMapId || !isOwner) return;
        if (fogOpaDebounce.current) window.clearTimeout(fogOpaDebounce.current);
        fogOpaDebounce.current = window.setTimeout(() => {
            const socket = getSocket();
            socket.emit('campaign:lighting:setFogOpacity', {
                campaignId: id, mapId: activeMapId, opacity: v,
            }, () => {});
        }, 80);
    };
    // Lokal gehaltener Slider-Stand (fuer flueckiges UI) — spiegelt den Server-
    // Wert, bis GM dran zieht. Server-Push via onLighting ueberschreibt wieder.
    const [localDarkOpa, setLocalDarkOpa] = useState<number | null>(null);
    const [localFogOpa, setLocalFogOpa] = useState<number | null>(null);
    useEffect(() => { setLocalDarkOpa(null); }, [activeMapId]);
    useEffect(() => { setLocalFogOpa(null); }, [activeMapId]);

    const effectiveDarkOpa = localDarkOpa !== null ? localDarkOpa
        : (typeof lighting?.darknessOpacity === 'number' ? lighting.darknessOpacity : 1);
    const effectiveFogOpa = localFogOpa !== null ? localFogOpa
        : (typeof lighting?.fogOpacity === 'number' ? lighting.fogOpacity : 1);

    const coverAll = () => sendFogOps([{ kind: 'all', covered: true }]);
    const revealAll = () => sendFogOps([{ kind: 'all', covered: false }]);

    const addStaticLight = (fx: number, fy: number) => {
        if (!id || !activeMapId || !isOwner) return;
        const preset = LIGHT_PRESETS.find((p) => p.key === lightPreset) || LIGHT_PRESETS[1];
        const light: Partial<LightSource> = {
            kind: 'static', x: fx, y: fy,
            bright: preset.bright, dim: preset.dim, color: preset.color,
            label: preset.name, enabled: true,
        };
        const socket = getSocket();
        socket.emit('campaign:lighting:light:add', {
            campaignId: id, mapId: activeMapId, light,
        }, () => {});
    };

    const toggleLight = (l: LightSource) => {
        if (!id || !activeMapId) return;
        const socket = getSocket();
        socket.emit('campaign:lighting:light:update', {
            campaignId: id, mapId: activeMapId, lightId: l.id, patch: { enabled: !l.enabled },
        }, () => {});
    };
    const removeLight = (l: LightSource) => {
        if (!id || !activeMapId) return;
        const socket = getSocket();
        socket.emit('campaign:lighting:light:remove', {
            campaignId: id, mapId: activeMapId, lightId: l.id,
        }, () => {});
    };
    // Toggle fuer Spieler: Licht am eigenen aktuellen Char-Token.
    const myTokenOnMap: TokenInstance | null = useMemo(() => {
        if (!myUserId) return null;
        // eigener Token auf der aktiven Karte (characterId=myCurrentCharId oder ownerUserId=myUserId)
        return tokens.find((t) =>
            String(t.ownerUserId || '') === String(myUserId) &&
            (!myCurrentCharId || String(t.characterId || '') === String(myCurrentCharId))
        ) || null;
    }, [tokens, myUserId, myCurrentCharId]);

    const myTokenLight: LightSource | null = useMemo(() => {
        if (!myTokenOnMap || !lighting) return null;
        return lighting.lights.find((l) => l.kind === 'token' && l.tokenId === myTokenOnMap.id) || null;
    }, [myTokenOnMap, lighting]);

    const togglePlayerTorch = () => {
        if (!id || !activeMapId || !myTokenOnMap) return;
        const socket = getSocket();
        if (myTokenLight) {
            socket.emit('campaign:lighting:light:update', {
                campaignId: id, mapId: activeMapId, lightId: myTokenLight.id,
                patch: { enabled: !myTokenLight.enabled },
            }, () => {});
        } else {
            const preset = LIGHT_PRESETS.find((p) => p.key === 'fackel')!;
            socket.emit('campaign:lighting:light:add', {
                campaignId: id, mapId: activeMapId,
                light: {
                    kind: 'token', tokenId: myTokenOnMap.id,
                    bright: preset.bright, dim: preset.dim, color: preset.color,
                    label: 'Fackel', enabled: true,
                },
            }, () => {});
        }
    };

    // Fog-Tool-Interaktions-Handler (werden inline im JSX unten eingehangen).
    // Keine innere Komponente -> React mountet den Layer nicht bei jedem Re-Render neu.
    //
    // WICHTIG: viewTransform.panX/Y sind in wrap-lokalen Pixeln. Die Event-
    // Koordinaten (clientX/Y) sind aber viewport-absolut. Wir muessen also
    // mit getBoundingClientRect() auf wrap-lokal normalisieren.
    const fogLayerRef = useRef<HTMLDivElement | null>(null);
    const toFieldCoords = useCallback((ev: { clientX: number; clientY: number }) => {
        if (!viewTransformRef.current) return { fx: 0, fy: 0 };
        const el = fogLayerRef.current;
        if (!el) return screenToField(viewTransformRef.current, ev.clientX, ev.clientY);
        const r = el.getBoundingClientRect();
        return screenToField(viewTransformRef.current, ev.clientX - r.left, ev.clientY - r.top);
    }, []);
    const fogToolRef = useRef(fogTool);
    fogToolRef.current = fogTool;
    const fogRadiusRef = useRef(fogRadius);
    fogRadiusRef.current = fogRadius;

    const onFogDown = useCallback((ev: React.MouseEvent) => {
        if (ev.button !== 0) return;
        const tool = fogToolRef.current;
        if (!tool || !viewTransformRef.current) return;
        const { fx, fy } = toFieldCoords(ev);
        if (tool === 'brush-cover' || tool === 'brush-reveal') {
            brushLastRef.current = { fx, fy };
            sendFogOps([{ kind: tool === 'brush-cover' ? 'cover' : 'reveal', shape: 'circle', x: fx, y: fy, r: fogRadiusRef.current }]);
            const onMove = (e: MouseEvent) => {
                const { fx: cx, fy: cy } = toFieldCoords(e);
                const last = brushLastRef.current;
                if (!last) return;
                const d = Math.hypot(cx - last.fx, cy - last.fy);
                if (d >= fogRadiusRef.current * 0.5) {
                    brushLastRef.current = { fx: cx, fy: cy };
                    sendFogOps([{ kind: fogToolRef.current === 'brush-cover' ? 'cover' : 'reveal', shape: 'circle', x: cx, y: cy, r: fogRadiusRef.current }]);
                }
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup', onUp, true);
                brushLastRef.current = null;
            };
            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup', onUp, true);
            return;
        }
        if (tool === 'rect-cover' || tool === 'rect-reveal') {
            rectStartRef.current = { fx, fy };
            setRectPreview({ x: fx, y: fy, w: 0, h: 0 });
            const onMove = (e: MouseEvent) => {
                const { fx: cx, fy: cy } = toFieldCoords(e);
                const s = rectStartRef.current!;
                setRectPreview({
                    x: Math.min(s.fx, cx), y: Math.min(s.fy, cy),
                    w: Math.abs(cx - s.fx), h: Math.abs(cy - s.fy),
                });
            };
            const onUp = (e: MouseEvent) => {
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup', onUp, true);
                const { fx: cx, fy: cy } = toFieldCoords(e);
                const s = rectStartRef.current;
                rectStartRef.current = null;
                setRectPreview(null);
                if (!s) return;
                const rect = {
                    x: Math.min(s.fx, cx), y: Math.min(s.fy, cy),
                    w: Math.abs(cx - s.fx), h: Math.abs(cy - s.fy),
                };
                if (rect.w > 0.1 && rect.h > 0.1) {
                    sendFogOps([{
                        kind: fogToolRef.current === 'rect-cover' ? 'cover' : 'reveal',
                        shape: 'rect', ...rect,
                    }]);
                }
            };
            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup', onUp, true);
            return;
        }
        if (tool === 'place-light') {
            addStaticLight(fx, fy);
            setFogTool(null);
            return;
        }
    }, [toFieldCoords, sendFogOps, addStaticLight]); // eslint-disable-line react-hooks/exhaustive-deps

    const onFogClick = useCallback((ev: React.MouseEvent) => {
        const tool = fogToolRef.current;
        if (tool === 'poly-cover' || tool === 'poly-reveal') {
            const { fx, fy } = toFieldCoords(ev);
            setPolyPoints((p) => [...p, [fx, fy]]);
        }
    }, [toFieldCoords]);
    const onFogMove = useCallback((ev: React.MouseEvent) => {
        const tool = fogToolRef.current;
        if (tool === 'poly-cover' || tool === 'poly-reveal') {
            setPolyMouse(toFieldCoords(ev));
        }
    }, [toFieldCoords]);
    const onFogDouble = useCallback(() => {
        const tool = fogToolRef.current;
        if ((tool === 'poly-cover' || tool === 'poly-reveal') && polyPoints.length >= 3) {
            sendFogOps([{
                kind: tool === 'poly-cover' ? 'cover' : 'reveal',
                shape: 'poly', points: polyPoints,
            }]);
            setPolyPoints([]);
            setPolyMouse(null);
        }
    }, [polyPoints, sendFogOps]);

    // JSX-Fragment, das wir in beide Karten-Branches einhaengen.
    const brushRadiusPx = (fogTool === 'brush-cover' || fogTool === 'brush-reveal') && viewTransform
        ? fogRadius * viewTransform.baseFieldPx * viewTransform.scale : 0;

    const fogToolOverlay = (isOwner && fogTool && viewTransform) ? (
        <div
            ref={fogLayerRef}
            className="fog-tool-layer"
            style={{ position: 'absolute', inset: 0, zIndex: 6, cursor: 'crosshair' }}
            onMouseDown={onFogDown}
            onClick={onFogClick}
            onMouseMove={onFogMove}
            onDoubleClick={onFogDouble}
        >
            <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="100%" height="100%">
                {rectPreview && (() => {
                    const a = fieldToScreen(viewTransform, rectPreview.x, rectPreview.y);
                    const b = fieldToScreen(viewTransform, rectPreview.x + rectPreview.w, rectPreview.y + rectPreview.h);
                    return <rect x={a.sx} y={a.sy} width={b.sx - a.sx} height={b.sy - a.sy}
                        fill={fogTool === 'rect-cover' ? 'rgba(0,0,0,0.4)' : 'rgba(230,197,106,0.3)'}
                        stroke="#e6c56a" strokeDasharray="4,3" />;
                })()}
                {(fogTool === 'poly-cover' || fogTool === 'poly-reveal') && polyPoints.length > 0 && (() => {
                    const pts = polyPoints
                        .map(([px, py]) => fieldToScreen(viewTransform, px, py))
                        .map((p) => `${p.sx},${p.sy}`).join(' ');
                    const live = polyMouse
                        ? ` ${fieldToScreen(viewTransform, polyMouse.fx, polyMouse.fy).sx},${fieldToScreen(viewTransform, polyMouse.fx, polyMouse.fy).sy}`
                        : '';
                    return <polyline points={pts + live} fill="rgba(230,197,106,0.12)" stroke="#e6c56a" strokeWidth={2} strokeDasharray="5,4" />;
                })()}
            </svg>
            {brushRadiusPx > 0 && <BrushCursor radiusPx={brushRadiusPx} cover={fogTool === 'brush-cover'} />}
        </div>
    ) : null;

    if (loadError) {
        return (
            <div className="game-root" style={{ gridTemplateColumns: "1fr", gridTemplateAreas: '"centre"' }}>
                <div className="game-centre">
                    <div className="game-no-map">
                        <h2>Zugriff verweigert</h2>
                        <p>{loadError}</p>
                        <p><Link to="/kampagnen" style={{ color: "#e6c56a" }}>&laquo; Zurück zu den Kampagnen</Link></p>
                    </div>
                </div>
            </div>
        );
    }

    if (!campaign) {
        return (
            <div className="game-root" style={{ gridTemplateColumns: "1fr", gridTemplateAreas: '"centre"' }}>
                <div className="game-centre">
                    <div className="game-no-map">Lade Spielbrett &hellip;</div>
                </div>
            </div>
        );
    }

    // --- Spieler-Token-Palette fuer GM (characters that are selected per player + owner) ---
    const playerTokensToDrag = isOwner
        ? Array.from(charByUser.entries())
              .filter(([uid]) => uid !== String(ownerId)) // Owner steht separat
              .map(([uid, c]) => ({ userId: uid, character: c }))
        : [];

    return (
        <div className="game-root">
            <aside className="game-left">
                <h3>Meine Figur</h3>
                <div className="my-char-picker">
                    <select
                        value={myCurrentCharId || ""}
                        onChange={(e) => void setMyChar(e.target.value || null)}
                    >
                        <option value="">&mdash; keine &mdash;</option>
                        {myCharacters.map((c) => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                        ))}
                    </select>
                    <Link to="/charaktere" className="muted-link">Verwalten</Link>
                </div>

                {/* Spieler-Fackel-Button (nur wenn Nicht-GM UND eigener Token auf Karte) */}
                {!isOwner && myTokenOnMap && (
                    <button
                        className={`btn-rust player-torch${myTokenLight?.enabled ? ' active' : ''}`}
                        style={{ marginTop: 10, width: '100%' }}
                        onClick={togglePlayerTorch}
                        title={myTokenLight?.enabled ? 'Fackel löschen' : 'Fackel entzünden'}
                    >
                        {myTokenLight?.enabled ? '🔥 Fackel aus' : '🕯 Fackel an'}
                    </button>
                )}

                {isOwner && activeMapId && (
                    <div className="lighting-panel">
                        <h3>Nebel</h3>
                        {!worldDims && (
                            <div className="ph-card" style={{ fontSize: 12 }}>
                                {activeMap?.kind === '2d-image'
                                    ? 'Erst Raster kalibrieren (Button »Raster« unten), dann wirkt der Nebel.'
                                    : 'Karte lädt &hellip;'}
                            </div>
                        )}
                        {worldDims && (
                            <>
                                <div className="tool-row">
                                    <button data-tool="brush-cover" className={`btn-tool${fogTool === 'brush-cover' ? ' active' : ''}`} onClick={() => setFogTool(fogTool === 'brush-cover' ? null : 'brush-cover')} title="Abdecken (Pinsel)">🖌 Decken</button>
                                    <button data-tool="brush-reveal" className={`btn-tool${fogTool === 'brush-reveal' ? ' active' : ''}`} onClick={() => setFogTool(fogTool === 'brush-reveal' ? null : 'brush-reveal')} title="Aufdecken (Pinsel)">🪄 Zeigen</button>
                                </div>
                                <div className="tool-row">
                                    <button data-tool="rect-cover" className={`btn-tool${fogTool === 'rect-cover' ? ' active' : ''}`} onClick={() => setFogTool(fogTool === 'rect-cover' ? null : 'rect-cover')} title="Rechteck abdecken">▭ Decken</button>
                                    <button data-tool="rect-reveal" className={`btn-tool${fogTool === 'rect-reveal' ? ' active' : ''}`} onClick={() => setFogTool(fogTool === 'rect-reveal' ? null : 'rect-reveal')} title="Rechteck aufdecken">▭ Zeigen</button>
                                </div>
                                <div className="tool-row">
                                    <button data-tool="poly-cover" className={`btn-tool${fogTool === 'poly-cover' ? ' active' : ''}`} onClick={() => { setFogTool(fogTool === 'poly-cover' ? null : 'poly-cover'); setPolyPoints([]); }} title="Polygon abdecken (Doppelklick/Enter)">⟳ Decken</button>
                                    <button data-tool="poly-reveal" className={`btn-tool${fogTool === 'poly-reveal' ? ' active' : ''}`} onClick={() => { setFogTool(fogTool === 'poly-reveal' ? null : 'poly-reveal'); setPolyPoints([]); }} title="Polygon aufdecken">⟳ Zeigen</button>
                                </div>
                                {(fogTool === 'brush-cover' || fogTool === 'brush-reveal') && (
                                    <>
                                        <label className="slider-label">Pinsel: {fogRadius} Felder</label>
                                        <input type="range" min={1} max={12} step={1} value={fogRadius}
                                               onChange={(e) => setFogRadius(parseInt(e.target.value, 10))} />
                                    </>
                                )}
                                <div className="tool-row">
                                    <button className="btn-tool" onClick={coverAll} title="Alles abdecken">Alles decken</button>
                                    <button className="btn-tool" onClick={revealAll} title="Alles aufdecken">Alles zeigen</button>
                                </div>
                                <label className="slider-label">GM-Transparenz: {Math.round(gmFogAlpha * 100)}%</label>
                                <input type="range" min={0.1} max={0.9} step={0.05} value={gmFogAlpha}
                                       onChange={(e) => setGmFogAlpha(parseFloat(e.target.value))} />
                                <label className="slider-label">Nebel-Deckkraft für Spieler: {Math.round(effectiveFogOpa * 100)}%</label>
                                <input type="range" min={0} max={1} step={0.05} value={effectiveFogOpa}
                                       onChange={(e) => {
                                           const v = parseFloat(e.target.value);
                                           setLocalFogOpa(v);
                                           sendPlayerFogOpacity(v);
                                       }} />
                            </>
                        )}

                        <h3 style={{ marginTop: 14 }}>Dunkelheit &amp; Licht</h3>
                        <label className="toggle-row">
                            <input type="checkbox" checked={!!lighting?.darkness} onChange={(e) => setDarknessOnServer(e.target.checked)} />
                            <span>Karte verdunkeln</span>
                        </label>
                        <label className="slider-label">GM-Sichtbarkeit in Dunkelheit: {Math.round((1 - gmDarkAlpha) * 100)}%</label>
                        <input type="range" min={0.1} max={0.85} step={0.05} value={gmDarkAlpha}
                               onChange={(e) => setGmDarkAlpha(parseFloat(e.target.value))} />
                        <label className="slider-label">Dunkelheit für Spieler: {Math.round(effectiveDarkOpa * 100)}%</label>
                        <input type="range" min={0} max={1} step={0.05} value={effectiveDarkOpa}
                               onChange={(e) => {
                                   const v = parseFloat(e.target.value);
                                   setLocalDarkOpa(v);
                                   sendPlayerDarknessOpacity(v);
                               }} />
                        <label className="slider-label" style={{ marginTop: 8 }}>Lichtpreset</label>
                        <select value={lightPreset} onChange={(e) => setLightPreset(e.target.value)}>
                            {LIGHT_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                        </select>
                        <button className={`btn-tool${fogTool === 'place-light' ? ' active' : ''}`}
                                style={{ width: '100%', marginTop: 6 }}
                                onClick={() => setFogTool(fogTool === 'place-light' ? null : 'place-light')}>
                            {fogTool === 'place-light' ? 'Klick abbrechen' : '✦ Licht platzieren'}
                        </button>
                        {lighting && lighting.lights.length > 0 && (
                            <div className="light-list">
                                {lighting.lights.map((l) => {
                                    const posLabel = l.kind === 'token'
                                        ? `am Token ${tokens.find((t) => t.id === l.tokenId)?.label || l.tokenId?.slice(0, 8) || '?'}`
                                        : `@ ${l.x.toFixed(1)},${l.y.toFixed(1)}`;
                                    return (
                                        <div key={l.id} className="light-row">
                                            <input type="checkbox" checked={l.enabled} onChange={() => toggleLight(l)} />
                                            <span className="dot" style={{ background: l.color }} />
                                            <div className="info">
                                                <div className="lbl">{l.label || (l.kind === 'token' ? 'Token-Licht' : 'Licht')}</div>
                                                <div className="sub">{l.bright}/{l.dim} ft · {posLabel}</div>
                                            </div>
                                            <button className="btn-ghost danger" onClick={() => removeLight(l)} title="Entfernen">✕</button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {isOwner && (
                    <>
                        <h3 style={{ marginTop: 16 }}>Spieler-Tokens</h3>
                        {playerTokensToDrag.length === 0 && (
                            <div className="ph-card">Noch keine Spieler-Chars gewählt.</div>
                        )}
                        {playerTokensToDrag.map(({ userId, character }) => (
                            <button
                                key={userId}
                                className="token-palette-item"
                                title="Auf die Karte setzen"
                                onClick={() => addTokenAtCentre(character)}
                            >
                                <TokenPreview url={character.tokenUrl} name={character.name} size={44} />
                                <span>{character.name}</span>
                            </button>
                        ))}
                        <button className="btn-ghost" onClick={() => addTokenAtCentre(null, "GM")}>
                            + GM-Token
                        </button>
                        {selection.size >= 2 && (
                            <button className="btn-rust" style={{ marginTop: 8 }} onClick={groupSelection}>
                                {selection.size} Tokens gruppieren
                            </button>
                        )}
                        {groups.length > 0 && (
                            <>
                                <h3 style={{ marginTop: 16 }}>Gruppen</h3>
                                {groups.map((g) => (
                                    <div key={g.id} className="ph-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span>{g.name || "Trupp"}</span>
                                        <button className="btn-ghost" onClick={() => ungroup(g.id)}>Auflösen</button>
                                    </div>
                                ))}
                            </>
                        )}
                    </>
                )}
            </aside>

            <section className="game-centre" ref={centreRef}>
                <div className="game-topbar">
                    <Link to={`/kampagnen/${id}`}>&laquo; Zur Kampagne</Link>
                    <span className="title">{campaign.name}</span>
                    {!joined && <span style={{ color: "#c04e3f" }}>Verbinde &hellip;</span>}
                </div>

                {isOwner && (
                    <div className="game-map-picker">
                        <span>Aktive Karte</span>
                        <select value={activeMapId || ""} onChange={(e) => handleSelectMap(e.target.value)}>
                            <option value="">&mdash; keine &mdash;</option>
                            {campaign.mapIds
                                .map((mid) => maps.find((m) => m._id === mid))
                                .filter((m): m is MapListItem => !!m)
                                .map((m) => (
                                    <option key={m._id} value={m._id}>
                                        {m.name}
                                        {m.kind === "2d-image" ? " (Bild)" : m.kind === "2d-editor" ? " (2D)" : " (3D)"}
                                    </option>
                                ))}
                        </select>
                    </div>
                )}

                {!activeMap ? (
                    <div className="game-no-map">
                        <h2>Keine Karte gewählt</h2>
                        <p>
                            {isOwner
                                ? "Wähle oben rechts eine zugewiesene Karte, um sie allen anzuzeigen."
                                : "Der Spielleiter hat noch keine Karte gewählt. Lehn dich kurz zurück."}
                        </p>
                    </div>
                ) : activeMap.kind === "2d-image" && activeMap.imageUrl ? (
                    <div
                        className="game-map"
                        ref={imageWrapRef}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}
                        onWheel={onWheel}
                        onClick={(ev) => {
                            // Kalibrier-Modus two-point
                            if (!calibrateMode || calibrateMode !== "two-point" || !isOwner) return;
                            const wrap = imageWrapRef.current;
                            if (!wrap) return;
                            const rect = wrap.getBoundingClientRect();
                            const cx = wrap.clientWidth / 2;
                            const cy = wrap.clientHeight / 2;
                            // Umrechnung Screen -> Bild-px
                            const imgPxX = (ev.clientX - rect.left - cx - transform.x) / transform.scale + imageSizeRef.current.w / 2;
                            const imgPxY = (ev.clientY - rect.top - cy - transform.y) / transform.scale + imageSizeRef.current.h / 2;
                            if (!calibrationStart.current) {
                                calibrationStart.current = { x: imgPxX, y: imgPxY };
                                return;
                            }
                            const dist = Math.hypot(imgPxX - calibrationStart.current.x, imgPxY - calibrationStart.current.y);
                            calibrationStart.current = null;
                            if (dist > 4) {
                                const g = (effectiveGrid || defaultGrid());
                                void persistGrid({ ...g, cellPx: dist });
                            }
                            setCalibrateMode(null);
                        }}
                    >
                        <img
                            alt={activeMap.name}
                            src={activeMap.imageUrl}
                            draggable={false}
                            onLoad={onImageLoad}
                            style={{
                                transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                            }}
                        />
                        {/* Grid-Overlay */}
                        {effectiveGrid && effectiveGrid.show && effectiveGrid.cellPx && viewTransform && (
                            <GridOverlay vt={viewTransform} grid={effectiveGrid} imgW={imageSizeRef.current.w} imgH={imageSizeRef.current.h} />
                        )}
                        {viewTransform && (
                            <TokenLayer
                                tokens={tokens}
                                groups={groups}
                                vt={viewTransform}
                                isOwner={!!isOwner}
                                myUserId={myUserId}
                                selection={selection}
                                draggingIds={draggingIds}
                                onPointerDownToken={startTokenDrag}
                                onPointerMoveToken={continueTokenDrag}
                                onPointerUpToken={endTokenDrag}
                                onSelectToken={(t, ev) => toggleSelect(t.id, ev.shiftKey)}
                                characters={campaign.characters}
                            />
                        )}
                        {viewTransform && lighting && worldDims && (
                            <LightingLayer
                                lighting={lighting}
                                vt={viewTransform as ViewT}
                                isOwner={!!isOwner}
                                tokens={tokens}
                                worldFieldsW={worldDims.w}
                                worldFieldsH={worldDims.h}
                                gmFogAlpha={gmFogAlpha}
                                gmDarkAlpha={gmDarkAlpha}
                                playerFogAlpha={effectiveFogOpa}
                                playerDarknessAlpha={effectiveDarkOpa}
                            />
                        )}
                        {fogToolOverlay}
                        <div className="game-zoom">
                            <button onClick={() => bumpZoom(-1)} title="Verkleinern">&minus;</button>
                            <button onClick={resetZoom} title="Zurücksetzen">&#9711;</button>
                            <button onClick={() => bumpZoom(1)} title="Vergrößern">+</button>
                        </div>
                        {isOwner && (
                            <div className="grid-settings-handle">
                                <button className="btn-ghost" onClick={() => setShowGridSettings((v) => !v)}>
                                    {showGridSettings ? "Raster ✕" : "Raster"}
                                </button>
                                {showGridSettings && (
                                    <GridSettings
                                        grid={effectiveGrid || defaultGrid()}
                                        suggested={!effectiveGrid?.cellPx}
                                        imgW={imageSizeRef.current.w}
                                        onChange={(g) => void persistGrid(g)}
                                        onCalibrateTwoPoints={() => {
                                            calibrationStart.current = null;
                                            setCalibrateMode("two-point");
                                        }}
                                        onCalibrateNFields={(n) => {
                                            const g = effectiveGrid || defaultGrid();
                                            if (!imageSizeRef.current.w) return;
                                            void persistGrid({ ...g, cellPx: imageSizeRef.current.w / n });
                                        }}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                ) : activeMap.kind === "2d-editor" ? (
                    <div className="game-map editor-readonly" ref={editorWrapRef}>
                        {!activeEditorDoc ? (
                            <div className="game-no-map"><h2>Lade 2D-Karte &hellip;</h2></div>
                        ) : (
                            <>
                                <canvas
                                    ref={editorCanvasRef}
                                    onPointerDown={onEditorPointerDown}
                                    onPointerMove={onEditorPointerMove}
                                    onPointerUp={onEditorPointerUp}
                                    onPointerCancel={onEditorPointerUp}
                                    onPointerLeave={onEditorPointerUp}
                                    onWheel={onEditorWheel}
                                    style={{ cursor: "grab" }}
                                />
                                {viewTransform && (
                                    <TokenLayer
                                        tokens={tokens}
                                        groups={groups}
                                        vt={viewTransform}
                                        isOwner={!!isOwner}
                                        myUserId={myUserId}
                                        selection={selection}
                                        draggingIds={draggingIds}
                                        onPointerDownToken={startTokenDrag}
                                        onPointerMoveToken={continueTokenDrag}
                                        onPointerUpToken={endTokenDrag}
                                        onSelectToken={(t, ev) => toggleSelect(t.id, ev.shiftKey)}
                                        characters={campaign.characters}
                                    />
                                )}
                                {viewTransform && lighting && worldDims && (
                                    <LightingLayer
                                        lighting={lighting}
                                        vt={viewTransform as ViewT}
                                        isOwner={!!isOwner}
                                        tokens={tokens}
                                        worldFieldsW={worldDims.w}
                                        worldFieldsH={worldDims.h}
                                        gmFogAlpha={gmFogAlpha}
                                        gmDarkAlpha={gmDarkAlpha}
                                        playerFogAlpha={effectiveFogOpa}
                                        playerDarknessAlpha={effectiveDarkOpa}
                                    />
                                )}
                                {fogToolOverlay}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="game-3d-hint">
                        <h2>3D-Karte aktiv</h2>
                        <div className="map-name">{activeMap.name}</div>
                        <p>3D-Karten lassen sich noch nicht direkt im Spielbrett einbetten &mdash; öffne sie im Builder:</p>
                        <a href={`/bilder/?map=${activeMap._id}`} target="_blank" rel="noreferrer">Im Builder öffnen</a>
                    </div>
                )}
            </section>

            <aside className="game-right">
                <div className="right-tabs" role="tablist">
                    <button
                        role="tab"
                        className={`right-tab${rightTab === 'chat' ? ' active' : ''}`}
                        onClick={() => setRightTab('chat')}
                    >
                        Chat
                    </button>
                    <button
                        role="tab"
                        className={`right-tab${rightTab === 'initiative' ? ' active' : ''}`}
                        onClick={() => setRightTab('initiative')}
                    >
                        Initiative
                        {initiative?.active && <span className="tab-dot" title="Kampf läuft" />}
                    </button>
                    <button
                        role="tab"
                        className={`right-tab${rightTab === 'inventory' ? ' active' : ''}`}
                        onClick={() => setRightTab('inventory')}
                    >
                        Inventar
                    </button>
                </div>
                {rightTab === 'chat' && (
                    <>
                        <div className="chat-log" ref={chatLogRef}>
                            {messages.length === 0 && <div className="presence-empty">Noch keine Nachrichten.</div>}
                            {messages.map((m) => (
                                <div className="chat-msg" key={m._id}>
                                    <div className="head">
                                        <span className="who">
                                            {m.username}
                                            {ownerId && String(m.userId) === String(ownerId) && (
                                                <span className="gm-tag" style={{ marginLeft: 6 }}>GM</span>
                                            )}
                                        </span>
                                        <span className="time">{timeHHMM(m.createdAt)}</span>
                                    </div>
                                    <div className="body">{m.text}</div>
                                </div>
                            ))}
                        </div>
                        <div className="chat-input">
                            <input
                                ref={chatInputRef}
                                type="text"
                                placeholder="Nachricht &hellip;"
                                onKeyDown={onChatKey}
                                maxLength={2000}
                            />
                            <button onClick={sendChat} disabled={!joined}>Senden</button>
                        </div>
                    </>
                )}
                {rightTab === 'initiative' && id && (
                    <div className="right-scroll">
                        <InitiativePanel
                            campaignId={id}
                            isOwner={!!isOwner}
                            ownerId={String(ownerId || '')}
                            myUserId={myUserId}
                            myCurrentCharId={myCurrentCharId}
                            myCharacters={myCharacters}
                            initiative={initiative}
                        />
                    </div>
                )}
                {rightTab === 'inventory' && id && (
                    <div className="right-scroll">
                        <InventoryPanel
                            campaignId={id}
                            isOwner={!!isOwner}
                            ownerId={String(ownerId || '')}
                            players={campaign.players}
                            myUserId={myUserId}
                            myInventory={myInventory}
                            allInventories={allInventories}
                        />
                    </div>
                )}
                {rightTab === 'chat' && isOwner && selection.size > 0 && (
                    <div className="selected-ops">
                        <div className="group-title">Ausgewählt: {selection.size}</div>
                        {Array.from(selection).map((sid) => {
                            const t = tokens.find((x) => x.id === sid);
                            if (!t) return null;
                            return (
                                <div key={sid} className="sel-row">
                                    <span className="name">{t.label || (t.characterId ? campaign.characters.find((c) => c._id === t.characterId)?.name : "Token")}</span>
                                    <button className="btn-ghost" onClick={() => resizeToken(t, Math.max(0.5, t.size - 0.5))}>−</button>
                                    <span>{t.size}</span>
                                    <button className="btn-ghost" onClick={() => resizeToken(t, Math.min(6, t.size + 0.5))}>+</button>
                                    <button className="btn-ghost" onClick={() => toggleLock(t)}>{t.locked ? "🔒" : "🔓"}</button>
                                    <button className="btn-ghost danger" onClick={() => removeToken(t)}>✕</button>
                                </div>
                            );
                        })}
                        <button className="btn-ghost" onClick={clearSelection}>Auswahl löschen</button>
                    </div>
                )}
            </aside>

            <div className="game-bottom">
                {presence.length === 0 ? (
                    <div className="presence-empty">Niemand im Raum.</div>
                ) : (
                    presence.map((u) => {
                        const isGm = ownerId && String(u._id) === String(ownerId);
                        const isMe = myName && u.username === myName;
                        // User-Id aus presence beim ersten Matchen festhalten
                        if (!myUserId && isMe) {
                            setTimeout(() => setMyUserId(u._id), 0);
                        }
                        const char = charByUser.get(u._id);
                        return (
                            <div key={u._id} className={`presence-item${isMe ? " me" : ""}`}>
                                {char ? (
                                    <TokenPreview url={char.tokenUrl} name={char.name} size={36} />
                                ) : (
                                    <div className="avatar" style={{ background: colorFor(u.username) }}>
                                        {initials(u.username)}
                                    </div>
                                )}
                                <div className="name">
                                    {char ? char.name : u.username}
                                    {char && <div className="muted" style={{ fontSize: 10 }}>{u.username}</div>}
                                </div>
                                {isGm && <div className="gm-tag">GM</div>}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

// Cursor-Visualisierung fuer den Fog-Pinsel: ein folgt-der-Maus-Kreis.
const BrushCursor: React.FC<{ radiusPx: number; cover: boolean }> = ({ radiusPx, cover }) => {
    const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
    React.useEffect(() => {
        const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
        window.addEventListener('mousemove', onMove);
        return () => window.removeEventListener('mousemove', onMove);
    }, []);
    if (!pos) return null;
    return (
        <div style={{
            position: 'fixed',
            left: pos.x - radiusPx,
            top: pos.y - radiusPx,
            width: radiusPx * 2,
            height: radiusPx * 2,
            borderRadius: '50%',
            border: '2px dashed ' + (cover ? '#e6c56a' : '#9fe6c6'),
            background: cover ? 'rgba(0,0,0,0.18)' : 'rgba(159,230,198,0.12)',
            pointerEvents: 'none',
            zIndex: 9999,
        }} />
    );
};

// ---------- Grid-Overlay (gezeichnet per SVG) ----------

const GridOverlay: React.FC<{ vt: ViewTransform; grid: MapGrid; imgW: number; imgH: number }> = ({
    vt, grid, imgW, imgH,
}) => {
    if (!grid.cellPx) return null;
    // Zeichne so viele Linien, wie innerhalb des Bildes liegen.
    const cols = Math.ceil(imgW / grid.cellPx);
    const rows = Math.ceil(imgH / grid.cellPx);
    const lines: React.ReactNode[] = [];
    for (let c = 0; c <= cols; c++) {
        const { sx: x1, sy: y1 } = fieldToScreen(vt, c, 0);
        const { sx: x2, sy: y2 } = fieldToScreen(vt, c, rows);
        lines.push(<line key={`v${c}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={grid.color} opacity={grid.opacity} strokeWidth={1} />);
    }
    for (let r = 0; r <= rows; r++) {
        const { sx: x1, sy: y1 } = fieldToScreen(vt, 0, r);
        const { sx: x2, sy: y2 } = fieldToScreen(vt, cols, r);
        lines.push(<line key={`h${r}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={grid.color} opacity={grid.opacity} strokeWidth={1} />);
    }
    return (
        <svg className="grid-overlay" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {lines}
        </svg>
    );
};

// ---------- Token-Layer (DIVs ueber der Karte) ----------

interface TokenLayerProps {
    tokens: TokenInstance[];
    groups: TokenGroup[];
    vt: ViewTransform;
    isOwner: boolean;
    myUserId: string | null;
    selection: Set<string>;
    draggingIds: string[];
    onPointerDownToken: (e: React.PointerEvent, t: TokenInstance) => void;
    onPointerMoveToken: (e: React.PointerEvent) => void;
    onPointerUpToken: (e: React.PointerEvent) => void;
    onSelectToken: (t: TokenInstance, e: React.PointerEvent) => void;
    characters: CharacterDoc[];
}

const TokenLayer: React.FC<TokenLayerProps> = ({
    tokens, groups, vt, isOwner, myUserId, selection, draggingIds,
    onPointerDownToken, onPointerMoveToken, onPointerUpToken, onSelectToken, characters,
}) => {
    return (
        <div className="token-layer" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {tokens.map((t) => {
                const { sx, sy } = fieldToScreen(vt, t.x + t.size / 2, t.y + t.size / 2);
                const sizePx = vt.baseFieldPx * vt.scale * t.size;
                const canMove = isOwner || (!t.locked && String(t.ownerUserId || "") === String(myUserId || ""));
                const char = t.characterId ? characters.find((c) => c._id === t.characterId) : null;
                const isSel = selection.has(t.id);
                const isDrag = draggingIds.includes(t.id);
                return (
                    <div
                        key={t.id}
                        data-token-id={t.id}
                        draggable={false}
                        onDragStart={(ev) => ev.preventDefault()}
                        className={`token-on-map${isSel ? " selected" : ""}${isDrag ? " dragging" : ""}${canMove ? " movable" : ""}`}
                        style={{
                            left: sx - sizePx / 2,
                            top: sy - sizePx / 2,
                            width: sizePx,
                            height: sizePx,
                            pointerEvents: "auto",
                            borderColor: char ? "#9b2a1e" : (t.color || "#c2a053"),
                        }}
                        onMouseDown={(ev) => {
                            ev.stopPropagation();
                            onSelectToken(t, ev as unknown as React.PointerEvent);
                            if (canMove) onPointerDownToken(ev as unknown as React.PointerEvent, t);
                        }}
                        onPointerDown={(ev) => {
                            ev.stopPropagation();
                            onSelectToken(t, ev);
                            if (canMove) onPointerDownToken(ev, t);
                        }}
                        title={char ? char.name : t.label || "Token"}
                    >
                        {char?.tokenUrl ? (
                            <img src={char.tokenUrl} alt={char.name} draggable={false} />
                        ) : (
                            <div className="letter" style={{ background: t.color || "#9b2a1e" }}>
                                {(char?.name || t.label || "?").trim().slice(0, 1).toUpperCase()}
                            </div>
                        )}
                        {t.locked && <div className="lock-badge" title="Gesperrt">🔒</div>}
                    </div>
                );
            })}
        </div>
    );
};

// ---------- Grid Settings Panel ----------

interface GridSettingsProps {
    grid: MapGrid;
    suggested: boolean;
    imgW: number;
    onChange: (g: MapGrid) => void;
    onCalibrateTwoPoints: () => void;
    onCalibrateNFields: (n: number) => void;
}
const GridSettings: React.FC<GridSettingsProps> = ({ grid, suggested, imgW, onChange, onCalibrateTwoPoints, onCalibrateNFields }) => {
    const [nFields, setNFields] = useState<string>("30");
    return (
        <div className="grid-settings-panel">
            <div className="group-title">Raster-Overlay</div>
            {suggested && (
                <div className="hint">
                    Kein kalibriertes Raster. Schätzwert angewandt (Bild/30). Kalibriere unten, damit Tokens richtig skalieren.
                </div>
            )}
            <label>Feldgröße (px): {Math.round(grid.cellPx || 0)}</label>
            <input
                type="range" min={8} max={Math.max(200, Math.round((imgW || 2000) / 10))} step={1}
                value={grid.cellPx || 0}
                onChange={(e) => onChange({ ...grid, cellPx: parseInt(e.target.value, 10) })}
            />
            <label>Versatz X: {Math.round(grid.offsetX)}</label>
            <input type="range" min={-200} max={200} step={1} value={grid.offsetX}
                   onChange={(e) => onChange({ ...grid, offsetX: parseInt(e.target.value, 10) })}/>
            <label>Versatz Y: {Math.round(grid.offsetY)}</label>
            <input type="range" min={-200} max={200} step={1} value={grid.offsetY}
                   onChange={(e) => onChange({ ...grid, offsetY: parseInt(e.target.value, 10) })}/>
            <label>Farbe</label>
            <input type="color" value={grid.color} onChange={(e) => onChange({ ...grid, color: e.target.value })} />
            <label>Deckkraft: {grid.opacity.toFixed(2)}</label>
            <input type="range" min={0} max={1} step={0.05} value={grid.opacity}
                   onChange={(e) => onChange({ ...grid, opacity: parseFloat(e.target.value) })} />
            <label className="toggle">
                <input type="checkbox" checked={grid.show} onChange={(e) => onChange({ ...grid, show: e.target.checked })} />
                Raster anzeigen
            </label>
            <div className="group-title" style={{ marginTop: 10 }}>Kalibrieren</div>
            <button className="btn-ghost" onClick={onCalibrateTwoPoints}>2 Rasterpunkte anklicken</button>
            <div className="hint">Klicke auf dem Bild 2 benachbarte Rasterecken an.</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                <input type="number" value={nFields} min={2} max={200} onChange={(e) => setNFields(e.target.value)} />
                <button className="btn-ghost" onClick={() => onCalibrateNFields(parseInt(nFields, 10) || 30)}>
                    Karte ist N Felder breit
                </button>
            </div>
        </div>
    );
};

export default GamePage;
