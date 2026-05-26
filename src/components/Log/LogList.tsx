import React, {useEffect, useRef, useState} from "react";
import useLogListener from "./useLogListener";
import Button from "../utils/Button";
import {Icon} from "../utils/Icon";

const LOG_REGEX = /^(\d+:\d+:\d+)(?:\s(?:AM|PM))?\s(.+?)\splayed sound:\s(.+)$/i;

const LogEntry = ({text}: {text: string}) => {
    const match = text.match(LOG_REGEX);

    if (!match) {
        return (
            <div className="relative pl-4 pr-2 py-2">
                <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-sm bg-blue_main opacity-30"/>
                <span className="text-sm text-neutral-300">{text}</span>
            </div>
        );
    }

    const [, time, user, sound] = match;

    return (
        <div className="relative pl-4 pr-2 py-2">
            <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-sm bg-blue_main opacity-40"/>
            <div className="flex items-center gap-x-2 mb-1">
                <span className="text-[10px] tabular-nums text-neutral-500 tracking-wider">
                    {time}
                </span>
                <span className="w-1 h-1 rounded-full bg-neutral-700"/>
                <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 truncate">
                    {user}
                </span>
            </div>
            <div className="flex items-center gap-x-1.5">
                <span
                    className="material-symbols-outlined select-none text-blue_main shrink-0"
                    style={{
                        fontSize: "14px",
                        lineHeight: 1,
                        fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24",
                    }}
                >
                    play_arrow
                </span>
                <span className="text-sm text-white truncate">
                    {sound}
                </span>
            </div>
        </div>
    );
};

const CLOSE_MS = 280;

const LogList = () => {
    const [show, setShow] = useState(false);
    const [closing, setClosing] = useState(false);
    const {completeLog, clearLog} = useLogListener();
    const endOfLogRef = useRef<HTMLDivElement>(null);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (show && !closing) {
            endOfLogRef.current?.scrollIntoView({behavior: "smooth"});
        }
    }, [completeLog, show, closing]);

    useEffect(() => {
        return () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        };
    }, []);

    const handleOpen = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
        setClosing(false);
        setShow(true);
    };

    const handleClose = () => {
        if (closing) return;
        setClosing(true);
        closeTimerRef.current = setTimeout(() => {
            setShow(false);
            setClosing(false);
            closeTimerRef.current = null;
        }, CLOSE_MS);
    };

    return (
        <>
            <Button onClick={handleOpen} text={"Log"} variant={"secondary"}/>
            {show && (
                <div className="fixed inset-0 z-[9999]">
                    <div
                        className={`sb-log-backdrop fixed inset-0 backdrop-blur-sm bg-black/50 ${closing ? "closing" : ""}`}
                        onClick={handleClose}
                    />
                    <div className={`sb-log-panel ${closing ? "closing" : ""} fixed top-0 right-0 bottom-0 w-[420px] max-w-[90vw] bg-neutral-900 border-l border-neutral-800 flex flex-col shadow-2xl`}>
                        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
                            <div className="flex items-center gap-x-2">
                                <span
                                    className="material-symbols-outlined select-none text-neutral-400 leading-none"
                                    style={{
                                        fontSize: "18px",
                                        fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24",
                                    }}
                                >
                                    history
                                </span>
                                <span className="text-white font-semibold text-[15px] tracking-wide leading-none">Log</span>
                                <span className="inline-flex items-center text-[10px] text-neutral-400 tabular-nums px-1.5 py-0.5 rounded-full border border-neutral-800 bg-neutral-800/40 leading-none ml-1">
                                    {completeLog.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-x-3">
                                {completeLog.length > 0 && (
                                    <button
                                        onClick={clearLog}
                                        className="inline-flex items-center text-[10pt] uppercase tracking-[0.15em] text-neutral-400 hover:text-white transition-colors leading-none"
                                    >
                                        Leeren
                                    </button>
                                )}
                                <button
                                    onClick={handleClose}
                                    className="inline-flex items-center text-neutral-400 hover:text-white transition-colors leading-none"
                                    aria-label="close"
                                >
                                    <span
                                        className="material-symbols-outlined select-none leading-none"
                                        style={{
                                            fontSize: "20px",
                                            fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24",
                                        }}
                                    >
                                        close
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-2 py-3">
                            {completeLog.length > 0 && (
                                <div className="space-y-0.5">
                                    {completeLog.map((entry, index) => (
                                        <LogEntry key={index} text={entry}/>
                                    ))}
                                    <div ref={endOfLogRef}/>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default LogList;
