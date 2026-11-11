import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiService, { Campaign } from "../modules/api";
import "./campaigns.css";

type DialogState =
    | { kind: "none" }
    | { kind: "create" }
    | { kind: "edit"; campaign: Campaign }
    | { kind: "delete"; campaign: Campaign };

const CampaignsPage: React.FC = () => {
    const navigate = useNavigate();
    const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const { campaigns } = await apiService.listCampaigns();
            setCampaigns(campaigns);
        } catch (e: any) {
            setLoadError(e?.msg || "Kampagnen konnten nicht geladen werden.");
            setCampaigns([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const sorted = useMemo(
        () =>
            (campaigns || [])
                .slice()
                .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
        [campaigns]
    );

    const openCreate = () => setDialog({ kind: "create" });
    const openEdit = (c: Campaign) => setDialog({ kind: "edit", campaign: c });
    const openDelete = (c: Campaign) => setDialog({ kind: "delete", campaign: c });
    const closeDialog = () => setDialog({ kind: "none" });

    const onSaved = async (c: Campaign, isNew: boolean) => {
        closeDialog();
        await load();
        if (isNew) navigate(`/kampagnen/${c._id}`);
    };

    const onDeleted = async () => {
        closeDialog();
        await load();
    };

    return (
        <div className="campaigns-root">
            <div className="campaigns-container">
                <div className="campaigns-topbar">
                    <Link to="/board">&laquo; Zum Soundboard</Link>
                    <span>DM&rsquo;s Chamber</span>
                </div>

                <header className="campaigns-header">
                    <h1>Kampagnen</h1>
                    <div className="rule">
                        <span className="line" />
                        <span className="diamond" />
                        <span className="line" />
                    </div>
                    <p className="sub">
                        Sammle deine Karten zu Abenteuern. Jede Kampagne ist eine
                        Mappe aus Schauplaetzen, die du spaeter deinen Spielern
                        vorsetzt.
                    </p>
                </header>

                {loadError && <div className="load-error">{loadError}</div>}

                <div className="campaigns-actions">
                    <button className="btn-rust" onClick={openCreate}>
                        + Neue Kampagne
                    </button>
                </div>

                {campaigns === null ? (
                    <div className="loading">Lade Kampagnen &hellip;</div>
                ) : sorted.length === 0 ? (
                    <div className="empty">
                        <h3>Noch keine Kampagne</h3>
                        <p>
                            Lege deine erste Kampagne an, um Karten darin zu
                            sammeln.
                        </p>
                    </div>
                ) : (
                    <div className="campaigns-grid">
                        {sorted.map((c) => (
                            <article key={c._id} className="parchment-card">
                                <Link to={`/kampagnen/${c._id}`} className="card-link">
                                    <h2 className="card-title">{c.name}</h2>
                                    <div className="card-sub">
                                        {new Date(c.updatedAt).toLocaleDateString("de-DE", {
                                            day: "2-digit",
                                            month: "long",
                                            year: "numeric",
                                        })}
                                    </div>
                                    <div className="card-divider" />
                                    <div className="card-body">
                                        {c.description || (
                                            <span className="muted">
                                                Keine Beschreibung &mdash; noch eine
                                                leere Seite.
                                            </span>
                                        )}
                                    </div>
                                </Link>
                                <div className="card-footer">
                                    <span className="pill">
                                        {c.mapIds.length}{" "}
                                        {c.mapIds.length === 1 ? "Karte" : "Karten"}
                                    </span>
                                    <div className="card-actions">
                                        <button
                                            className="btn-ghost"
                                            onClick={() => openEdit(c)}
                                        >
                                            Bearbeiten
                                        </button>
                                        <button
                                            className="btn-ghost danger"
                                            onClick={() => openDelete(c)}
                                        >
                                            Loeschen
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>

            {dialog.kind === "create" && (
                <CampaignFormDialog
                    title="Neue Kampagne"
                    submitLabel="Erstellen"
                    onCancel={closeDialog}
                    onSubmit={async ({ name, description }) => {
                        const { campaign } = await apiService.createCampaign({ name, description });
                        await onSaved(campaign, true);
                    }}
                />
            )}
            {dialog.kind === "edit" && (
                <CampaignFormDialog
                    title="Kampagne bearbeiten"
                    submitLabel="Speichern"
                    initialName={dialog.campaign.name}
                    initialDescription={dialog.campaign.description}
                    onCancel={closeDialog}
                    onSubmit={async ({ name, description }) => {
                        const { campaign } = await apiService.updateCampaign(dialog.campaign._id, {
                            name,
                            description,
                        });
                        await onSaved(campaign, false);
                    }}
                />
            )}
            {dialog.kind === "delete" && (
                <ConfirmDeleteDialog
                    name={dialog.campaign.name}
                    onCancel={closeDialog}
                    onConfirm={async () => {
                        await apiService.deleteCampaign(dialog.campaign._id);
                        await onDeleted();
                    }}
                />
            )}
        </div>
    );
};

// ---------- Hilfs-Dialog-Komponenten ----------

interface CampaignFormDialogProps {
    title: string;
    submitLabel: string;
    initialName?: string;
    initialDescription?: string;
    onCancel: () => void;
    onSubmit: (v: { name: string; description: string }) => Promise<void>;
}

const CampaignFormDialog: React.FC<CampaignFormDialogProps> = ({
    title,
    submitLabel,
    initialName = "",
    initialDescription = "",
    onCancel,
    onSubmit,
}) => {
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        const n = name.trim();
        if (n.length < 1) {
            setError("Bitte gib einen Namen an.");
            return;
        }
        if (n.length > 120) {
            setError("Maximal 120 Zeichen.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onSubmit({ name: n, description: description.trim() });
        } catch (e: any) {
            setError(e?.msg || "Speichern fehlgeschlagen.");
            setSaving(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>{title}</h2>
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
                        {saving ? "..." : submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ConfirmDeleteDialogProps {
    name: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
}

const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({ name, onCancel, onConfirm }) => {
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

export default CampaignsPage;
