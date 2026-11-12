// Panels fuer das Spielbrett: Initiative + Inventar.
// Separate Datei, damit GamePage.tsx nicht weiter explodiert.
//
// Design wie campaigns.css (Pergament/dunkles Holz, Cinzel). Kommuniziert
// per socket.io — alle Rechte-Pruefungen passieren serverseitig.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Initiative, InventoryDoc, InventoryItem, PlayerRef,
    CharacterDoc,
} from "../modules/api";
import { getSocket } from "../modules/notifications/socket";
import { TokenPreview } from "./CharactersPage";

// ---------- Initiative ----------

interface InitiativePanelProps {
    campaignId: string;
    isOwner: boolean;
    ownerId: string;
    myUserId: string | null;
    myCurrentCharId: string | null;
    myCharacters: CharacterDoc[];
    initiative: Initiative | null;
}

export const InitiativePanel: React.FC<InitiativePanelProps> = ({
    campaignId, isOwner, ownerId, myUserId, myCurrentCharId, myCharacters, initiative,
}) => {
    const [npcName, setNpcName] = useState("");
    const [npcBonus, setNpcBonus] = useState("0");
    const [rolling, setRolling] = useState(false);
    const [editEntry, setEditEntry] = useState<{ id: string; roll: string; bonus: string } | null>(null);

    const myChar = myCurrentCharId
        ? myCharacters.find((c) => c._id === myCurrentCharId) || null
        : null;
    const defaultBonus = myChar?.initiativeBonus ?? 0;
    const [bonusOverride, setBonusOverride] = useState<string>("");

    useEffect(() => { setBonusOverride(""); }, [myCurrentCharId]);

    const rollSelf = () => {
        if (!campaignId) return;
        setRolling(true);
        const payload: any = { campaignId };
        if (myCurrentCharId) payload.characterId = myCurrentCharId;
        const n = bonusOverride.trim();
        if (n !== "") {
            const v = parseInt(n, 10);
            if (!Number.isFinite(v)) { setRolling(false); return; }
            payload.bonusOverride = v;
        }
        getSocket().emit("campaign:initiative:roll", payload, () => {
            setRolling(false);
        });
    };

    const addNpc = () => {
        const name = npcName.trim();
        if (!name) return;
        const b = parseInt(npcBonus, 10);
        getSocket().emit("campaign:initiative:addNpc", {
            campaignId, name, bonus: Number.isFinite(b) ? b : 0,
        }, (ack: any) => {
            if (ack?.ok) { setNpcName(""); setNpcBonus("0"); }
        });
    };

    const removeEntry = (id: string) => {
        getSocket().emit("campaign:initiative:remove", { campaignId, entryId: id }, () => {});
    };

    const commitEdit = () => {
        if (!editEntry) return;
        const patch: any = {};
        const r = parseInt(editEntry.roll, 10);
        const b = parseInt(editEntry.bonus, 10);
        if (Number.isFinite(r) && r >= 1 && r <= 20) patch.roll = r;
        if (Number.isFinite(b) && b >= -10 && b <= 30) patch.bonus = b;
        getSocket().emit("campaign:initiative:update", {
            campaignId, entryId: editEntry.id, patch,
        }, () => setEditEntry(null));
    };

    const startCombat = () => getSocket().emit("campaign:initiative:start", { campaignId }, () => {});
    const endCombat = () => getSocket().emit("campaign:initiative:end", { campaignId }, () => {});
    const nextTurn = () => getSocket().emit("campaign:initiative:next", { campaignId }, () => {});
    const resetAll = () => {
        if (!window.confirm("Initiative wirklich komplett zurücksetzen?")) return;
        getSocket().emit("campaign:initiative:reset", { campaignId }, () => {});
    };

    const entries = initiative?.entries || [];
    const round = initiative?.round || 1;
    const turnIndex = initiative?.turnIndex || 0;
    const active = !!initiative?.active;

    return (
        <div className="initiative-panel">
            <div className="ip-head">
                <div className="ip-title">Initiative</div>
                {active && (
                    <div className="ip-round">
                        Runde {round}
                    </div>
                )}
            </div>

            <div className="ip-roll-row">
                <button
                    className="btn-rust"
                    disabled={rolling}
                    onClick={rollSelf}
                    title={myChar ? `d20 + ${defaultBonus} (Charakter-Bonus)` : "d20 ohne Bonus"}
                >
                    🎲 {rolling ? "…" : "Initiative würfeln"}
                </button>
                <input
                    type="number"
                    className="ip-bonus-override"
                    placeholder={`+${defaultBonus}`}
                    value={bonusOverride}
                    onChange={(e) => setBonusOverride(e.target.value)}
                    title="Bonus überschreiben (optional)"
                />
            </div>
            <div className="ip-hint">
                {myChar
                    ? `Wirft für ${myChar.name} (Bonus ${defaultBonus >= 0 ? "+" : ""}${defaultBonus})`
                    : "Keine Figur gewählt — würfelt ohne Bonus."}
            </div>

            {isOwner && (
                <div className="ip-controls">
                    {!active ? (
                        <button className="btn-rust" onClick={startCombat} disabled={entries.length === 0}>
                            ⚔ Kampf starten
                        </button>
                    ) : (
                        <>
                            <button className="btn-rust" onClick={nextTurn}>▶ Nächster Zug</button>
                            <button className="btn-ghost" onClick={endCombat}>Kampf beenden</button>
                        </>
                    )}
                    <button className="btn-ghost" onClick={resetAll} title="Alles leeren">Zurücksetzen</button>
                </div>
            )}

            {isOwner && (
                <div className="ip-npc-row">
                    <input
                        type="text"
                        placeholder="NSC/Monster"
                        value={npcName}
                        maxLength={80}
                        onChange={(e) => setNpcName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addNpc(); }}
                    />
                    <input
                        type="number"
                        value={npcBonus}
                        onChange={(e) => setNpcBonus(e.target.value)}
                        className="ip-npc-bonus"
                        title="Bonus"
                    />
                    <button className="btn-ghost" onClick={addNpc} disabled={!npcName.trim()}>+ NSC</button>
                </div>
            )}

            <div className="ip-list">
                {entries.length === 0 && (
                    <div className="ip-empty">Noch keine Würfe.</div>
                )}
                {entries.map((e, idx) => {
                    const total = e.roll != null ? e.roll + e.bonus : null;
                    const isMine = !e.isNpc && String(e.userId || "") === String(myUserId || "");
                    const isGm = ownerId && String(e.userId || "") === String(ownerId);
                    const isCurrent = active && idx === turnIndex;
                    return (
                        <div
                            key={e.id}
                            className={`ip-row${isCurrent ? " current" : ""}${isMine ? " mine" : ""}`}
                        >
                            <div className="ip-token">
                                <TokenPreview url={e.tokenUrl} name={e.name} size={28} />
                            </div>
                            <div className="ip-name">
                                {e.name}
                                {e.isNpc && <span className="ip-npc-tag">NSC</span>}
                                {isGm && !e.isNpc && <span className="ip-gm-tag">GM</span>}
                            </div>
                            {editEntry?.id === e.id ? (
                                <div className="ip-edit">
                                    <input type="number" value={editEntry.roll}
                                        min={1} max={20}
                                        onChange={(ev) => setEditEntry({ ...editEntry, roll: ev.target.value })} />
                                    <span>+</span>
                                    <input type="number" value={editEntry.bonus}
                                        min={-10} max={30}
                                        onChange={(ev) => setEditEntry({ ...editEntry, bonus: ev.target.value })} />
                                    <button className="btn-ghost" onClick={commitEdit}>OK</button>
                                    <button className="btn-ghost" onClick={() => setEditEntry(null)}>✕</button>
                                </div>
                            ) : (
                                <>
                                    <div className="ip-val">
                                        {total == null
                                            ? <span className="ip-noval">—</span>
                                            : <><b>{total}</b><span className="muted"> ({e.roll}{e.bonus >= 0 ? "+" : ""}{e.bonus})</span></>
                                        }
                                    </div>
                                    {isOwner && (
                                        <div className="ip-ops">
                                            <button className="btn-ghost small" title="Korrigieren"
                                                onClick={() => setEditEntry({
                                                    id: e.id, roll: String(e.roll ?? 10), bonus: String(e.bonus),
                                                })}>✎</button>
                                            <button className="btn-ghost small danger" title="Entfernen"
                                                onClick={() => removeEntry(e.id)}>✕</button>
                                        </div>
                                    )}
                                </>
                            )}
                            {isCurrent && <div className="ip-arrow" title="Aktueller Zug">▶</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ---------- Inventar ----------

interface InventoryPanelProps {
    campaignId: string;
    isOwner: boolean;
    players: PlayerRef[];
    ownerId: string;
    myUserId: string | null;
    myInventory: InventoryDoc | null;
    // Nur fuer GM:
    allInventories: InventoryDoc[];
}

export const InventoryPanel: React.FC<InventoryPanelProps> = ({
    campaignId, isOwner, players, ownerId, myUserId, myInventory, allInventories,
}) => {
    // GM-Sicht: Tabs zwischen Spieler + sich selbst. Spieler-Sicht: nur eigene.
    const [targetUserId, setTargetUserId] = useState<string | null>(null);

    const memberList = useMemo(() => {
        const list: { userId: string; username: string }[] = [];
        if (ownerId) {
            list.push({ userId: ownerId, username: "GM" });
        }
        for (const p of players) list.push({ userId: p._id, username: p.username });
        return list;
    }, [players, ownerId]);

    useEffect(() => {
        if (!isOwner) setTargetUserId(null);
        else if (!targetUserId && memberList.length > 0) setTargetUserId(memberList[0].userId);
    }, [isOwner, memberList, targetUserId]);

    const activeInv: InventoryDoc | null = useMemo(() => {
        if (!isOwner) return myInventory;
        const uid = targetUserId;
        if (!uid) return null;
        if (uid === myUserId) return myInventory;
        return allInventories.find((i) => i.userId === uid) || null;
    }, [isOwner, myInventory, allInventories, targetUserId, myUserId]);

    const canEdit = isOwner || (activeInv && activeInv.userId === myUserId);

    const [transferFor, setTransferFor] = useState<{ item: InventoryItem; toUserId: string; qty: string } | null>(null);

    const sendNotes = (notes: string) => {
        const payload: any = { campaignId, notes };
        if (isOwner && activeInv && activeInv.userId !== myUserId) {
            payload.targetUserId = activeInv.userId;
        }
        getSocket().emit("campaign:inventory:setNotes", payload, () => {});
    };

    // Lokaler Puffer fuer Notizen (Debounce beim Speichern).
    const notesTimerRef = useRef<any>(null);
    const [notesBuf, setNotesBuf] = useState<string>("");
    const currentInvIdRef = useRef<string | null>(null);
    useEffect(() => {
        const invId = activeInv?.userId || null;
        if (currentInvIdRef.current !== invId) {
            currentInvIdRef.current = invId;
            setNotesBuf(activeInv?.notes || "");
        } else if (activeInv && activeInv.notes !== notesBuf && document.activeElement?.tagName !== "TEXTAREA") {
            // Fremder Push (z.B. GM aktualisiert) — nur uebernehmen wenn der User nicht gerade tippt
            setNotesBuf(activeInv.notes || "");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeInv?.userId, activeInv?.notes]);

    const onNotesChange = (v: string) => {
        setNotesBuf(v);
        if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
        notesTimerRef.current = setTimeout(() => sendNotes(v), 600);
    };

    const [addDraft, setAddDraft] = useState<{ name: string; qty: string; description: string }>({ name: "", qty: "1", description: "" });
    const addItem = () => {
        const name = addDraft.name.trim();
        if (!name) return;
        const qty = parseInt(addDraft.qty, 10);
        const payload: any = {
            campaignId,
            item: {
                name,
                qty: Number.isFinite(qty) && qty >= 1 ? qty : 1,
                description: addDraft.description,
            },
        };
        if (isOwner && activeInv && activeInv.userId !== myUserId) {
            payload.targetUserId = activeInv.userId;
        }
        getSocket().emit("campaign:inventory:addItem", payload, (ack: any) => {
            if (ack?.ok) setAddDraft({ name: "", qty: "1", description: "" });
        });
    };

    const updateItem = (itemId: string, patch: Partial<InventoryItem>) => {
        const payload: any = { campaignId, itemId, patch };
        if (isOwner && activeInv && activeInv.userId !== myUserId) {
            payload.targetUserId = activeInv.userId;
        }
        getSocket().emit("campaign:inventory:updateItem", payload, () => {});
    };

    const removeItem = (itemId: string) => {
        const payload: any = { campaignId, itemId };
        if (isOwner && activeInv && activeInv.userId !== myUserId) {
            payload.targetUserId = activeInv.userId;
        }
        getSocket().emit("campaign:inventory:removeItem", payload, () => {});
    };

    const doTransfer = () => {
        if (!transferFor || !activeInv) return;
        const q = parseInt(transferFor.qty, 10);
        if (!Number.isFinite(q) || q <= 0) return;
        getSocket().emit("campaign:inventory:transfer", {
            campaignId,
            fromUserId: activeInv.userId,
            toUserId: transferFor.toUserId,
            itemId: transferFor.item.id,
            qty: q,
        }, (ack: any) => {
            if (ack?.ok) setTransferFor(null);
        });
    };

    return (
        <div className="inventory-panel">
            {isOwner && memberList.length > 0 && (
                <div className="inv-tabs">
                    {memberList.map((m) => (
                        <button
                            key={m.userId}
                            className={`inv-tab${targetUserId === m.userId ? " active" : ""}`}
                            onClick={() => setTargetUserId(m.userId)}
                        >
                            {m.username}
                        </button>
                    ))}
                </div>
            )}

            {!activeInv ? (
                <div className="inv-empty">
                    {isOwner ? "Wähle oben einen Spieler." : "Lade Inventar…"}
                </div>
            ) : (
                <>
                    <div className="inv-section-label">Notizen</div>
                    <textarea
                        className="inv-notes"
                        value={notesBuf}
                        placeholder="Charakterblatt, Zauber, Verbindungen, …"
                        onChange={(e) => onNotesChange(e.target.value)}
                        readOnly={!canEdit}
                        maxLength={8000}
                    />

                    <div className="inv-section-label">Gegenstände</div>
                    <div className="inv-items">
                        {activeInv.items.length === 0 && (
                            <div className="inv-empty small">Noch keine Gegenstände.</div>
                        )}
                        {activeInv.items.map((it) => (
                            <InventoryItemRow
                                key={it.id}
                                item={it}
                                canEdit={!!canEdit}
                                canTransfer={isOwner}
                                onUpdate={(patch) => updateItem(it.id, patch)}
                                onRemove={() => removeItem(it.id)}
                                onTransfer={() => {
                                    const others = memberList.filter((m) => m.userId !== activeInv.userId);
                                    const first = others[0]?.userId || "";
                                    setTransferFor({ item: it, toUserId: first, qty: String(it.qty) });
                                }}
                            />
                        ))}
                    </div>

                    {canEdit && (
                        <div className="inv-add">
                            <div className="inv-add-row">
                                <input
                                    type="text" placeholder="Gegenstand"
                                    value={addDraft.name} maxLength={120}
                                    onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })}
                                />
                                <input
                                    type="number" value={addDraft.qty} min={1} max={99999}
                                    onChange={(e) => setAddDraft({ ...addDraft, qty: e.target.value })}
                                    className="inv-qty"
                                />
                            </div>
                            <input
                                type="text" placeholder="Beschreibung (optional)"
                                value={addDraft.description} maxLength={2000}
                                onChange={(e) => setAddDraft({ ...addDraft, description: e.target.value })}
                            />
                            <button className="btn-rust" onClick={addItem} disabled={!addDraft.name.trim()}>
                                + Hinzufügen
                            </button>
                        </div>
                    )}
                </>
            )}

            {transferFor && (
                <div className="modal-backdrop" onClick={() => setTransferFor(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Transfer</h2>
                        <p>„{transferFor.item.name}" (verfügbar {transferFor.item.qty})</p>
                        <label>Anzahl</label>
                        <input
                            type="number" value={transferFor.qty} min={1} max={transferFor.item.qty}
                            onChange={(e) => setTransferFor({ ...transferFor, qty: e.target.value })}
                        />
                        <label>An</label>
                        <select
                            value={transferFor.toUserId}
                            onChange={(e) => setTransferFor({ ...transferFor, toUserId: e.target.value })}
                        >
                            {memberList
                                .filter((m) => m.userId !== activeInv?.userId)
                                .map((m) => (
                                    <option key={m.userId} value={m.userId}>{m.username}</option>
                                ))}
                        </select>
                        <div className="modal-actions">
                            <button className="btn-ghost" onClick={() => setTransferFor(null)}>Abbrechen</button>
                            <button className="btn-rust" onClick={doTransfer}>Übertragen</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Einzelne Zeile: inline editierbar ueber „✎".
interface ItemRowProps {
    item: InventoryItem;
    canEdit: boolean;
    canTransfer: boolean;
    onUpdate: (patch: Partial<InventoryItem>) => void;
    onRemove: () => void;
    onTransfer: () => void;
}
const InventoryItemRow: React.FC<ItemRowProps> = ({
    item, canEdit, canTransfer, onUpdate, onRemove, onTransfer,
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<{ name: string; qty: string; description: string }>(
        { name: item.name, qty: String(item.qty), description: item.description || "" }
    );
    useEffect(() => {
        if (!editing) setDraft({ name: item.name, qty: String(item.qty), description: item.description || "" });
    }, [item, editing]);
    const commit = () => {
        const patch: Partial<InventoryItem> = {};
        if (draft.name.trim() && draft.name !== item.name) patch.name = draft.name.trim();
        const q = parseInt(draft.qty, 10);
        if (Number.isFinite(q) && q !== item.qty) patch.qty = q;
        if (draft.description !== item.description) patch.description = draft.description;
        if (Object.keys(patch).length > 0) onUpdate(patch);
        setEditing(false);
    };
    return (
        <div className="inv-item">
            {editing ? (
                <>
                    <div className="inv-item-row">
                        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                        <input
                            type="number" value={draft.qty} min={1} max={99999}
                            onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                            className="inv-qty"
                        />
                    </div>
                    <textarea
                        value={draft.description}
                        placeholder="Beschreibung"
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        rows={2}
                        maxLength={2000}
                    />
                    <div className="inv-item-ops">
                        <button className="btn-ghost" onClick={() => setEditing(false)}>Abbrechen</button>
                        <button className="btn-rust" onClick={commit}>Speichern</button>
                    </div>
                </>
            ) : (
                <>
                    <div className="inv-item-row">
                        <span className="inv-name">{item.name}</span>
                        <span className="inv-qty-badge">×{item.qty}</span>
                    </div>
                    {item.description && <div className="inv-desc">{item.description}</div>}
                    <div className="inv-item-ops">
                        {canEdit && (
                            <>
                                <button className="btn-ghost small" onClick={() => setEditing(true)} title="Bearbeiten">✎</button>
                                <button className="btn-ghost small danger" onClick={onRemove} title="Entfernen">✕</button>
                            </>
                        )}
                        {canTransfer && (
                            <button className="btn-ghost small" onClick={onTransfer} title="Übertragen">⇄</button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
