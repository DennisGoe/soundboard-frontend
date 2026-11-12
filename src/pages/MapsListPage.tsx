import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiService, { MapListItem } from "../modules/api";
import "./campaigns.css";

const MapsListPage: React.FC = () => {
    const [maps, setMaps] = useState<MapListItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const load = useCallback(async () => {
        setError(null);
        try {
            const { maps } = await apiService.listMaps();
            setMaps(maps);
        } catch (e: any) {
            setError(e?.msg || "Karten konnten nicht geladen werden.");
            setMaps([]);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const remove = async (id: string, name: string) => {
        if (!window.confirm(`Karte „${name}“ wirklich löschen?`)) return;
        try {
            await apiService.deleteMap(id);
            await load();
        } catch (e: any) {
            alert(e?.msg || "Löschen fehlgeschlagen.");
        }
    };

    const typeLabel = (m: MapListItem): string => {
        if (m.kind === "2d-editor") return "2D";
        if (m.kind === "2d-image") return "Bild";
        return "3D";
    };

    return (
        <div className="campaigns-root">
            <div className="campaigns-container">
                <div className="campaigns-topbar">
                    <Link to="/board">&laquo; Zum Soundboard</Link>
                    <Link to="/kampagnen">Kampagnen</Link>
                </div>

                <header className="campaigns-header">
                    <h1>Karten</h1>
                    <div className="rule">
                        <span className="line" />
                        <span className="diamond" />
                        <span className="line" />
                    </div>
                </header>

                {error && <div className="load-error">{error}</div>}

                <div className="campaigns-actions" style={{ gap: 8 }}>
                    <button
                        className="btn-rust"
                        onClick={() => navigate("/karten/neu")}
                    >
                        + Neue 2D-Karte bauen
                    </button>
                    <a
                        className="btn-ghost"
                        href="/bilder/"
                        target="_blank"
                        rel="noreferrer"
                        style={{ padding: "10px 20px", background: "transparent" }}
                    >
                        3D-Builder öffnen
                    </a>
                </div>

                {maps === null ? (
                    <div className="loading">Lade Karten &hellip;</div>
                ) : maps.length === 0 ? (
                    <div className="empty">
                        <h3>Noch keine Karte</h3>
                        <p>Fange mit einer 2D-Karte an oder öffne den 3D-Builder.</p>
                    </div>
                ) : (
                    <div className="campaigns-grid">
                        {maps.map((m) => {
                            const isMine = !m.isExample && m.owner;
                            const canEdit2d = m.kind === "2d-editor" && isMine;
                            return (
                                <article key={m._id} className="parchment-card">
                                    <div className="card-link" style={{ cursor: "default" }}>
                                        <h2 className="card-title">{m.name}</h2>
                                        <div className="card-sub">
                                            {new Date(m.updatedAt).toLocaleDateString("de-DE", {
                                                day: "2-digit", month: "long", year: "numeric",
                                            })}
                                        </div>
                                        <div className="card-divider" />
                                        <div className="card-body">
                                            {m.isExample
                                                ? "Beispiel-Karte — jeder kann sie sehen."
                                                : m.kind === "2d-editor"
                                                ? "Battlemap im 2D-Editor."
                                                : m.kind === "2d-image"
                                                ? "Hochgeladenes Bild."
                                                : "3D-Schauplatz aus dem Builder."}
                                        </div>
                                    </div>
                                    <div className="card-footer">
                                        <span className="pill">{typeLabel(m)}</span>
                                        <div className="card-actions">
                                            {canEdit2d && (
                                                <button
                                                    className="btn-ghost"
                                                    onClick={() => navigate(`/karten/${m._id}/bearbeiten`)}
                                                >
                                                    Bearbeiten
                                                </button>
                                            )}
                                            {m.kind === "3d" && !m.isExample && isMine && (
                                                <a
                                                    className="btn-ghost"
                                                    href={`/bilder/?map=${m._id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ textDecoration: "none" }}
                                                >
                                                    Im Builder
                                                </a>
                                            )}
                                            {isMine && (
                                                <button
                                                    className="btn-ghost danger"
                                                    onClick={() => void remove(m._id, m.name)}
                                                >
                                                    Löschen
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MapsListPage;
