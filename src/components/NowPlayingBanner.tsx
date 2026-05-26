import React, {useEffect, useRef, useState} from "react";
import {SoundSchema} from "../modules/api";
import {subscribeGlobalPlay, subscribeIsPlaying} from "../modules/audioPlayer";

const OUT_MS = 600;

const NowPlayingBanner = () => {
    const [current, setCurrent] = useState<SoundSchema | null>(null);
    const [closing, setClosing] = useState(false);
    const unsubPlayingRef = useRef<(() => void) | null>(null);
    const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const unsub = subscribeGlobalPlay((sound) => {
            if (unsubPlayingRef.current) {
                unsubPlayingRef.current();
                unsubPlayingRef.current = null;
            }
            if (unmountTimerRef.current) {
                clearTimeout(unmountTimerRef.current);
                unmountTimerRef.current = null;
            }

            setCurrent(sound);
            setClosing(false);

            unsubPlayingRef.current = subscribeIsPlaying(sound._id, (playing) => {
                if (playing) return;
                setClosing(true);
                if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
                unmountTimerRef.current = setTimeout(() => {
                    setCurrent(null);
                    setClosing(false);
                    if (unsubPlayingRef.current) {
                        unsubPlayingRef.current();
                        unsubPlayingRef.current = null;
                    }
                }, OUT_MS);
            });
        });

        return () => {
            unsub();
            if (unsubPlayingRef.current) unsubPlayingRef.current();
            if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
        };
    }, []);

    if (!current) return null;

    return (
        <div
            key={current._id}
            className={`sb-now-playing ${closing ? "closing" : ""} fixed bottom-8 left-1/2 z-40 px-5 py-2.5 bg-neutral-800/95 backdrop-blur-md border border-neutral-700 shadow-2xl flex items-center gap-x-3 pointer-events-none`}
        >
            <div className="flex items-end gap-[3px] h-4" style={{color: "#2d73e3"}}>
                {[0, 1, 2, 3].map((i) => (
                    <span
                        key={i}
                        className="sb-bar"
                        style={{
                            width: 2,
                            animationDelay: `${i * 110}ms`,
                            animationDuration: `${600 + i * 70}ms`,
                        }}
                    />
                ))}
            </div>
            <span className="text-white text-sm font-medium whitespace-nowrap max-w-[260px] truncate">
                {current.name}
            </span>
        </div>
    );
};

export default NowPlayingBanner;
