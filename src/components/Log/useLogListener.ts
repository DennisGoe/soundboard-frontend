import {useEffect, useState} from "react";
import {getSocket} from "../../modules/notifications/socket";

const STORAGE_KEY = "soundboard_log";
const MAX_ENTRIES = 250;

function loadInitial(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
    } catch {
        return [];
    }
}

const useLogListener = () => {
    const [completeLog, setCompleteLog] = useState<string[]>(loadInitial);

    useEffect(() => {
        const socket = getSocket();
        const handleLog = (entry: string) => {
            setCompleteLog((prev) => {
                const next = [...prev, entry].slice(-MAX_ENTRIES);
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                } catch {
                    // localStorage full / disabled — keep in-memory only
                }
                return next;
            });
        };

        socket.on("log", handleLog);
        return () => {
            socket.off("log", handleLog);
        };
    }, []);

    const clearLog = () => {
        setCompleteLog([]);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    };

    return {completeLog, clearLog};
};

export default useLogListener;
