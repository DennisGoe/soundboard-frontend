import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiService, { UserAssetDoc } from "../modules/api";
import "./campaigns.css";
import "./mapEditor.css";
import {
    EditorDoc,
    MapPath,
    PathKind,
    StampObject,
    UndoStack,
    WallStyle,
    brushCells,
    brushCellsFalloff,
    clone as cloneDoc,
    cornerPathToEdges,
    edgeAt,
    edgeKey,
    fieldAt,
    floodFill,
    labelAt,
    nearestCorner,
    newDoc,
    normalizeDoc,
    objectAt,
    objectsInRect,
    paintOverlay,
    pathAt,
    randomId,
    setFloor,
} from "../mapEditor/engine";
import {
    CATEGORY_LABEL,
    Category,
    FLOOR_MATERIALS,
    OBJECT_STAMPS,
    StampDef,
    searchStamps,
    stampByKey,
} from "../mapEditor/palette";
import {
    Transform,
    clientToWorld,
    render as renderMap,
} from "../mapEditor/renderer";

type ToolKey =
    | "brush"
    | "terrain"     // weicher Overlay-Pinsel
    | "fill"
    | "wall"
    | "wall-chain" // Linienzug
    | "door"
    | "window"
    | "object"
    | "path"
    | "select"     // Rechteck-Auswahl
    | "label"
    | "erase"
    | "pan";

const TILE_PX = 32;
const AUTOSAVE_MS = 2000;

const CATEGORIES: Category[] = [
    "natur", "moebel", "dungeon", "gebaeude", "wege", "bruecken", "lager", "wasser", "licht", "effekte", "eigene",
];

interface Clipboard { objects: StampObject[]; }

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
    const [overlayMat, setOverlayMat] = useState<number>(0); // fuer terrain-Tool
    const [brushSize, setBrushSize] = useState<number>(1);
    const [brushStrength, setBrushStrength] = useState<number>(60); // 0..255 fuer terrain
    const [objectKey, setObjectKey] = useState<string>(OBJECT_STAMPS[0].key);
    const [objectRot, setObjectRot] = useState<number>(0);
    const [showGrid, setShowGrid] = useState<boolean>(true);

    // Objekt-Palette: Kategorie + Suche
    const [cat, setCat] = useState<Category>("natur");
    const [search, setSearch] = useState<string>("");

    // Wand-Linienzug-Start
    const [wallChainStart, setWallChainStart] = useState<[number, number] | null>(null);
    const [wallStyle, setWallStyle] = useState<WallStyle>("stone");

    // Pfad-Tool: aktive Punkte waehrend des Zeichnens
    const [pathDraft, setPathDraft] = useState<[number, number][]>([]);
    const [pathKind, setPathKind] = useState<PathKind>("road");
    const [pathWidth, setPathWidth] = useState<number>(0.8);
    const [pathMat, setPathMat] = useState<number>(3); // Erde
    const [selectedPathId, setSelectedPathId] = useState<string | null>(null);

    // Rechteck-Auswahl
    const [selectRect, setSelectRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const selectStartRef = useRef<{ wx: number; wy: number } | null>(null);
    const [selectedObjectIds, setSelectedObjectIds] = useState<Set<string>>(new Set());
    const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

    // User-Assets ("Meine Assets")
    const [assets, setAssets] = useState<UserAssetDoc[]>([]);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const assetFileRef = useRef<HTMLInputElement | null>(null);
    const [assetName, setAssetName] = useState<string>("");
    const [assetCategory, setAssetCategory] = useState<string>("eigene");
    const [uploading, setUploading] = useState<boolean>(false);

    // Objekt-Bild-Cache fuer type='asset:*'
    const assetImgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

    const [transform, setTransform] = useState<Transform>({
        x: 40, y: 40, scale: 1, tilePx: TILE_PX,
    });

    const [hoverCells, setHoverCells] = useState<Array<[number, number]>>([]);
    const [hoverEdge, setHoverEdge] = useState<{ a: [number, number]; b: [number, number] } | null>(null);

    const undoRef = useRef<UndoStack>(new UndoStack(50));
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokeActiveRef = useRef<boolean>(false);
    const panActiveRef = useRef<{ x: number; y: number } | null>(null);
    const spaceDownRef = useRef<boolean>(false);
    const draggingObjectsRef = useRef<{ ids: string[]; startWX: number; startWY: number; origPos: Map<string, [number, number]> } | null>(null);
    const dirtyRef = useRef<boolean>(false);
    const docRef = useRef<EditorDoc>(doc); docRef.current = doc;
    const nameRef = useRef<string>(name); nameRef.current = name;
    const mapIdRef = useRef<string | null>(mapId); mapIdRef.current = mapId;
    const clipboardRef = useRef<Clipboard>({ objects: [] });

    // ---------- Assets laden ----------
    useEffect(() => {
        apiService.listAssets().then((r) => {
            setAssets(r.assets);
            for (const a of r.assets) ensureAssetImg(a.imageUrl);
        }).catch(() => {});
    }, []);

    function ensureAssetImg(url: string): HTMLImageElement {
        const cache = assetImgCacheRef.current;
        let img = cache.get(url);
        if (img) return img;
        img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { requestAnimationFrame(() => draw()); };
        img.src = url;
        cache.set(url, img);
        return img;
    }

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
                    setLoadError("Diese Karte ist kein 2D-Editor-Dokument.");
                    return;
                }
                setMapId(map._id);
                setName(map.name);
                const nd = normalizeDoc(map.doc);
                setDoc(nd);
                for (const o of nd.objects) if (o.assetUrl) ensureAssetImg(o.assetUrl);
                undoRef.current.clear();
                setSavedAt(new Date(map.updatedAt));
            } catch (e: any) {
                if (!cancelled) setLoadError(e?.msg || "Karte konnte nicht geladen werden.");
            }
        })();
        return () => { cancelled = true; };
    }, [id, isNew]);

    // ---------- Render ----------
    const draw = useCallback(() => {
        const cv = canvasRef.current;
        if (!cv) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        renderMap(ctx, docRef.current, transform, {
            showGrid,
            hoverCells,
            hoverEdge,
            hoverPath: tool === "path" && pathDraft.length >= 1 ? pathDraft : null,
            selectedObjectIds,
            selectedLabelId,
            selectedPathId,
            wallChainStart,
            selectRect,
            objectImageCache: assetImgCacheRef.current,
        });
    }, [transform, showGrid, hoverCells, hoverEdge, selectedObjectIds, selectedLabelId, selectedPathId, wallChainStart, selectRect, tool, pathDraft]);

    useEffect(() => { draw(); }, [draw, doc]);

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
        return () => { obs.disconnect(); window.removeEventListener("resize", resize); };
    }, [draw]);

    // ---------- Autosave ----------
    const saveNow = useCallback(async () => {
        if (!dirtyRef.current && mapIdRef.current) return;
        if (saving) return;
        setSaving(true); setSaveError(null);
        try {
            if (!mapIdRef.current) {
                const trimmed = nameRef.current.trim() || "Neue Karte";
                const { map } = await apiService.createMap({ name: trimmed, kind: "2d-editor", doc: docRef.current });
                setMapId(map._id); setSavedAt(new Date(map.updatedAt)); dirtyRef.current = false;
                navigate(`/karten/${map._id}/bearbeiten`, { replace: true });
            } else {
                const trimmed = nameRef.current.trim() || "Neue Karte";
                const { map } = await apiService.updateMap(mapIdRef.current, { name: trimmed, doc: docRef.current });
                setSavedAt(new Date(map.updatedAt)); dirtyRef.current = false;
            }
        } catch (e: any) {
            setSaveError(e?.msg || "Speichern fehlgeschlagen.");
        } finally { setSaving(false); }
    }, [navigate, saving]);

    const saveTimerRef = useRef<number | null>(null);
    const bumpAutosave = useCallback(() => {
        dirtyRef.current = true;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => { void saveNow(); }, AUTOSAVE_MS);
    }, [saveNow]);

    useEffect(() => {
        return () => {
            if (dirtyRef.current && mapIdRef.current) {
                void apiService.updateMap(mapIdRef.current, { name: nameRef.current.trim(), doc: docRef.current }).catch(() => {});
            }
        };
    }, []);

    // ---------- Mutations ----------
    const commit = useCallback((next: EditorDoc) => {
        undoRef.current.push(docRef.current);
        setDoc(next);
        bumpAutosave();
    }, [bumpAutosave]);

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

        // Pan
        if (ev.button === 1 || spaceDownRef.current || tool === "pan") {
            panActiveRef.current = { x: ev.clientX - transform.x, y: ev.clientY - transform.y };
            return;
        }

        if (tool === "brush") {
            const f = fieldAt(docRef.current, wx, wy);
            if (!f) return;
            beginStroke();
            const next = cloneDoc(docRef.current);
            for (const [c, r] of brushCells(next, f.col, f.row, brushSize - 1)) setFloor(next, c, r, floorMat);
            setDoc(next);
            return;
        }

        if (tool === "terrain") {
            const f = fieldAt(docRef.current, wx, wy);
            if (!f) return;
            beginStroke();
            const next = cloneDoc(docRef.current);
            for (const [c, r, falloff] of brushCellsFalloff(next, f.col, f.row, brushSize - 1)) {
                paintOverlay(next, c, r, overlayMat, Math.round(brushStrength * falloff));
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

        if (tool === "wall" || tool === "door" || tool === "window") {
            const e = edgeAt(docRef.current, wx, wy, 0.3);
            if (!e) return;
            const kind: "wall" | "door" | "window" = tool;
            const key = edgeKey(e.a, e.b);
            const next = cloneDoc(docRef.current);
            const existing = next.walls.findIndex((w) => edgeKey(w.a, w.b) === key);
            if (existing >= 0) {
                if (next.walls[existing].kind === kind) {
                    next.walls.splice(existing, 1);
                } else {
                    next.walls[existing] = { ...next.walls[existing], kind, style: kind === "wall" ? wallStyle : undefined };
                }
            } else {
                next.walls.push({ id: randomId("wall"), a: [e.a[0], e.a[1]], b: [e.b[0], e.b[1]], kind, style: kind === "wall" ? wallStyle : undefined });
            }
            commit(next);
            return;
        }

        if (tool === "wall-chain") {
            const corner = nearestCorner(docRef.current, wx, wy);
            if (!corner) return;
            if (!wallChainStart) { setWallChainStart(corner); return; }
            // Verbindungsstrecke von Start zu corner als Einheits-Kanten eintragen
            const edges = cornerPathToEdges(wallChainStart, corner);
            if (edges.length === 0) { setWallChainStart(corner); return; }
            const next = cloneDoc(docRef.current);
            for (const [a, b] of edges) {
                const key = edgeKey(a, b);
                const existing = next.walls.findIndex((w) => edgeKey(w.a, w.b) === key);
                if (existing < 0) {
                    next.walls.push({ id: randomId("wall"), a: [a[0], a[1]], b: [b[0], b[1]], kind: "wall", style: wallStyle });
                }
            }
            commit(next);
            setWallChainStart(corner);
            return;
        }

        if (tool === "object") {
            // Bestehendes Objekt greifen?
            const hit = objectAt(docRef.current, wx, wy);
            if (hit) {
                setSelectedObjectIds(new Set([hit.id]));
                setSelectedLabelId(null); setSelectedPathId(null);
                draggingObjectsRef.current = {
                    ids: [hit.id], startWX: wx, startWY: wy,
                    origPos: new Map([[hit.id, [hit.x, hit.y]]]),
                };
                return;
            }
            // Neu platzieren — entweder builtin-Stamp oder Asset
            const next = cloneDoc(docRef.current);
            let newObj: StampObject;
            if (selectedAssetId) {
                const asset = assets.find((a) => a._id === selectedAssetId);
                if (!asset) return;
                newObj = {
                    id: randomId("obj"), type: `asset:${asset._id}`, x: wx, y: wy, rot: objectRot, scale: 1,
                    sizeX: asset.width, sizeY: asset.height, assetUrl: asset.imageUrl, layer: "above",
                };
                ensureAssetImg(asset.imageUrl);
            } else {
                const s = stampByKey(objectKey);
                if (!s) return;
                newObj = {
                    id: randomId("obj"), type: s.key, x: wx, y: wy, rot: objectRot, scale: 1,
                    sizeX: s.defaultSize?.x, sizeY: s.defaultSize?.y, layer: "above",
                };
            }
            next.objects.push(newObj);
            setSelectedObjectIds(new Set([newObj.id]));
            setSelectedLabelId(null);
            draggingObjectsRef.current = {
                ids: [newObj.id], startWX: wx, startWY: wy,
                origPos: new Map([[newObj.id, [newObj.x, newObj.y]]]),
            };
            commit(next);
            return;
        }

        if (tool === "select") {
            // Treffer-Check: wenn man ein bereits selektiertes Objekt greift -> Multi-Drag.
            const hit = objectAt(docRef.current, wx, wy);
            if (hit && selectedObjectIds.has(hit.id)) {
                // Multi-Drag starten
                const origPos = new Map<string, [number, number]>();
                for (const o of docRef.current.objects) if (selectedObjectIds.has(o.id)) origPos.set(o.id, [o.x, o.y]);
                draggingObjectsRef.current = { ids: Array.from(selectedObjectIds), startWX: wx, startWY: wy, origPos };
                return;
            }
            if (hit && !ev.shiftKey) {
                setSelectedObjectIds(new Set([hit.id]));
                setSelectedLabelId(null); setSelectedPathId(null);
                draggingObjectsRef.current = {
                    ids: [hit.id], startWX: wx, startWY: wy, origPos: new Map([[hit.id, [hit.x, hit.y]]]),
                };
                return;
            }
            // Rechteck starten
            selectStartRef.current = { wx, wy };
            setSelectRect({ x0: wx, y0: wy, x1: wx, y1: wy });
            if (!ev.shiftKey) setSelectedObjectIds(new Set());
            return;
        }

        if (tool === "path") {
            setPathDraft((prev) => [...prev, [wx, wy]]);
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
            setSelectedLabelId(l.id); setSelectedObjectIds(new Set());
            commit(next);
            return;
        }

        if (tool === "erase") {
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
            const p = pathAt(docRef.current, wx, wy);
            if (p) {
                const next = cloneDoc(docRef.current);
                next.paths = (next.paths || []).filter((pp) => pp.id !== p.id);
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
                    if (next.overlay) next.overlay[r * next.width + c] = 0;
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

        if (panActiveRef.current) {
            setTransform((prev) => ({ ...prev, x: ev.clientX - panActiveRef.current!.x, y: ev.clientY - panActiveRef.current!.y }));
            return;
        }

        // Objekt(e) ziehen
        if (draggingObjectsRef.current) {
            const d = draggingObjectsRef.current;
            const dx = wx - d.startWX, dy = wy - d.startWY;
            setDoc((prev) => {
                const next = cloneDoc(prev);
                for (const o of next.objects) {
                    const orig = d.origPos.get(o.id);
                    if (!orig) continue;
                    o.x = orig[0] + dx;
                    o.y = orig[1] + dy;
                }
                return next;
            });
            dirtyRef.current = true;
            return;
        }

        // Rechteck-Auswahl ziehen
        if (selectStartRef.current && tool === "select") {
            setSelectRect({ x0: selectStartRef.current.wx, y0: selectStartRef.current.wy, x1: wx, y1: wy });
            return;
        }

        // Hover-Previews
        if (tool === "brush" || tool === "erase" || tool === "terrain") {
            const f = fieldAt(docRef.current, wx, wy);
            if (f) {
                setHoverCells(brushCells(docRef.current, f.col, f.row, brushSize - 1));
                if (strokeActiveRef.current && f) {
                    setDoc((prev) => {
                        const next = cloneDoc(prev);
                        if (tool === "brush") {
                            for (const [c, r] of brushCells(next, f.col, f.row, brushSize - 1)) setFloor(next, c, r, floorMat);
                        } else if (tool === "terrain") {
                            for (const [c, r, falloff] of brushCellsFalloff(next, f.col, f.row, brushSize - 1)) {
                                paintOverlay(next, c, r, overlayMat, Math.round(brushStrength * falloff));
                            }
                        } else {
                            for (const [c, r] of brushCells(next, f.col, f.row, brushSize - 1)) {
                                setFloor(next, c, r, 0);
                                if (next.overlay) next.overlay[r * next.width + c] = 0;
                            }
                        }
                        return next;
                    });
                    dirtyRef.current = true;
                }
            } else setHoverCells([]);
            setHoverEdge(null);
            return;
        }

        if (tool === "wall" || tool === "door" || tool === "window") {
            const e = edgeAt(docRef.current, wx, wy, 0.3);
            setHoverEdge(e);
            setHoverCells([]);
            return;
        }
        if (tool === "wall-chain") {
            const corner = nearestCorner(docRef.current, wx, wy);
            if (corner && wallChainStart) {
                // Vorschau
                setHoverEdge({ a: [wallChainStart[0], wallChainStart[1]], b: [corner[0], corner[1]] });
            } else {
                setHoverEdge(null);
            }
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
        if (draggingObjectsRef.current) {
            draggingObjectsRef.current = null;
            bumpAutosave();
        }
        if (strokeActiveRef.current) endStroke();

        // Rechteck-Auswahl abschliessen
        if (selectStartRef.current && selectRect) {
            const inside = objectsInRect(docRef.current, selectRect.x0, selectRect.y0, selectRect.x1, selectRect.y1);
            setSelectedObjectIds((prev) => {
                const n = new Set(prev);
                for (const o of inside) n.add(o.id);
                return n;
            });
            selectStartRef.current = null;
            setSelectRect(null);
        }
    };

    const onDoubleClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
        // Pfad-Tool: Doppelklick = Pfad abschliessen
        if (tool === "path" && pathDraft.length >= 2) {
            const next = cloneDoc(docRef.current);
            if (!next.paths) next.paths = [];
            next.paths.push({
                id: randomId("path"), kind: pathKind, points: pathDraft.map((p) => [p[0], p[1]] as [number, number]),
                width: pathWidth, material: pathMat,
            });
            commit(next);
            setPathDraft([]);
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
            const wx = (cx - prev.x) / (prev.tilePx * prev.scale);
            const wy = (cy - prev.y) / (prev.tilePx * prev.scale);
            return { ...prev, scale: nextScale, x: cx - wx * prev.tilePx * nextScale, y: cy - wy * prev.tilePx * nextScale };
        });
    };

    // ---------- Keyboard ----------
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            const isForm = tag === "INPUT" || tag === "TEXTAREA";
            if (!isForm && e.code === "Space") { spaceDownRef.current = true; e.preventDefault(); return; }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
                e.preventDefault();
                const prev = undoRef.current.doUndo(docRef.current);
                if (prev) { setDoc(prev); bumpAutosave(); }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
                e.preventDefault();
                const next = undoRef.current.doRedo(docRef.current);
                if (next) { setDoc(next); bumpAutosave(); }
                return;
            }
            if (!isForm && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
                // Copy
                if (selectedObjectIds.size > 0) {
                    const objs = docRef.current.objects.filter((o) => selectedObjectIds.has(o.id));
                    clipboardRef.current = { objects: objs.map((o) => ({ ...o })) };
                    e.preventDefault();
                }
                return;
            }
            if (!isForm && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
                // Paste bei Original-Position + Offset
                if (clipboardRef.current.objects.length === 0) return;
                const next = cloneDoc(docRef.current);
                const newIds: string[] = [];
                for (const o of clipboardRef.current.objects) {
                    const nid = randomId("obj");
                    next.objects.push({ ...o, id: nid, x: o.x + 1, y: o.y + 1 });
                    newIds.push(nid);
                }
                setSelectedObjectIds(new Set(newIds));
                commit(next);
                e.preventDefault();
                return;
            }
            if (!isForm && (e.key === "Delete" || e.key === "Backspace")) {
                if (selectedObjectIds.size > 0) {
                    const next = cloneDoc(docRef.current);
                    next.objects = next.objects.filter((o) => !selectedObjectIds.has(o.id));
                    setSelectedObjectIds(new Set());
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
                if (selectedPathId) {
                    const next = cloneDoc(docRef.current);
                    next.paths = (next.paths || []).filter((p) => p.id !== selectedPathId);
                    setSelectedPathId(null);
                    commit(next);
                    e.preventDefault();
                }
                return;
            }
            if (!isForm && e.key.toLowerCase() === "r" && selectedObjectIds.size > 0) {
                const next = cloneDoc(docRef.current);
                for (const o of next.objects) if (selectedObjectIds.has(o.id)) o.rot = (o.rot || 0) + Math.PI / 2;
                commit(next); e.preventDefault(); return;
            }
            if (!isForm && (e.key === "Enter" || e.key === "Return") && tool === "path" && pathDraft.length >= 2) {
                const next = cloneDoc(docRef.current);
                if (!next.paths) next.paths = [];
                next.paths.push({ id: randomId("path"), kind: pathKind, points: pathDraft.map((p) => [p[0], p[1]] as [number, number]), width: pathWidth, material: pathMat });
                commit(next); setPathDraft([]);
                e.preventDefault(); return;
            }
            if (e.key === "Escape") {
                setPathDraft([]); setWallChainStart(null); setSelectedObjectIds(new Set());
                setSelectedLabelId(null); setSelectedPathId(null);
                return;
            }
        };
        const onKeyUp = (e: KeyboardEvent) => { if (e.code === "Space") spaceDownRef.current = false; };
        window.addEventListener("keydown", onKey);
        window.addEventListener("keyup", onKeyUp);
        return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
    }, [bumpAutosave, commit, selectedObjectIds, selectedLabelId, selectedPathId, tool, pathDraft, pathKind, pathWidth, pathMat]);

    // ---------- Groessenaenderung ----------
    const [resizeW, setResizeW] = useState<string>("30");
    const [resizeH, setResizeH] = useState<string>("20");
    const applyResize = () => {
        const w = parseInt(resizeW, 10);
        const h = parseInt(resizeH, 10);
        if (!Number.isInteger(w) || !Number.isInteger(h) || w < 4 || h < 4 || w > 200 || h > 200) {
            alert("Größe muss 4..200 pro Seite sein.");
            return;
        }
        if (w === docRef.current.width && h === docRef.current.height) return;
        if (!window.confirm(`Karte auf ${w} x ${h} ${w < docRef.current.width || h < docRef.current.height ? "verkleinern (abgeschnittene Zellen gehen verloren)" : "vergrößern"}?`)) return;
        const next = cloneDoc(docRef.current);
        const oldW = next.width, oldH = next.height;
        const nf = Array.from({ length: w * h }, () => 0);
        const no = Array.from({ length: w * h }, () => 0);
        const nom = Array.from({ length: w * h }, () => 0);
        for (let r = 0; r < Math.min(h, oldH); r++) {
            for (let c = 0; c < Math.min(w, oldW); c++) {
                nf[r * w + c] = next.floor[r * oldW + c];
                if (next.overlay) no[r * w + c] = next.overlay[r * oldW + c];
                if (next.overlayMat) nom[r * w + c] = next.overlayMat[r * oldW + c];
            }
        }
        next.width = w; next.height = h; next.floor = nf; next.overlay = no; next.overlayMat = nom;
        next.walls = next.walls.filter((wl) => wl.a[0] <= w && wl.b[0] <= w && wl.a[1] <= h && wl.b[1] <= h);
        next.objects = next.objects.filter((o) => o.x >= 0 && o.x < w && o.y >= 0 && o.y < h);
        next.labels = next.labels.filter((l) => l.x >= 0 && l.x < w && l.y >= 0 && l.y < h);
        if (next.paths) next.paths = next.paths.filter((p) => p.points.every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h));
        commit(next);
    };

    useEffect(() => { setResizeW(String(doc.width)); setResizeH(String(doc.height)); }, [doc.width, doc.height]);

    const renameMap = (val: string) => { setName(val); bumpAutosave(); };

    // ---------- Asset-Upload ----------
    const onUploadAsset = async (f: File) => {
        setUploading(true);
        try {
            const nm = assetName.trim() || f.name.replace(/\.[^/.]+$/, "");
            const r = await apiService.uploadAsset(f, { name: nm, category: assetCategory, tags: [] });
            setAssets((prev) => [r.asset, ...prev]);
            ensureAssetImg(r.asset.imageUrl);
            setSelectedAssetId(r.asset._id);
            setAssetName("");
        } catch (e: any) {
            alert(e?.msg || "Upload fehlgeschlagen");
        } finally {
            setUploading(false);
            if (assetFileRef.current) assetFileRef.current.value = "";
        }
    };

    // ---------- Selektion-Ops ----------
    const transformSelected = (fn: (o: StampObject) => void) => {
        if (selectedObjectIds.size === 0) return;
        const next = cloneDoc(docRef.current);
        for (const o of next.objects) if (selectedObjectIds.has(o.id)) fn(o);
        commit(next);
    };
    const rotateSel = (deg: number) => transformSelected((o) => { o.rot = (o.rot || 0) + (deg * Math.PI) / 180; });
    const scaleSel = (delta: number) => transformSelected((o) => { o.scale = Math.max(0.3, Math.min(6, (o.scale || 1) + delta)); });
    const flipSel = (axis: "x" | "y") => transformSelected((o) => { if (axis === "x") o.flipX = !o.flipX; else o.flipY = !o.flipY; });
    const layerSel = (layer: "below" | "above") => transformSelected((o) => { o.layer = layer; });

    // ---------- Palette-Anzeige ----------
    const visibleStamps = useMemo<Array<StampDef | UserAssetDoc>>(() => {
        if (search.trim()) {
            const s = searchStamps(search);
            // Zusaetzlich eigene Assets, deren Name matcht
            const q = search.trim().toLowerCase();
            const my = assets.filter((a) => a.name.toLowerCase().includes(q) || (a.tags || []).some((t) => t.toLowerCase().includes(q)));
            return [...s, ...my];
        }
        if (cat === "eigene") return assets;
        return OBJECT_STAMPS.filter((s) => s.category === cat);
    }, [cat, search, assets]);

    if (loadError) {
        return (
            <div className="campaigns-root">
                <div className="campaigns-container">
                    <div className="campaigns-topbar"><Link to="/kampagnen">&laquo; Zurück</Link></div>
                    <div className="load-error">{loadError}</div>
                </div>
            </div>
        );
    }

    const selCount = selectedObjectIds.size;

    return (
        <div className="editor-root">
            <div className="editor-topbar">
                <div className="left">
                    <Link to="/karten" className="back">&laquo; Karten</Link>
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
                        {saveError ? `Speicherfehler: ${saveError}` : saving ? "Speichere …"
                        : savedAt ? `Gespeichert ${savedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "Noch nicht gespeichert"}
                    </span>
                    <button className="btn-rust" onClick={() => void saveNow()} disabled={saving}>Speichern</button>
                </div>
            </div>

            <div className="editor-body">
                <aside className="editor-tools">
                    <div className="group">
                        <div className="group-title">Werkzeug</div>
                        {([
                            ["brush", "Pinsel (hart)"],
                            ["terrain", "Terrain-Pinsel (weich)"],
                            ["fill", "Flächenfüllen"],
                            ["wall", "Wand"],
                            ["wall-chain", "Wand-Linienzug"],
                            ["door", "Tür"],
                            ["window", "Fenster"],
                            ["path", "Straße / Fluss / Brücke"],
                            ["object", "Objekt"],
                            ["select", "Auswahl"],
                            ["label", "Text"],
                            ["erase", "Radierer"],
                            ["pan", "Verschieben"],
                        ] as Array<[ToolKey, string]>).map(([k, label]) => (
                            <button
                                key={k}
                                data-tool={k}
                                className={`tool-btn ${tool === k ? "active" : ""}`}
                                onClick={() => {
                                    setTool(k);
                                    if (k !== "select") setSelectedLabelId(null);
                                    if (k !== "object" && k !== "select") setSelectedObjectIds(new Set());
                                    if (k !== "wall-chain") setWallChainStart(null);
                                    if (k !== "path") setPathDraft([]);
                                }}
                            >{label}</button>
                        ))}
                    </div>

                    {(tool === "brush" || tool === "fill" || tool === "erase") && (
                        <div className="group">
                            <div className="group-title">Boden-Material</div>
                            <div className="mat-grid">
                                {FLOOR_MATERIALS.map((m, i) => (
                                    <button key={m.key} className={`mat-swatch ${floorMat === i ? "active" : ""}`}
                                        style={{ background: m.base, borderColor: m.tint }} title={m.name}
                                        onClick={() => setFloorMat(i)}>
                                        <span className="label">{m.name}</span>
                                    </button>
                                ))}
                            </div>
                            {(tool === "brush" || tool === "erase") && (
                                <div className="brush-size">
                                    <label>Pinsel: {brushSize} Feld{brushSize === 1 ? "" : "er"}</label>
                                    <input type="range" min={1} max={8} step={1}
                                        value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value, 10))} />
                                </div>
                            )}
                        </div>
                    )}

                    {tool === "terrain" && (
                        <div className="group">
                            <div className="group-title">Weicher Terrain-Pinsel</div>
                            <div className="hint">Malt einen zweiten Layer mit sanften Übergängen über den Boden. Gut für Übergänge Wald/Wiese, matschige Pfade, Schneedecken.</div>
                            <div className="mat-grid" style={{ marginTop: 8 }}>
                                {FLOOR_MATERIALS.map((m, i) => (
                                    <button key={m.key} className={`mat-swatch ${overlayMat === i ? "active" : ""}`}
                                        style={{ background: m.base, borderColor: m.tint }} title={m.name}
                                        onClick={() => setOverlayMat(i)}>
                                        <span className="label">{m.name}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="brush-size">
                                <label>Radius: {brushSize}</label>
                                <input type="range" min={1} max={8} step={1}
                                    value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value, 10))} />
                            </div>
                            <div className="brush-size">
                                <label>Stärke: {brushStrength}</label>
                                <input type="range" min={10} max={200} step={5}
                                    value={brushStrength} onChange={(e) => setBrushStrength(parseInt(e.target.value, 10))} />
                            </div>
                        </div>
                    )}

                    {(tool === "wall" || tool === "wall-chain") && (
                        <div className="group">
                            <div className="group-title">Wand-Stil</div>
                            <div className="wall-opts">
                                <label>Stil
                                    <select value={wallStyle} onChange={(e) => setWallStyle(e.target.value as WallStyle)}>
                                        <option value="stone">Stein (dunkel)</option>
                                        <option value="wood">Holz (braun)</option>
                                    </select>
                                </label>
                            </div>
                            {tool === "wall-chain" && (
                                <div className="hint">
                                    Klicke die Ecken nacheinander an. Jeder Klick verlängert den Zug um
                                    gerade Strecken (L-Form für Diagonalen). <b>Esc</b> bricht ab.
                                </div>
                            )}
                        </div>
                    )}

                    {tool === "path" && (
                        <div className="group">
                            <div className="group-title">Pfad-Werkzeug</div>
                            <div className="hint">
                                Klicke die Stützpunkte. <b>Enter</b> oder Doppelklick schließt den Pfad ab.
                            </div>
                            <div className="path-opts">
                                <label>Art
                                    <select value={pathKind} onChange={(e) => setPathKind(e.target.value as PathKind)}>
                                        <option value="road">Straße / Weg</option>
                                        <option value="river">Fluss</option>
                                        <option value="bridge-wood">Brücke (Holz)</option>
                                        <option value="bridge-stone">Brücke (Stein)</option>
                                    </select>
                                </label>
                                <label>Breite ({pathWidth.toFixed(1)} F)
                                    <input type="range" min={0.3} max={4} step={0.1}
                                        value={pathWidth} onChange={(e) => setPathWidth(Number(e.target.value))} />
                                </label>
                                <label>Belag
                                    <select value={pathMat} onChange={(e) => setPathMat(parseInt(e.target.value, 10))}>
                                        {FLOOR_MATERIALS.map((m, i) => (<option key={m.key} value={i}>{m.name}</option>))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    )}

                    {tool === "object" && (
                        <div className="group">
                            <div className="group-title">Objekt-Bibliothek</div>
                            <input className="search-input" placeholder="Suchen (z.B. baum, tisch, haus…)" value={search} onChange={(e) => setSearch(e.target.value)} />
                            {!search.trim() && (
                                <div className="category-row">
                                    {CATEGORIES.map((c) => (
                                        <button key={c} className={`cat-btn ${cat === c ? "active" : ""}`}
                                            onClick={() => { setCat(c); setSelectedAssetId(null); }}>
                                            {CATEGORY_LABEL[c]}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="obj-grid">
                                {visibleStamps.map((item) => {
                                    const isAsset = "imageUrl" in item;
                                    const key = isAsset ? `asset:${(item as UserAssetDoc)._id}` : (item as StampDef).key;
                                    const name = (item as any).name;
                                    const active = isAsset ? selectedAssetId === (item as UserAssetDoc)._id : (objectKey === key && !selectedAssetId);
                                    return (
                                        <button key={key} className={`obj-swatch ${active ? "active" : ""}`}
                                            title={name}
                                            onClick={() => {
                                                if (isAsset) {
                                                    setSelectedAssetId((item as UserAssetDoc)._id);
                                                } else {
                                                    setObjectKey((item as StampDef).key);
                                                    setSelectedAssetId(null);
                                                }
                                            }}>
                                            {isAsset
                                                ? <img src={(item as UserAssetDoc).imageUrl} alt={name} width={32} height={32} style={{ objectFit: "contain" }} />
                                                : <StampThumb stampKey={(item as StampDef).key} />}
                                            <span className="label">{name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="brush-size">
                                <label>Drehung: {Math.round((objectRot * 180) / Math.PI)}°</label>
                                <input type="range" min={0} max={360} step={15}
                                    value={Math.round((objectRot * 180) / Math.PI)}
                                    onChange={(e) => setObjectRot((parseInt(e.target.value, 10) * Math.PI) / 180)} />
                            </div>
                            <div className="hint">
                                <b>R</b> dreht die Auswahl um 90°, <b>Entf</b> löscht, <b>Strg+C/V</b> kopiert/fügt ein.
                            </div>
                        </div>
                    )}

                    <div className="group">
                        <div className="group-title">Karte</div>
                        <div className="resize-row">
                            <input type="number" min={4} max={200} value={resizeW} onChange={(e) => setResizeW(e.target.value)} />
                            <span>×</span>
                            <input type="number" min={4} max={200} value={resizeH} onChange={(e) => setResizeH(e.target.value)} />
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
                        onDoubleClick={onDoubleClick}
                        onWheel={onWheel}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ cursor: tool === "pan" || spaceDownRef.current || panActiveRef.current ? "grab" : "crosshair" }}
                    />
                </div>

                <aside className="editor-right">
                    {selCount > 0 && (
                        <div className="group">
                            <div className="group-title">Auswahl ({selCount})</div>
                            <div className="transform-ops">
                                <button onClick={() => rotateSel(-15)}>↺ 15°</button>
                                <button onClick={() => rotateSel(15)}>↻ 15°</button>
                                <button onClick={() => rotateSel(90)}>↻ 90°</button>
                                <button onClick={() => scaleSel(-0.1)}>−</button>
                                <button onClick={() => scaleSel(0.1)}>+</button>
                                <button onClick={() => flipSel("x")}>⇔ X</button>
                                <button onClick={() => flipSel("y")}>⇕ Y</button>
                            </div>
                            <div className="layer-toggle" style={{ marginTop: 6 }}>
                                <button onClick={() => layerSel("below")}>Unterste Ebene</button>
                                <button onClick={() => layerSel("above")}>Oberste Ebene</button>
                            </div>
                            <div className="selection-ops" style={{ marginTop: 8 }}>
                                <button onClick={() => {
                                    const objs = docRef.current.objects.filter((o) => selectedObjectIds.has(o.id));
                                    clipboardRef.current = { objects: objs.map((o) => ({ ...o })) };
                                }}>Kopieren</button>
                                <button className="danger" onClick={() => {
                                    const next = cloneDoc(docRef.current);
                                    next.objects = next.objects.filter((o) => !selectedObjectIds.has(o.id));
                                    setSelectedObjectIds(new Set());
                                    commit(next);
                                }}>Löschen</button>
                            </div>
                        </div>
                    )}

                    <div className="group">
                        <div className="group-title">Meine Assets</div>
                        <div className="asset-upload-row">
                            <input
                                type="text" placeholder="Name"
                                value={assetName}
                                onChange={(e) => setAssetName(e.target.value)}
                                className="search-input"
                                maxLength={60}
                            />
                            <input
                                type="text" placeholder="Kategorie (optional)"
                                value={assetCategory}
                                onChange={(e) => setAssetCategory(e.target.value)}
                                className="search-input"
                                maxLength={24}
                            />
                            <button onClick={() => assetFileRef.current?.click()} disabled={uploading}>
                                {uploading ? "Lade hoch…" : "Bild hochladen (PNG/JPG, max 3 MB)"}
                            </button>
                            <input ref={assetFileRef} type="file" accept="image/png,image/jpeg,image/webp"
                                style={{ display: "none" }}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadAsset(f); }} />
                            <small>Lizenz: eigene Bilder. Firebase-Bucket.</small>
                        </div>
                        {assets.length > 0 && (
                            <div style={{ marginTop: 10, maxHeight: 240, overflowY: "auto" }}>
                                {assets.map((a) => (
                                    <div key={a._id} className="my-asset-item">
                                        <img src={a.imageUrl} alt={a.name} />
                                        <span className="nm">{a.name}</span>
                                        <button className="del" title="Löschen"
                                            onClick={async () => {
                                                if (!window.confirm(`Asset „${a.name}" wirklich löschen?`)) return;
                                                try {
                                                    await apiService.deleteAsset(a._id);
                                                    setAssets((prev) => prev.filter((x) => x._id !== a._id));
                                                    if (selectedAssetId === a._id) setSelectedAssetId(null);
                                                } catch (e: any) { alert(e?.msg || "Löschen fehlgeschlagen"); }
                                            }}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="group">
                        <div className="group-title">Statistik</div>
                        <div className="hint" style={{ fontStyle: "normal" }}>
                            Boden: {doc.width}×{doc.height}<br />
                            Wände: {doc.walls.length}<br />
                            Objekte: {doc.objects.length}<br />
                            Pfade: {doc.paths?.length || 0}<br />
                            Labels: {doc.labels.length}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

// 32x32-Vorschau
const StampThumb: React.FC<{ stampKey: string }> = ({ stampKey }) => {
    const ref = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        const cv = ref.current; if (!cv) return;
        const ctx = cv.getContext("2d"); if (!ctx) return;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = "#3a2a1b"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.save();
        ctx.translate(cv.width / 2, cv.height / 2);
        ctx.scale(cv.width * 0.85, cv.height * 0.85);
        const stamp = stampByKey(stampKey);
        if (stamp) { try { stamp.draw(ctx); } catch {} }
        ctx.restore();
    }, [stampKey]);
    return <canvas ref={ref} width={32} height={32} />;
};

export default MapEditorPage;
