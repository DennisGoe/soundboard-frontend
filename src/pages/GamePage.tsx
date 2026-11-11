import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiService, { Campaign, ChatMessage, MapFull, MapListItem } from "../modules/api";
import { getSocket } from "../modules/notifications/socket";
import { useAuth } from "../hooks/useAuth";
import "./campaigns.css";
import "./game.css";
import "./mapEditor.css";
import { EditorDoc, normalizeDoc } from "../mapEditor/engine";
import { Transform, render as renderMap } from "../mapEditor/renderer";

interface PresenceUser {
    _id: string;
    username: string;
}

// Deterministische Farbe pro Username (fuer Avatar-Kreis).
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
    try {
        return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
}

const GamePage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { userName } = useAuth();
    const myName = (userName as string) || localStorage.getItem("username") || "";

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [maps, setMaps] = useState<MapListItem[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [presence, setPresence] = useState<PresenceUser[]>([]);
    const [activeMapId, setActiveMapId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [joined, setJoined] = useState(false);

    const chatInputRef = useRef<HTMLInputElement | null>(null);
    const chatLogRef = useRef<HTMLDivElement | null>(null);

    // Initial-Load: Kampagne + Maps + Chat
    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        (async () => {
            try {
                const [cRes, mRes, chRes] = await Promise.all([
                    apiService.getCampaign(id),
                    apiService.listMaps(),
                    apiService.getChat(id),
                ]);
                if (cancelled) return;
                setCampaign(cRes.campaign);
                setActiveMapId(cRes.campaign.activeMapId);
                setMaps(mRes.maps);
                setMessages(chRes.messages);
            } catch (e: any) {
                if (!cancelled) setLoadError(e?.msg || "Spielbrett konnte nicht geladen werden.");
            }
        })();
        return () => { cancelled = true; };
    }, [id]);

    // Socket: joinen + Events hoeren
    useEffect(() => {
        if (!id || !campaign) return;
        const socket = getSocket();
        if (!socket.connected) {
            try { socket.connect(); } catch { /* ignore */ }
        }
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
            // Nur relevant, wenn die Map gerade aktiv ist.
            setEditorMapCache((prev) => {
                const next = new Map(prev);
                next.set(p.mapId, p.map);
                return next;
            });
            // auch in der Maps-Liste den name + kind refreshen
            setMaps((prev) => prev.map((m) => (m._id === p.mapId ? {
                _id: p.map._id,
                name: p.map.name,
                owner: p.map.owner as any,
                isExample: p.map.isExample,
                kind: p.map.kind,
                imageUrl: p.map.imageUrl,
                createdAt: p.map.createdAt,
                updatedAt: p.map.updatedAt,
            } : m)));
        };
        socket.on("campaign:presence", onPresence);
        socket.on("campaign:chat", onChat);
        socket.on("campaign:activeMap", onActive);
        socket.on("campaign:mapUpdated", onMapUpdated);

        return () => {
            socket.off("connect", join);
            socket.off("campaign:presence", onPresence);
            socket.off("campaign:chat", onChat);
            socket.off("campaign:activeMap", onActive);
            socket.off("campaign:mapUpdated", onMapUpdated);
            try {
                socket.emit("campaign:leave", { campaignId: id });
            } catch { /* ignore */ }
            setJoined(false);
        };
    }, [id, campaign]);

    // Autoscroll zum Chat-Ende, wenn neue Nachricht kommt.
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
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendChat();
        }
    };

    const activeMap: MapListItem | null = useMemo(() => {
        if (!activeMapId) return null;
        return maps.find((m) => m._id === activeMapId) || null;
    }, [activeMapId, maps]);

    const isOwner = campaign?.role === "owner";

    const handleSelectMap = (mid: string) => {
        if (!id) return;
        const socket = getSocket();
        const nextId = mid || null;
        socket.emit("campaign:setActiveMap", { campaignId: id, mapId: nextId }, (ack: any) => {
            if (!ack?.ok) {
                // Fallback: REST-Endpoint
                void apiService.setActiveMap(id, nextId).catch(() => {});
            }
        });
    };

    const ownerId = campaign?.owner;

    // --- Pan / Zoom fuer 2D-Karte ---
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const dragRef = useRef<{ x: number; y: number } | null>(null);
    const centreRef = useRef<HTMLDivElement | null>(null);
    // Doc-Cache fuer 2d-editor-Karten im Spiel. Wird per REST geladen und
    // via campaign:mapUpdated live aktualisiert.
    const [editorMapCache, setEditorMapCache] = useState<Map<string, MapFull>>(new Map());
    const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const editorWrapRef = useRef<HTMLDivElement | null>(null);
    const editorTransformRef = useRef<Transform>({ x: 0, y: 0, scale: 1, tilePx: 32 });
    const editorPanRef = useRef<{ x: number; y: number } | null>(null);

    // Reset Zoom bei Kartenwechsel
    useEffect(() => { setTransform({ x: 0, y: 0, scale: 1 }); }, [activeMapId]);

    // 2D-Editor-Docs on-demand laden, sobald sie aktiv werden.
    useEffect(() => {
        if (!activeMap) return;
        if (activeMap.kind !== "2d-editor") return;
        if (editorMapCache.has(activeMap._id)) return;
        let cancelled = false;
        (async () => {
            try {
                const { map } = await apiService.getMap(activeMap._id);
                if (cancelled) return;
                setEditorMapCache((prev) => {
                    const next = new Map(prev);
                    next.set(map._id, map);
                    return next;
                });
            } catch (e) {
                // Still: Fehler zeigen wir nicht im Spielbrett — der Spieler
                // sieht dann den fallback "Keine Karte"-Hinweis.
            }
        })();
        return () => { cancelled = true; };
    }, [activeMap, editorMapCache]);

    // Editor-Doc fuer den aktuellen Spielraum.
    const activeEditorDoc: EditorDoc | null = useMemo(() => {
        if (!activeMap || activeMap.kind !== "2d-editor") return null;
        const full = editorMapCache.get(activeMap._id);
        if (!full || !full.doc) return null;
        return normalizeDoc(full.doc);
    }, [activeMap, editorMapCache]);

    // Zentriert die Karte beim ersten Draw, damit sie nicht in der Ecke sitzt.
    const editorCenteredRef = useRef<string | null>(null);
    useEffect(() => {
        if (!activeEditorDoc) { editorCenteredRef.current = null; return; }
        const cv = editorCanvasRef.current;
        const wrap = editorWrapRef.current;
        if (!cv || !wrap) return;
        if (editorCenteredRef.current === activeMap?._id) return;
        const w = wrap.clientWidth, h = wrap.clientHeight;
        const tile = 24;
        const maxScale = Math.min(w / (activeEditorDoc.width * tile), h / (activeEditorDoc.height * tile));
        const scale = Math.max(0.2, Math.min(1.5, maxScale * 0.95));
        editorTransformRef.current = {
            tilePx: tile,
            scale,
            x: (w - activeEditorDoc.width * tile * scale) / 2,
            y: (h - activeEditorDoc.height * tile * scale) / 2,
        };
        editorCenteredRef.current = activeMap?._id || null;
    }, [activeEditorDoc, activeMap?._id]);

    // Redraw bei Doc-Aenderung + Groessenaenderung
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
        const obs = new ResizeObserver(draw);
        obs.observe(wrap);
        return () => obs.disconnect();
    }, [activeEditorDoc]);

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
            tilePx: prev.tilePx,
            scale: nextScale,
            x: cx - wx * prev.tilePx * nextScale,
            y: cy - wy * prev.tilePx * nextScale,
        };
        editorRedraw();
    };

    const onMouseDown = (e: React.MouseEvent) => {
        dragRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    };
    const onMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current) return;
        setTransform((prev) => ({
            ...prev,
            x: e.clientX - dragRef.current!.x,
            y: e.clientY - dragRef.current!.y,
        }));
    };
    const onMouseUp = () => { dragRef.current = null; };
    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? -1 : 1;
        setTransform((prev) => {
            const next = Math.max(0.1, Math.min(6, prev.scale * (dir > 0 ? 1.1 : 0.9)));
            return { ...prev, scale: next };
        });
    };
    const bumpZoom = (dir: number) => {
        setTransform((prev) => {
            const next = Math.max(0.1, Math.min(6, prev.scale * (dir > 0 ? 1.2 : 0.8)));
            return { ...prev, scale: next };
        });
    };
    const resetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

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

    return (
        <div className="game-root">
            <aside className="game-left">
                <h3>Werkzeuge</h3>
                <div className="ph-card">
                    Hier kommen später Würfel, Marker und Notizen hin.
                </div>
                <div className="ph-card">
                    Platz für Initiative-Tracker.
                </div>
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
                        <select
                            value={activeMapId || ""}
                            onChange={(e) => handleSelectMap(e.target.value)}
                        >
                            <option value="">&mdash; keine &mdash;</option>
                            {campaign.mapIds
                                .map((mid) => maps.find((m) => m._id === mid))
                                .filter((m): m is MapListItem => !!m)
                                .map((m) => (
                                    <option key={m._id} value={m._id}>
                                        {m.name}
                                        {m.kind === "2d-image"
                                            ? " (Bild)"
                                            : m.kind === "2d-editor"
                                            ? " (2D)"
                                            : " (3D)"}
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
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}
                        onWheel={onWheel}
                    >
                        <img
                            alt={activeMap.name}
                            src={activeMap.imageUrl}
                            draggable={false}
                            style={{
                                transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                            }}
                        />
                        <div className="game-zoom">
                            <button onClick={() => bumpZoom(-1)} title="Verkleinern">&minus;</button>
                            <button onClick={resetZoom} title="Zurücksetzen">&#9711;</button>
                            <button onClick={() => bumpZoom(1)} title="Vergrößern">+</button>
                        </div>
                    </div>
                ) : activeMap.kind === "2d-editor" ? (
                    <div className="game-map editor-readonly" ref={editorWrapRef}>
                        {!activeEditorDoc ? (
                            <div className="game-no-map">
                                <h2>Lade 2D-Karte &hellip;</h2>
                            </div>
                        ) : (
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
                        )}
                    </div>
                ) : (
                    <div className="game-3d-hint">
                        <h2>3D-Karte aktiv</h2>
                        <div className="map-name">{activeMap.name}</div>
                        <p>
                            3D-Karten lassen sich noch nicht direkt im Spielbrett
                            einbetten &mdash; öffne sie im Builder:
                        </p>
                        <a href={`/bilder/?map=${activeMap._id}`} target="_blank" rel="noreferrer">
                            Im Builder öffnen
                        </a>
                    </div>
                )}
            </section>

            <aside className="game-right">
                <div className="chat-header">Chat</div>
                <div className="chat-log" ref={chatLogRef}>
                    {messages.length === 0 && (
                        <div className="presence-empty">Noch keine Nachrichten.</div>
                    )}
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
                    <button onClick={sendChat} disabled={!joined}>
                        Senden
                    </button>
                </div>
            </aside>

            <div className="game-bottom">
                {presence.length === 0 ? (
                    <div className="presence-empty">Niemand im Raum.</div>
                ) : (
                    presence.map((u) => {
                        const isGm = ownerId && String(u._id) === String(ownerId);
                        const isMe = myName && u.username === myName;
                        return (
                            <div key={u._id} className={`presence-item${isMe ? " me" : ""}`}>
                                <div
                                    className="avatar"
                                    style={{ background: colorFor(u.username) }}
                                >
                                    {initials(u.username)}
                                </div>
                                <div className="name">{u.username}</div>
                                {isGm && <div className="gm-tag">GM</div>}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default GamePage;
