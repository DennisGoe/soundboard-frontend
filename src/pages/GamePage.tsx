import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiService, {
    Campaign, CharacterDoc, ChatMessage, MapFull, MapGrid, MapListItem,
    TokenGroup, TokenInstance,
} from "../modules/api";
import { getSocket } from "../modules/notifications/socket";
import { useAuth } from "../hooks/useAuth";
import "./campaigns.css";
import "./game.css";
import "./mapEditor.css";
import "./characters.css";
import { EditorDoc, normalizeDoc } from "../mapEditor/engine";
import { Transform, render as renderMap } from "../mapEditor/renderer";
import { TokenPreview } from "./CharactersPage";

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

    const chatInputRef = useRef<HTMLInputElement | null>(null);
    const chatLogRef = useRef<HTMLDivElement | null>(null);

    // Meine User-Id. Wir lesen sie aus der ID im JWT via /api/auth oder schlicht
    // aus der presence (wir listen erst spaeter). Besser: aus /api/characters? Dort
    // sind Owner-IDs enthalten. Nehmen wir die erste Chars[0].owner — eigentlich
    // brauchen wir die User-ID. Der useAuth-Hook liefert sie nicht direkt; also
    // laden wir sie aus der Chars-Antwort (owner-Feld des eigenen Chars).
    const [myUserId, setMyUserId] = useState<string | null>(null);

    // Initial-Load
    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        (async () => {
            try {
                const [cRes, mRes, chRes, chaRes] = await Promise.all([
                    apiService.getCampaign(id),
                    apiService.listMaps(),
                    apiService.getChat(id),
                    apiService.listCharacters(),
                ]);
                if (cancelled) return;
                setCampaign(cRes.campaign);
                setActiveMapId(cRes.campaign.activeMapId);
                setMaps(mRes.maps);
                setMessages(chRes.messages);
                setMyCharacters(chaRes.characters);
                if (chaRes.characters.length > 0) setMyUserId(String(chaRes.characters[0].owner));
                else {
                    // Fallback: sich selbst in presence spaeter identifizieren.
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
        const onTokTick = (p: { campaignId: string; mapId: string; updates: Array<{ id: string; x: number; y: number }> }) => {
            if (p.campaignId !== id) return;
            if (p.mapId !== activeMapId) return;
            setTokens((prev) => prev.map((t) => {
                const u = p.updates.find((x) => x.id === t.id);
                return u ? { ...t, x: u.x, y: u.y } : t;
            }));
        };

        socket.on("campaign:presence", onPresence);
        socket.on("campaign:chat", onChat);
        socket.on("campaign:activeMap", onActive);
        socket.on("campaign:mapUpdated", onMapUpdated);
        socket.on("campaign:mapGrid", onMapGrid);
        socket.on("campaign:characterSelection", onCharSel);
        socket.on("campaign:tokens:update", onTokUpdate);
        socket.on("campaign:tokens:tick", onTokTick);

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
            try { socket.emit("campaign:leave", { campaignId: id }); } catch {}
            setJoined(false);
        };
    }, [id, campaign, activeMapId]);

    // Autoscroll chat
    useEffect(() => {
        const el = chatLogRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages]);


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

    // activeMap volles Doc + Tokens laden wenn ID wechselt
    useEffect(() => {
        if (!activeMapId || !id) {
            setActiveMapFull(null);
            setTokens([]);
            setGroups([]);
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
                <div className="chat-header">Chat</div>
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
                {isOwner && selection.size > 0 && (
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
