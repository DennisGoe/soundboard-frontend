import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiService, { Campaign, MapListItem, PlayerRef, UserHit } from "../modules/api";
import "./campaigns.css";
import "./game.css";

type Tab = "maps" | "players";

const CampaignDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [maps, setMaps] = useState<MapListItem[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("maps");

    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [mutationError, setMutationError] = useState<string | null>(null);
    const [addMapId, setAddMapId] = useState<string>("");

    const load = useCallback(async () => {
        if (!id) return;
        setLoadError(null);
        try {
            const [cRes, mRes] = await Promise.all([
                apiService.getCampaign(id),
                apiService.listMaps(),
            ]);
            setCampaign(cRes.campaign);
            setMaps(mRes.maps);
        } catch (e: any) {
            setLoadError(e?.msg || "Kampagne konnte nicht geladen werden.");
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    const mapById = useMemo(() => {
        const m = new Map<string, MapListItem>();
        (maps || []).forEach((it) => m.set(it._id, it));
        return m;
    }, [maps]);

    const assignedMaps: MapListItem[] = useMemo(() => {
        if (!campaign) return [];
        return campaign.mapIds
            .map((mid) => mapById.get(mid))
            .filter((x): x is MapListItem => !!x);
    }, [campaign, mapById]);

    const availableMaps: MapListItem[] = useMemo(() => {
        if (!campaign || !maps) return [];
        const assigned = new Set(campaign.mapIds);
        return maps.filter((m) => !assigned.has(m._id));
    }, [campaign, maps]);

    const isOwner = campaign?.role === "owner";

    const removeMap = async (mid: string) => {
        if (!campaign || !isOwner) return;
        setMutationError(null);
        try {
            const next = campaign.mapIds.filter((x) => x !== mid);
            const { campaign: updated } = await apiService.updateCampaign(campaign._id, {
                mapIds: next,
            });
            setCampaign(updated);
        } catch (e: any) {
            setMutationError(e?.msg || "Entfernen fehlgeschlagen.");
        }
    };

    const addMap = async () => {
        if (!campaign || !addMapId || !isOwner) return;
        setMutationError(null);
        try {
            const next = [...campaign.mapIds, addMapId];
            const { campaign: updated } = await apiService.updateCampaign(campaign._id, {
                mapIds: next,
            });
            setCampaign(updated);
            setAddMapId("");
        } catch (e: any) {
            setMutationError(e?.msg || "Hinzufügen fehlgeschlagen.");
        }
    };

    const addPlayer = async (userId: string) => {
        if (!campaign || !isOwner) return;
        setMutationError(null);
        try {
            const { campaign: updated } = await apiService.addPlayer(campaign._id, userId);
            setCampaign(updated);
        } catch (e: any) {
            setMutationError(e?.msg || "Spieler konnte nicht hinzugefügt werden.");
        }
    };

    const removePlayer = async (userId: string) => {
        if (!campaign || !isOwner) return;
        setMutationError(null);
        try {
            const { campaign: updated } = await apiService.removePlayer(campaign._id, userId);
            setCampaign(updated);
        } catch (e: any) {
            setMutationError(e?.msg || "Spieler konnte nicht entfernt werden.");
        }
    };

    const onMapUploaded = async () => {
        await load();
    };

    if (loadError) {
        return (
            <div className="campaigns-root">
                <div className="campaigns-container">
                    <div className="campaigns-topbar">
                        <Link to="/kampagnen">&laquo; Alle Kampagnen</Link>
                    </div>
                    <div className="load-error">{loadError}</div>
                </div>
            </div>
        );
    }

    if (!campaign) {
        return (
            <div className="campaigns-root">
                <div className="campaigns-container">
                    <div className="loading">Lade Kampagne &hellip;</div>
                </div>
            </div>
        );
    }

    return (
        <div className="campaigns-root">
            <div className="campaigns-container">
                <div className="campaigns-topbar">
                    <Link to="/kampagnen">&laquo; Alle Kampagnen</Link>
                    <Link to="/board">Zum Soundboard</Link>
                </div>

                <div className="detail-banner">
                    <div className="kicker">
                        {isOwner ? "Kampagne — Spielleiter" : "Kampagne — Spieler"}
                    </div>
                    <h1>{campaign.name}</h1>
                    <div className="banner-actions">
                        <Link
                            to={`/kampagnen/${campaign._id}/spiel`}
                            style={{
                                fontFamily: "Cinzel, serif",
                                fontSize: 11,
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                padding: "6px 12px",
                                borderRadius: 3,
                                background: "rgba(155, 42, 30, 0.35)",
                                color: "#f6e6c6",
                                border: "1px solid #4a0f08",
                                textDecoration: "none",
                            }}
                        >
                            Spielbrett
                        </Link>
                        {isOwner && (
                            <>
                                <button onClick={() => setShowEdit(true)}>Bearbeiten</button>
                                <button className="danger" onClick={() => setShowDelete(true)}>
                                    Löschen
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="detail-tabs">
                    <button
                        className={`tab ${tab === "maps" ? "active" : ""}`}
                        onClick={() => setTab("maps")}
                    >
                        Karten ({campaign.mapIds.length})
                    </button>
                    <button
                        className={`tab ${tab === "players" ? "active" : ""}`}
                        onClick={() => setTab("players")}
                    >
                        Spieler ({campaign.players.length})
                    </button>
                </div>

                {campaign.description && (
                    <div className="detail-description">
                        <div className="label">Beschreibung</div>
                        {campaign.description}
                    </div>
                )}

                {mutationError && <div className="load-error">{mutationError}</div>}

                {tab === "maps" && (
                    <>
                        <div className="section-title">Zugewiesene Karten</div>
                        {maps === null ? (
                            <div className="loading">Lade Karten &hellip;</div>
                        ) : assignedMaps.length === 0 ? (
                            <div className="muted" style={{ padding: "6px 2px 10px" }}>
                                {isOwner
                                    ? "Noch keine Karten zugewiesen — füge unten eine hinzu."
                                    : "Noch keine Karten zugewiesen."}
                            </div>
                        ) : (
                            <div>
                                {assignedMaps.map((m) => (
                                    <div key={m._id} className="map-row">
                                        <div className="left">
                                            <span className="pill light">
                                                {m.kind === "2d-image"
                                                    ? "Bild"
                                                    : m.kind === "2d-editor"
                                                    ? "2D"
                                                    : m.isExample
                                                    ? "Beispiel"
                                                    : "3D"}
                                            </span>
                                            <span className="name">{m.name}</span>
                                        </div>
                                        <div className="right">
                                            {m.kind === "2d-editor" && isOwner && !m.isExample && (
                                                <Link
                                                    className="open-link"
                                                    to={`/karten/${m._id}/bearbeiten`}
                                                >
                                                    Im 2D-Editor öffnen
                                                </Link>
                                            )}
                                            {(m.kind === "3d" || !m.kind) && (
                                                <a
                                                    className="open-link"
                                                    href={`/bilder/?map=${m._id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    Im Builder öffnen
                                                </a>
                                            )}
                                            {isOwner && (
                                                <button
                                                    className="remove-btn"
                                                    onClick={() => removeMap(m._id)}
                                                >
                                                    Entfernen
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {isOwner && (
                            <>
                                {availableMaps.length > 0 && (
                                    <>
                                        <div className="section-title">Karte hinzufügen</div>
                                        <div className="add-map-row">
                                            <select
                                                value={addMapId}
                                                onChange={(e) => setAddMapId(e.target.value)}
                                            >
                                                <option value="">
                                                    &mdash; Karte auswählen &mdash;
                                                </option>
                                                {availableMaps.map((m) => (
                                                    <option key={m._id} value={m._id}>
                                                        {m.name}
                                                        {m.kind === "2d-image"
                                                            ? " (Bild)"
                                                            : m.kind === "2d-editor"
                                                            ? " (2D)"
                                                            : m.isExample
                                                            ? " (Beispiel)"
                                                            : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                className="btn-rust"
                                                onClick={addMap}
                                                disabled={!addMapId}
                                            >
                                                Hinzufügen
                                            </button>
                                        </div>
                                    </>
                                )}
                                <div className="section-title">Neue Karte</div>
                                <div className="add-map-row" style={{ gap: 10 }}>
                                    <Link
                                        to="/karten/neu"
                                        className="btn-rust"
                                        style={{
                                            textDecoration: "none",
                                            display: "inline-flex",
                                            alignItems: "center",
                                        }}
                                    >
                                        + 2D-Karte bauen
                                    </Link>
                                    <div style={{ color: "#cbb989", fontStyle: "italic", fontSize: 13 }}>
                                        Öffnet den 2D-Editor. Nach dem Speichern kannst du die Karte oben
                                        zuweisen.
                                    </div>
                                </div>
                                <div className="section-title">Bild als Karte hochladen</div>
                                <UploadImageRow onUploaded={onMapUploaded} />
                                {maps !== null && availableMaps.length === 0 && (
                                    <div className="muted" style={{ marginTop: 10 }}>
                                        Alle verfügbaren Karten sind bereits zugewiesen.
                                        Lege im{" "}
                                        <a
                                            href="/bilder/"
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: "#e6c56a" }}
                                        >
                                            Builder
                                        </a>{" "}
                                        eine neue an oder lade oben ein Bild hoch.
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {tab === "players" && (
                    <PlayersTab
                        campaign={campaign}
                        isOwner={!!isOwner}
                        onAdd={addPlayer}
                        onRemove={removePlayer}
                    />
                )}
            </div>

            {showEdit && isOwner && (
                <EditCampaignDialog
                    campaign={campaign}
                    onCancel={() => setShowEdit(false)}
                    onSaved={(c) => {
                        setShowEdit(false);
                        setCampaign(c);
                    }}
                />
            )}
            {showDelete && isOwner && (
                <DeleteDialog
                    name={campaign.name}
                    onCancel={() => setShowDelete(false)}
                    onConfirm={async () => {
                        await apiService.deleteCampaign(campaign._id);
                        navigate("/kampagnen");
                    }}
                />
            )}
        </div>
    );
};

// --- Hilfs-Komponenten ---

interface UploadRowProps {
    onUploaded: () => void | Promise<void>;
}
const UploadImageRow: React.FC<UploadRowProps> = ({ onUploaded }) => {
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setError(null);
        if (!file) { setError("Bitte wähle ein Bild."); return; }
        const n = name.trim();
        if (!n) { setError("Bitte gib einen Namen an."); return; }
        if (file.size > 15 * 1024 * 1024) {
            setError("Maximal 15 MB.");
            return;
        }
        setBusy(true);
        try {
            await apiService.uploadMapImage(file, n);
            setFile(null);
            setName("");
            await onUploaded();
        } catch (e: any) {
            setError(e?.msg || "Upload fehlgeschlagen.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="add-map-row" style={{ flexWrap: "wrap" }}>
            <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
                }}
                style={{ color: "#e6c56a" }}
            />
            <input
                type="text"
                value={name}
                placeholder="Name der Karte"
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                style={{
                    flex: 1,
                    background: "#1b120a",
                    color: "#e6c56a",
                    border: "1px solid rgba(194, 160, 83, 0.4)",
                    padding: "8px 10px",
                    borderRadius: 3,
                    fontFamily: "Crimson Text, Georgia, serif",
                    fontSize: 14,
                }}
            />
            <button className="btn-rust" onClick={submit} disabled={busy || !file}>
                {busy ? "..." : "Hochladen"}
            </button>
            {error && <div className="error-text" style={{ width: "100%" }}>{error}</div>}
        </div>
    );
};

interface PlayersTabProps {
    campaign: Campaign;
    isOwner: boolean;
    onAdd: (id: string) => Promise<void>;
    onRemove: (id: string) => Promise<void>;
}
const PlayersTab: React.FC<PlayersTabProps> = ({ campaign, isOwner, onAdd, onRemove }) => {
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<UserHit[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!isOwner) return;
        if (!focused) return;
        let cancelled = false;
        setSearching(true);
        const handle = setTimeout(async () => {
            try {
                const { users } = await apiService.searchUsers(q);
                if (!cancelled) setHits(users);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 180);
        return () => { cancelled = true; clearTimeout(handle); };
    }, [q, focused, isOwner]);

    const already = new Set(campaign.players.map((p: PlayerRef) => p._id));
    const filteredHits = (hits || []).filter(
        (u) => !already.has(u._id) && u._id !== campaign.owner
    );

    return (
        <>
            <div className="section-title">Mitspielende</div>
            {campaign.players.length === 0 ? (
                <div className="muted" style={{ padding: "6px 2px 10px" }}>
                    {isOwner
                        ? "Noch keine Spieler hinzugefügt — such unten einen User."
                        : "Noch keine weiteren Mitspielenden."}
                </div>
            ) : (
                campaign.players.map((p) => (
                    <div key={p._id} className="player-row">
                        <div className="name">{p.username}</div>
                        {isOwner && (
                            <button
                                className="remove-btn"
                                onClick={() => onRemove(p._id)}
                                style={{
                                    fontFamily: "Cinzel, serif",
                                    fontSize: 11,
                                    letterSpacing: "0.14em",
                                    textTransform: "uppercase",
                                    padding: "6px 10px",
                                    border: "1px solid var(--parchment-edge, #a8906a)",
                                    background: "transparent",
                                    cursor: "pointer",
                                }}
                            >
                                Entfernen
                            </button>
                        )}
                    </div>
                ))
            )}

            {isOwner && (
                <>
                    <div className="section-title">Spieler hinzufügen</div>
                    <div className="player-search" style={{ position: "relative" }}>
                        <input
                            type="text"
                            placeholder="Nach Username suchen &hellip;"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setTimeout(() => setFocused(false), 150)}
                        />
                        {focused && (
                            <div className="player-results" style={{ top: "100%", left: 0 }}>
                                {searching && hits === null && (
                                    <div className="empty">Suche &hellip;</div>
                                )}
                                {hits !== null && filteredHits.length === 0 && (
                                    <div className="empty">Keine passenden User.</div>
                                )}
                                {filteredHits.map((u) => (
                                    <div
                                        className="hit"
                                        key={u._id}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            void onAdd(u._id);
                                            setQ("");
                                        }}
                                    >
                                        {u.username}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </>
    );
};

interface EditProps {
    campaign: Campaign;
    onCancel: () => void;
    onSaved: (c: Campaign) => void;
}
const EditCampaignDialog: React.FC<EditProps> = ({ campaign, onCancel, onSaved }) => {
    const [name, setName] = useState(campaign.name);
    const [description, setDescription] = useState(campaign.description);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        const n = name.trim();
        if (!n) { setError("Bitte gib einen Namen an."); return; }
        if (n.length > 120) { setError("Maximal 120 Zeichen."); return; }
        setSaving(true);
        setError(null);
        try {
            const { campaign: c } = await apiService.updateCampaign(campaign._id, {
                name: n,
                description: description.trim(),
            });
            onSaved(c);
        } catch (e: any) {
            setError(e?.msg || "Speichern fehlgeschlagen.");
            setSaving(false);
        }
    };
    return (
        <div className="modal-backdrop" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>Kampagne bearbeiten</h2>
                <label>Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    autoFocus
                />
                <label>Beschreibung</label>
                <textarea
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={4000}
                />
                {error && <div className="error-text">{error}</div>}
                <div className="modal-actions">
                    <button className="btn-ghost" onClick={onCancel} disabled={saving}>
                        Abbrechen
                    </button>
                    <button className="btn-rust" onClick={submit} disabled={saving}>
                        {saving ? "..." : "Speichern"}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface DelProps {
    name: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
}
const DeleteDialog: React.FC<DelProps> = ({ name, onCancel, onConfirm }) => {
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const confirm = async () => {
        setWorking(true);
        setError(null);
        try {
            await onConfirm();
        } catch (e: any) {
            setError(e?.msg || "Löschen fehlgeschlagen.");
            setWorking(false);
        }
    };
    return (
        <div className="modal-backdrop" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>Kampagne löschen?</h2>
                <p className="confirm-msg">
                    &bdquo;{name}&ldquo; wird endgültig gelöscht. Die
                    zugewiesenen Karten bleiben erhalten.
                </p>
                {error && <div className="error-text">{error}</div>}
                <div className="modal-actions">
                    <button className="btn-ghost" onClick={onCancel} disabled={working}>
                        Abbrechen
                    </button>
                    <button className="btn-rust" onClick={confirm} disabled={working}>
                        {working ? "..." : "Löschen"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CampaignDetailPage;
