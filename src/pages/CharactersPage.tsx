import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import apiService, { CharacterDoc } from "../modules/api";
import "./campaigns.css";
import "./characters.css";

type DialogState =
    | { kind: "none" }
    | { kind: "create" }
    | { kind: "edit"; character: CharacterDoc }
    | { kind: "delete"; character: CharacterDoc };

const CharactersPage: React.FC = () => {
    const [chars, setChars] = useState<CharacterDoc[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const { characters } = await apiService.listCharacters();
            setChars(characters);
        } catch (e: any) {
            setLoadError(e?.msg || "Charaktere konnten nicht geladen werden.");
            setChars([]);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const openCreate = () => setDialog({ kind: "create" });

    const onUpload = async (c: CharacterDoc, file: File) => {
        try {
            await apiService.uploadCharacterToken(c._id, file);
            await load();
        } catch (e: any) {
            alert(e?.msg || "Upload fehlgeschlagen.");
        }
    };

    return (
        <div className="campaigns-root">
            <div className="campaigns-container">
                <div className="campaigns-topbar">
                    <Link to="/board">&laquo; Zum Soundboard</Link>
                    <Link to="/kampagnen">Kampagnen</Link>
                </div>

                <header className="campaigns-header">
                    <h1>Charaktere</h1>
                    <div className="rule">
                        <span className="line" />
                        <span className="diamond" />
                        <span className="line" />
                    </div>
                    <p className="sub">
                        Lege Charaktere an und lade ein Token-Bild hoch. Im
                        Spielbrett wählst du pro Kampagne, mit wem du spielst.
                    </p>
                </header>

                {loadError && <div className="load-error">{loadError}</div>}

                <div className="campaigns-actions">
                    <button className="btn-rust" onClick={openCreate}>
                        + Neuer Charakter
                    </button>
                </div>

                {chars === null ? (
                    <div className="loading">Lade Charaktere &hellip;</div>
                ) : chars.length === 0 ? (
                    <div className="empty">
                        <h3>Noch kein Charakter</h3>
                        <p>Lege deinen ersten Helden an.</p>
                    </div>
                ) : (
                    <div className="char-grid">
                        {chars.map((c) => (
                            <article key={c._id} className="parchment-card char-card">
                                <div className="char-head">
                                    <TokenPreview url={c.tokenUrl} name={c.name} size={72} />
                                    <div className="char-name-col">
                                        <h2 className="card-title">{c.name}</h2>
                                        <div className="muted">
                                            {c.tokenUrl ? "Token hochgeladen" : "Noch kein Token"}
                                        </div>
                                    </div>
                                </div>
                                <div className="card-divider" />
                                <div className="card-footer">
                                    <UploadTokenInput onFile={(f) => onUpload(c, f)} />
                                    <div className="card-actions">
                                        <button className="btn-ghost" onClick={() => setDialog({ kind: "edit", character: c })}>
                                            Umbenennen
                                        </button>
                                        <button className="btn-ghost danger" onClick={() => setDialog({ kind: "delete", character: c })}>
                                            Löschen
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>

            {dialog.kind === "create" && (
                <NameDialog
                    title="Neuer Charakter"
                    submitLabel="Erstellen"
                    onCancel={() => setDialog({ kind: "none" })}
                    onSubmit={async (name) => {
                        await apiService.createCharacter({ name });
                        setDialog({ kind: "none" });
                        await load();
                    }}
                />
            )}
            {dialog.kind === "edit" && (
                <NameDialog
                    title="Umbenennen"
                    submitLabel="Speichern"
                    initial={dialog.character.name}
                    onCancel={() => setDialog({ kind: "none" })}
                    onSubmit={async (name) => {
                        await apiService.updateCharacter(dialog.character._id, { name });
                        setDialog({ kind: "none" });
                        await load();
                    }}
                />
            )}
            {dialog.kind === "delete" && (
                <ConfirmDialog
                    message={`"${dialog.character.name}" wirklich löschen?`}
                    onCancel={() => setDialog({ kind: "none" })}
                    onConfirm={async () => {
                        await apiService.deleteCharacter(dialog.character._id);
                        setDialog({ kind: "none" });
                        await load();
                    }}
                />
            )}
        </div>
    );
};

// -------------------- Hilfs-UIs --------------------

export const TokenPreview: React.FC<{ url: string | null; name: string; size: number }> = ({
    url, name, size,
}) => {
    const letter = (name?.trim()?.[0] || "?").toUpperCase();
    if (url) {
        return (
            <div
                className="token-round"
                style={{ width: size, height: size }}
                title={name}
            >
                <img src={url} alt={name} draggable={false} />
            </div>
        );
    }
    return (
        <div
            className="token-round token-placeholder"
            style={{ width: size, height: size, fontSize: size * 0.4 }}
            title={name}
        >
            {letter}
        </div>
    );
};

const UploadTokenInput: React.FC<{ onFile: (f: File) => void | Promise<void> }> = ({ onFile }) => {
    const ref = useRef<HTMLInputElement | null>(null);
    return (
        <>
            <input
                ref={ref}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    if (ref.current) ref.current.value = "";
                }}
            />
            <button className="btn-ghost" onClick={() => ref.current?.click()}>
                Token-Bild
            </button>
        </>
    );
};

const NameDialog: React.FC<{
    title: string;
    submitLabel: string;
    initial?: string;
    onCancel: () => void;
    onSubmit: (name: string) => Promise<void>;
}> = ({ title, submitLabel, initial = "", onCancel, onSubmit }) => {
    const [name, setName] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        const n = name.trim();
        if (!n) { setError("Bitte Name angeben."); return; }
        if (n.length > 80) { setError("Max 80 Zeichen."); return; }
        setBusy(true);
        try {
            await onSubmit(n);
        } catch (e: any) {
            setError(e?.msg || "Speichern fehlgeschlagen.");
            setBusy(false);
        }
    };
    return (
        <div className="modal-backdrop" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>{title}</h2>
                <label>Name</label>
                <input
                    type="text"
                    autoFocus
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                />
                {error && <div className="error-text">{error}</div>}
                <div className="modal-actions">
                    <button className="btn-ghost" onClick={onCancel} disabled={busy}>Abbrechen</button>
                    <button className="btn-rust" onClick={submit} disabled={busy}>
                        {busy ? "..." : submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ConfirmDialog: React.FC<{
    message: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
}> = ({ message, onCancel, onConfirm }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const go = async () => {
        setBusy(true);
        try { await onConfirm(); } catch (e: any) { setError(e?.msg || "Fehler."); setBusy(false); }
    };
    return (
        <div className="modal-backdrop" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>Bestätigen</h2>
                <p className="confirm-msg">{message}</p>
                {error && <div className="error-text">{error}</div>}
                <div className="modal-actions">
                    <button className="btn-ghost" onClick={onCancel} disabled={busy}>Abbrechen</button>
                    <button className="btn-rust" onClick={go} disabled={busy}>
                        {busy ? "..." : "OK"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CharactersPage;
