import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiService, { Campaign, MapListItem } from "../modules/api";
import "./campaigns.css";

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

    useEffect(() => {
        void load();
    }, [load]);

    // Map-Lookup nach Id
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

    const removeMap = async (mid: string) => {
        if (!campaign) return;
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
        if (!campaign || !addMapId) return;
        setMutationError(null);
        try {
            const next = [...campaign.mapIds, addMapId];
            const { campaign: updated } = await apiService.updateCampaign(campaign._id, {
                mapIds: next,
            });
            setCampaign(updated);
            setAddMapId("");
        } catch (e: any) {
            setMutationError(e?.msg || "Hinzufuegen fehlgeschlagen.");
        }
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
                    <div className="kicker">Kampagne</div>
                    <h1>{campaign.name}</h1>
                    <div className="banner-actions">
                        <button onClick={() => setShowEdit(true)}>Bearbeiten</button>
                        <button className="danger" onClick={() => setShowDelete(true)}>
                            Loeschen
                        </button>
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
                        className="tab"
                        disabled
                        title="Rollen/Spieler-Einladungen kommen spaeter."
                    >
                        Spieler
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
                                Noch keine Karten zugewiesen &mdash; fuege unten eine
                                hinzu.
                            </div>
                        ) : (
                            <div>
                                {assignedMaps.map((m) => (
                                    <div key={m._id} className="map-row">
                                        <div className="left">
                                            <span className="pill light">
                                                {m.isExample ? "Beispiel" : "Eigene"}
                                            </span>
                                            <span className="name">{m.name}</span>
                                        </div>
                                        <div className="right">
                                            <a
                                                className="open-link"
                                                href={`/bilder/?map=${m._id}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Im Builder oeffnen
                                            </a>
                                            <button
                                                className="remove-btn"
                                                onClick={() => removeMap(m._id)}
                                            >
                                                Entfernen
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {availableMaps.length > 0 && (
                            <>
                                <div className="section-title">Karte hinzufuegen</div>
                                <div className="add-map-row">
                                    <select
                                        value={addMapId}
                                        onChange={(e) => setAddMapId(e.target.value)}
                                    >
                                        <option value="">
                                            &mdash; Karte auswaehlen &mdash;
                                        </option>
                                        {availableMaps.map((m) => (
                                            <option key={m._id} value={m._id}>
                                                {m.name}
                                                {m.isExample ? " (Beispiel)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        className="btn-rust"
                                        onClick={addMap}
                                        disabled={!addMapId}
                                    >
                                        Hinzufuegen
                                    </button>
                                </div>
                            </>
                        )}
                        {maps !== null && availableMaps.length === 0 && (
                            <div className="muted" style={{ marginTop: 10 }}>
                                Alle verfuegbaren Karten sind bereits zugewiesen.
                                Lege im{" "}
                                <a
                                    href="/bilder/"
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: "#e6c56a" }}
                                >
                                    Builder
                                </a>{" "}
                                eine neue an.
                            </div>
                        )}
                    </>
                )}
            </div>

            {showEdit && (
                <EditCampaignDialog
                    campaign={campaign}
                    onCancel={() => setShowEdit(false)}
                    onSaved={(c) => {
                        setShowEdit(false);
                        setCampaign(c);
                    }}
                />
            )}
            {showDelete && (
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

// --- Hilfs-Dialoge ---

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
            setError(e?.msg || "Loeschen fehlgeschlagen.");
            setWorking(false);
        }
    };
    return (
        <div className="modal-backdrop" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>Kampagne loeschen?</h2>
                <p className="confirm-msg">
                    &bdquo;{name}&ldquo; wird endgueltig geloescht. Die
                    zugewiesenen Karten bleiben erhalten.
                </p>
                {error && <div className="error-text">{error}</div>}
                <div className="modal-actions">
                    <button className="btn-ghost" onClick={onCancel} disabled={working}>
                        Abbrechen
                    </button>
                    <button className="btn-rust" onClick={confirm} disabled={working}>
                        {working ? "..." : "Loeschen"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CampaignDetailPage;
