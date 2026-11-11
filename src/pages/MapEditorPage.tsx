import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiService from "../modules/api";
import "./campaigns.css";
import "./mapEditor.css";
import {
    EditorDoc,
    UndoStack,
    brushCells,
    clone as cloneDoc,
    edgeAt,
    edgeKey,
    fieldAt,
    floodFill,
    labelAt,
    newDoc,
    normalizeDoc,
    objectAt,
    randomId,
    setFloor,
} from "../mapEditor/engine";
import {
    FLOOR_MATERIALS,
    OBJECT_STAMPS,
    floorIndex,
} from "../mapEditor/palette";
import {
    Transform,
    clientToWorld,
    render as renderMap,
} from "../mapEditor/renderer";

type ToolKey =
    | "brush"
    | "fill"
    | "wall"
    | "door"
    | "object"
    | "label"
    | "erase"
    | "pan";

const TILE_PX = 32;
const AUTOSAVE_MS = 2000;

const MapEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isNew = !id || id === "neu";

    const [doc, setDoc] = useState<EditorDoc>(() => newDoc(30, 20));
    const [name, setName] = useState<string>("Neue Karte");
    const [mapId, setMapId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [tool, setTool] = useState<ToolKey>("brush");
    const [floorMat, setFloorMat] = useState<number>(0);
    const [objectKey, setObjectKey] = useState<string>(OBJECT_STAMPS[0].key);
    const [brushSize, setBrushSize] = useState<number>(1);
    const [objectRot, setObjectRot] = useState<number>(0);
    const [showGrid, setShowGrid] = useState<boolean>(true);

    const [transform, setTransform] = useState<Transform>({
        x: 40,
        y: 40,
        scale: 1,
        tilePx: TILE_PX,
    });

    const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
    const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
    const [hoverCells, setHoverCells] = useState<Array<[number, number]>>([]);
    const [hoverEdge, setHoverEdge] = useState<
        { a: [number, number]; b: [number, number] } | null
    >(null);

    const undoRef = useRef<UndoStack>(new UndoStack(50));
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokeActiveRef = useRef<boolean>(false);
    const panActiveRef = useRef<{ x: number; y: number } | null>(null);
    const spaceDownRef = useRef<boolean>(false);
    const draggingObjectRef = useRef<string | null>(null);
    const dirtyRef = useRef<boolean>(false);
    const docRef = useRef<EditorDoc>(doc);
    docRef.current = doc;
    const nameRef = useRef<string>(name);
    nameRef.current = name;
    const mapIdRef = useRef<string | null>(mapId);
    mapIdRef.current = mapId;

    // ---------- Laden ----------
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (isNew) return;
            if (!id) return;
            try {
                const { map } = await apiService.getMap(id);
                if (cancelled) return;
                if (map.kind !== "2d-editor") {
                    setLoadError(
                        "Diese Karte ist kein 2D-Editor-Dokument."
                    );
                    return;
                }
                setMapId(map._id);
                setName(map.name);
                setDoc(normalizeDoc(map.doc));
                undoRef.current.clear();
                setSavedAt(new Date(map.updatedAt));
            } catch (e: any) {
                if (!cancelled) {
                    setLoadError(e?.msg || "Karte konnte nicht geladen werden.");
                }
            }
        })();
        return () => { cancelled = true; };
    }, [id, isNew]);

    // ---------- Rendering ----------
    const draw = useCallback(() => {
        const cv = canvasRef.current;
        if (!cv) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        renderMap(ctx, docRef.current, transform, {
            showGrid,
            hoverCells,
            hoverEdge,
            selectedObjectId,
            selectedLabelId,
        });
    }, [transform, showGrid, hoverCells, hoverEdge, selectedObjectId, selectedLabelId]);

    useEffect(() => { draw(); }, [draw, doc]);

    // Canvas-Groesse an Container anpassen
    useEffect(() => {
        const cv = canvasRef.current;
        if (!cv) return;
        const parent = cv.parentElement;
        if (!parent) return;
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const w = parent.clientWidth;
            const h = parent.clientHeight;
            cv.width = Math.max(100, Math.floor(w * dpr));
            cv.height = Math.max(100, Math.floor(h * dpr));
            cv.style.width = w + "px";
            cv.style.height = h + "px";
            const ctx = cv.getContext("2d");
            if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            draw();
        };
        resize();
        const obs = new ResizeObserver(resize);
        obs.observe(parent);
        window.addEventListener("resize", resize);
        return () => {
            obs.disconnect();
            window.removeEventListener("resize", resize);
        };
    }, [draw]);

    // ---------- Autosave + manueller Save ----------
    const saveNow = useCallback(async () => {
        if (!dirtyRef.current && mapIdRef.current) return;
        if (saving) return;
        setSaving(true);
        setSaveError(null);
        try {
            if (!mapIdRef.current) {
                // Noch nicht angelegt -> POST
                const trimmed = nameRef.current.trim() || "Neue Karte";
                const { map } = await apiService.createMap({
                    name: trimmed,
                    kind: "2d-editor",
                    doc: docRef.current,
                });
                setMapId(map._id);
                setSavedAt(new Date(map.updatedAt));
                dirtyRef.current = false;
                // URL sanft aktualisieren, ohne Reload
                navigate(`/karten/${map._id}/bearbeiten`, { replace: true });
            } else {
                const trimmed = nameRef.current.trim() || "Neue Karte";
                const { map } = await apiService.updateMap(mapIdRef.current, {
                    name: trimmed,
                    doc: docRef.current,
                });
                setSavedAt(new Date(map.updatedAt));
                dirtyRef.current = false;
            }
        } catch (e: any) {
            setSaveError(e?.msg || "Speichern fehlgeschlagen.");
        } finally {
            setSaving(false);
        }
    }, [navigate, saving]);

    // Debounced autosave
    const saveTimerRef = useRef<number | null>(null);
    const bumpAutosave = useCallback(() => {
        dirtyRef.current = true;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
            void saveNow();
        }, AUTOSAVE_MS);
    }, [saveNow]);

    // beim Navigieren: letzte Chance zu speichern.
    useEffect(() => {
        return () => {
            if (dirtyRef.current && mapIdRef.current) {
                // Fire-and-forget, best effort.
                void apiService.updateMap(mapIdRef.current, {
                    name: nameRef.current.trim(),
                    doc: docRef.current,
                }).catch(() => {});
            }
        };
    }, []);

    // ---------- Mutations ----------
    const commit = useCallback((next: EditorDoc) => {
        undoRef.current.push(docRef.current);
        setDoc(next);
        bumpAutosave();
    }, [bumpAutosave]);

    // Hinweis: beginStroke sammelt EINEN Snapshot pro Strich, nicht pro Zelle.
    const strokeStartDocRef = useRef<EditorDoc | null>(null);
    const beginStroke = useCallback(() => {
        strokeStartDocRef.current = cloneDoc(docRef.current);
        strokeActiveRef.current = true;
    }, []);
    const endStroke = useCallback(() => {
        if (strokeStartDocRef.current) {
            undoRef.current.push(strokeStartDocRef.current);
            strokeStartDocRef.current = null;
            bumpAutosave();
        }
        strokeActiveRef.current = false;
    }, [bumpAutosave]);

    // ---------- Pointer ----------
    const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
        const cv = canvasRef.current;
        if (!cv) return;
        cv.setPointerCapture(ev.pointerId);
        const { wx, wy } = clientToWorld(cv, transform, ev.clientX, ev.clientY);

        // Mittlere Taste oder Space = pan.
        if (ev.button === 1 || spaceDownRef.current || tool === "pan") {
            panActiveRef.current = { x: ev.clientX - transform.x, y: ev.clientY - transform.y };
            return;
        }

        if (tool === "brush") {
            const f = fieldAt(docRef.current, wx, wy);
            if (!f) return;
            beginStroke();
            const next = cloneDoc(docRef.current);
            for (const [c, r] of brushCells(next, f.col, f.row, brushSize - 1)) {
                setFloor(next, c, r, floorMat);
            }
            setDoc(next);
            return;
        }
        if (tool === "fill") {
            const f = fieldAt(docRef.current, wx, wy);
            if (!f) return;
            const nextFloor = floodFill(docRef.current, f.col, f.row, floorMat);
            const next = cloneDoc(docRef.current);
            next.floor = nextFloor;
            commit(next);
            return;
        }
        if (tool === "wall" || tool === "door") {
            const e = edgeAt(docRef.current, wx, wy, 0.3);
            if (!e) return;
            const kind = tool === "wall" ? "wall" : "door";
            const key = edgeKey(e.a, e.b);
            const next = cloneDoc(docRef.current);
            const existing = next.walls.findIndex(
                (w) => edgeKey(w.a, w.b) === key
            );
            if (existing >= 0) {
                // Toggle: wenn gleiche Art, loeschen; sonst ersetzen.
                if (next.walls[existing].kind === kind) {
                    next.walls.splice(existing, 1);
                } else {
                    next.walls[existing] = { ...next.walls[existing], kind };
                }
            } else {
                next.walls.push({
                    id: randomId("wall"),
                    a: [e.a[0], e.a[1]],
                    b: [e.b[0], e.b[1]],
                    kind,
                });
            }
            commit(next);
            return;
        }
        if (tool === "object") {
            // Pruefen, ob man ein bestehendes Objekt greift
            const hit = objectAt(docRef.current, wx, wy);
            if (hit) {
                setSelectedObjectId(hit.id);
                setSelectedLabelId(null);
                draggingObjectRef.current = hit.id;
                return;
            }
            // Neu platzieren
            const next = cloneDoc(docRef.current);
            const newObj = {
                id: randomId("obj"),
                type: objectKey,
                x: wx,
                y: wy,
                rot: objectRot,
                scale: 1,
            };
            next.objects.push(newObj);
            setSelectedObjectId(newObj.id);
            setSelectedLabelId(null);
            draggingObjectRef.current = newObj.id;
            commit(next);
            return;
        }
        if (tool === "label") {
            const existing = labelAt(docRef.current, wx, wy);
            if (existing) {
                const text = window.prompt("Text?", existing.text);
                if (text === null) return;
                const next = cloneDoc(docRef.current);
                const i = next.labels.findIndex((l) => l.id === existing.id);
                if (text.trim() === "") next.labels.splice(i, 1);
                else next.labels[i] = { ...existing, text: text.trim() };
                setSelectedLabelId(text.trim() === "" ? null : existing.id);
                commit(next);
                return;
            }
            const text = window.prompt("Text?", "");
            if (!text) return;
            const next = cloneDoc(docRef.current);
            const l = { id: randomId("lbl"), x: wx, y: wy, text, size: 14 };
            next.labels.push(l);
            setSelectedLabelId(l.id);
            setSelectedObjectId(null);
            commit(next);
            return;
        }
        if (tool === "erase") {
            // Prio: Objekt > Label > Wand > Boden auf 0
            const obj = objectAt(docRef.current, wx, wy);
            if (obj) {
                const next = cloneDoc(docRef.current);
                next.objects = next.objects.filter((o) => o.id !== obj.id);
                commit(next);
                return;
            }
            const lbl = labelAt(docRef.current, wx, wy);
            if (lbl) {
                const next = cloneDoc(docRef.current);
                next.labels = next.labels.filter((l) => l.id !== lbl.id);
                commit(next);
                return;
            }
            const e = edgeAt(docRef.current, wx, wy, 0.3);
            if (e) {
                const key = edgeKey(e.a, e.b);
                const idx = docRef.current.walls.findIndex((w) => edgeKey(w.a, w.b) === key);
                if (idx >= 0) {
                    const next = cloneDoc(docRef.current);
                    next.walls.splice(idx, 1);
                    commit(next);
                    return;
                }
            }
            const f = fieldAt(docRef.current, wx, wy);
            if (f) {
                beginStroke();
                const next = cloneDoc(docRef.current);
                for (const [c, r] of brushCells(next, f.col, f.row, brushSize - 1)) {
                    setFloor(next, c, r, 0);
                }
                setDoc(next);
                return;
            }
        }
    };

    const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
        const cv = canvasRef.current;
        if (!cv) return;
        const { wx, wy } = clientToWorld(cv, transform, ev.clientX, ev.clientY);

        // Pan aktiv?
        if (panActiveRef.current) {
            setTransform((prev) => ({
                ...prev,
                x: ev.clientX - panActiveRef.current!.x,
                y: ev.clientY - panActiveRef.current!.y,
            }));
            return;
        }

        // Objekt ziehen
        if (draggingObjectRef.current && tool === "object") {
            const draggingId = draggingObjectRef.current;
            setDoc((prev) => {
                const next = cloneDoc(prev);
                const o = next.objects.find((x) => x.id === draggingId);
                if (!o) return prev;
                o.x = wx;
                o.y = wy;
                return next;
            });
            dirtyRef.current = true;
            return;
        }

        // Hover-Preview + fortgesetzter Pinselstrich
        if (tool === "brush" || tool === "erase") {
            const f = fieldAt(docRef.current, wx, wy);
            if (f) {
                setHoverCells(brushCells(docRef.current, f.col, f.row, brushSize - 1));
                if (strokeActiveRef.current && f) {
                    setDoc((prev) => {
                        const next = cloneDoc(prev);
                        for (const [c, r] of brushCells(next, f.col, f.row, brushSize - 1)) {
                            setFloor(next, c, r, tool === "erase" ? 0 : floorMat);
                        }
                        return next;
                    });
                    dirtyRef.current = true;
                }
            } else setHoverCells([]);
            setHoverEdge(null);
            return;
        }

        if (tool === "wall" || tool === "door") {
            const e = edgeAt(docRef.current, wx, wy, 0.3);
            setHoverEdge(e);
            setHoverCells([]);
            return;
        }

        setHoverCells([]);
        setHoverEdge(null);
    };

    const onPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
        const cv = canvasRef.current;
        if (cv) cv.releasePointerCapture(ev.pointerId);
        panActiveRef.current = null;
        if (draggingObjectRef.current) {
            draggingObjectRef.current = null;
            bumpAutosave();
        }
        if (strokeActiveRef.current) {
            endStroke();
        }
    };

    const onWheel = (ev: React.WheelEvent<HTMLCanvasElement>) => {
        ev.preventDefault();
        const cv = canvasRef.current;
        if (!cv) return;
        const rect = cv.getBoundingClientRect();
        const cx = ev.clientX - rect.left;
        const cy = ev.clientY - rect.top;
        const factor = ev.deltaY > 0 ? 0.9 : 1.1;
        setTransform((prev) => {
            const nextScale = Math.max(0.3, Math.min(4, prev.scale * factor));
            // Zoom am Cursor: Welt-Punkt soll gleich bleiben.
            const wx = (cx - prev.x) / (prev.tilePx * prev.scale);
            const wy = (cy - prev.y) / (prev.tilePx * prev.scale);
            return {
                ...prev,
                scale: nextScale,
                x: cx - wx * prev.tilePx * nextScale,
                y: cy - wy * prev.tilePx * nextScale,
            };
        });
    };

    // ---------- Keyboard: Undo / Redo / Space / Delete ----------
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            const isForm = tag === "INPUT" || tag === "TEXTAREA";
            if (!isForm && e.code === "Space") {
                spaceDownRef.current = true;
                e.preventDefault();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
                e.preventDefault();
                const prev = undoRef.current.doUndo(docRef.current);
                if (prev) {
                    setDoc(prev);
                    bumpAutosave();
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key.toLowerCase() === "z")) {
                e.preventDefault();
                const next = undoRef.current.doRedo(docRef.current);
                if (next) {
                    setDoc(next);
                    bumpAutosave();
                }
                return;
            }
            if (!isForm && (e.key === "Delete" || e.key === "Backspace")) {
                if (selectedObjectId) {
                    const next = cloneDoc(docRef.current);
                    next.objects = next.objects.filter((o) => o.id !== selectedObjectId);
                    setSelectedObjectId(null);
                    commit(next);
                    e.preventDefault();
                }
                if (selectedLabelId) {
                    const next = cloneDoc(docRef.current);
                    next.labels = next.labels.filter((l) => l.id !== selectedLabelId);
                    setSelectedLabelId(null);
                    commit(next);
                    e.preventDefault();
                }
                return;
            }
            if (!isForm && e.key.toLowerCase() === "r" && selectedObjectId) {
                // Objekt um 90 Grad drehen
                const next = cloneDoc(docRef.current);
                const o = next.objects.find((x) => x.id === selectedObjectId);
                if (o) {
                    o.rot = (o.rot || 0) + Math.PI / 2;
                    commit(next);
                }
                e.preventDefault();
                return;
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                spaceDownRef.current = false;
            }
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, [bumpAutosave, commit, selectedObjectId, selectedLabelId]);

    // ---------- Groessenaenderung ----------
    const [resizeW, setResizeW] = useState<string>("30");
    const [resizeH, setResizeH] = useState<string>("20");
    const applyResize = () => {
        const w = parseInt(resizeW, 10);
        const h = parseInt(resizeH, 10);
        if (!Number.isInteger(w) || !Number.isInteger(h) || w < 4 || h < 4 || w > 200 || h > 200) {
            alert("Groesse muss 4..200 pro Seite sein.");
            return;
        }
        if (w === docRef.current.width && h === docRef.current.height) return;
        if (!window.confirm(
            `Karte auf ${w} x ${h} ${w < docRef.current.width || h < docRef.current.height ? "verkleinern (abgeschnittene Zellen gehen verloren)" : "vergroessern"}?`
        )) return;
        const next = cloneDoc(docRef.current);
        const oldW = next.width, oldH = next.height;
        const nf = Array.from({ length: w * h }, () => 0);
        for (let r = 0; r < Math.min(h, oldH); r++) {
            for (let c = 0; c < Math.min(w, oldW); c++) {
                nf[r * w + c] = next.floor[r * oldW + c];
            }
        }
        next.width = w;
        next.height = h;
        next.floor = nf;
        next.walls = next.walls.filter(
            (wl) =>
                wl.a[0] <= w && wl.b[0] <= w && wl.a[1] <= h && wl.b[1] <= h
        );
        next.objects = next.objects.filter((o) => o.x >= 0 && o.x < w && o.y >= 0 && o.y < h);
        next.labels = next.labels.filter((l) => l.x >= 0 && l.x < w && l.y >= 0 && l.y < h);
        commit(next);
    };

    useEffect(() => {
        setResizeW(String(doc.width));
        setResizeH(String(doc.height));
    }, [doc.width, doc.height]);

    const renameMap = (val: string) => {
        setName(val);
        bumpAutosave();
    };

    if (loadError) {
        return (
            <div className="campaigns-root">
                <div className="campaigns-container">
                    <div className="campaigns-topbar">
                        <Link to="/kampagnen">&laquo; Zurück</Link>
                    </div>
                    <div className="load-error">{loadError}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="editor-root">
            <div className="editor-topbar">
                <div className="left">
                    <Link to="/karten" className="back">
                        &laquo; Karten
                    </Link>
                    <input
                        className="map-name-input"
                        value={name}
                        onChange={(e) => renameMap(e.target.value)}
                        maxLength={80}
                        placeholder="Kartenname"
                    />
                </div>
                <div className="right">
                    <span className={`save-status ${saveError ? "err" : saving ? "saving" : "ok"}`}>
                        {saveError
                            ? `Speicherfehler: ${saveError}`
                            : saving
                            ? "Speichere …"
                            : savedAt
                            ? `Gespeichert ${savedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
                            : "Noch nicht gespeichert"}
                    </span>
                    <button className="btn-rust" onClick={() => void saveNow()} disabled={saving}>
                        Speichern
                    </button>
                </div>
            </div>

            <div className="editor-body">
                <aside className="editor-tools">
                    <div className="group">
                        <div className="group-title">Werkzeug</div>
                        {([
                            ["brush", "Pinsel"],
                            ["fill", "Fläche"],
                            ["wall", "Wand"],
                            ["door", "Tür"],
                            ["object", "Objekt"],
                            ["label", "Text"],
                            ["erase", "Radierer"],
                            ["pan", "Verschieben"],
                        ] as Array<[ToolKey, string]>).map(([k, label]) => (
                            <button
                                key={k}
                                className={`tool-btn ${tool === k ? "active" : ""}`}
                                onClick={() => {
                                    setTool(k);
                                    setSelectedObjectId(null);
                                    setSelectedLabelId(null);
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {(tool === "brush" || tool === "fill" || tool === "erase") && (
                        <div className="group">
                            <div className="group-title">Material</div>
                            <div className="mat-grid">
                                {FLOOR_MATERIALS.map((m, i) => (
                                    <button
                                        key={m.key}
                                        className={`mat-swatch ${floorMat === i ? "active" : ""}`}
                                        style={{ background: m.base, borderColor: m.tint }}
                                        title={m.name}
                                        onClick={() => setFloorMat(i)}
                                    >
                                        <span className="label">{m.name}</span>
                                    </button>
                                ))}
                            </div>
                            {(tool === "brush" || tool === "erase") && (
                                <div className="brush-size">
                                    <label>Pinsel: {brushSize} Feld{brushSize === 1 ? "" : "er"}</label>
                                    <input
                                        type="range" min={1} max={6} step={1}
                                        value={brushSize}
                                        onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {tool === "object" && (
                        <div className="group">
                            <div className="group-title">Objekt</div>
                            <div className="obj-grid">
                                {OBJECT_STAMPS.map((s) => (
                                    <button
                                        key={s.key}
                                        className={`obj-swatch ${objectKey === s.key ? "active" : ""}`}
                                        title={s.name}
                                        onClick={() => setObjectKey(s.key)}
                                    >
                                        <StampThumb stampKey={s.key} />
                                        <span className="label">{s.name}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="brush-size">
                                <label>Drehung: {Math.round((objectRot * 180) / Math.PI)}°</label>
                                <input
                                    type="range" min={0} max={360} step={15}
                                    value={Math.round((objectRot * 180) / Math.PI)}
                                    onChange={(e) =>
                                        setObjectRot((parseInt(e.target.value, 10) * Math.PI) / 180)
                                    }
                                />
                            </div>
                            <div className="hint">
                                Objekt platziert? Klicke es an und drücke <b>R</b> für 90°, <b>Entf</b> zum
                                Löschen. Im Pinsel-Modus greift diese Liste nicht.
                            </div>
                        </div>
                    )}

                    <div className="group">
                        <div className="group-title">Karte</div>
                        <div className="resize-row">
                            <input type="number" min={4} max={200} value={resizeW}
                                onChange={(e) => setResizeW(e.target.value)} />
                            <span>×</span>
                            <input type="number" min={4} max={200} value={resizeH}
                                onChange={(e) => setResizeH(e.target.value)} />
                            <button onClick={applyResize}>↺</button>
                        </div>
                        <label className="toggle">
                            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                            Raster anzeigen
                        </label>
                        <div className="hint">
                            Mausrad: Zoom. Leertaste + Maus oder &bdquo;Verschieben&ldquo;: Pan.
                            Strg/⌘+Z = Rückgängig, Strg/⌘+Shift+Z = Wiederholen.
                        </div>
                    </div>
                </aside>

                <div className="editor-canvas-wrap">
                    <canvas
                        ref={canvasRef}
                        className="editor-canvas"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={(e) => {
                            setHoverCells([]);
                            setHoverEdge(null);
                            onPointerUp(e as any);
                        }}
                        onWheel={onWheel}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{
                            cursor:
                                tool === "pan" || spaceDownRef.current || panActiveRef.current
                                    ? "grab"
                                    : "crosshair",
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

// Kleine 32x32-Vorschau fuer die Palette (nutzt denselben Stamp).
const StampThumb: React.FC<{ stampKey: string }> = ({ stampKey }) => {
    const ref = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        const cv = ref.current;
        if (!cv) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = "#3a2a1b";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.save();
        ctx.translate(cv.width / 2, cv.height / 2);
        ctx.scale(cv.width * 0.85, cv.height * 0.85);
        const stamp = OBJECT_STAMPS.find((s) => s.key === stampKey);
        if (stamp) {
            try {
                stamp.draw(ctx);
            } catch {}
        }
        ctx.restore();
    }, [stampKey]);
    return <canvas ref={ref} width={32} height={32} />;
};

export default MapEditorPage;
// noop reference so palette import stays used
void floorIndex;
