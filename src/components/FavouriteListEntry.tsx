import React, {useState} from "react";
import apiService, {SoundSchema} from "../modules/api";
import {Icon} from "./utils/Icon";
import {playSound} from "./utils/functions";
import usePlaySoundListener from "../hooks/usePlaySoundListener";

interface FavouriteListEntryProps {
    favourite: SoundSchema;
    index: number;
}

const FavouriteListEntry = ({favourite, index}: FavouriteListEntryProps) => {
    const [hover, setHover] = useState(false);
    const {isPlaying} = usePlaySoundListener({sound: favourite});

    const handleStarClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        apiService.changeFavourites(favourite._id);
    };

    const active = hover || isPlaying;
    const num = String(index + 1).padStart(2, "0");

    return (
        <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={() => playSound(favourite)}
            className={`group relative flex items-center gap-x-2.5 w-full h-9 pl-3 pr-2 rounded-md cursor-pointer overflow-hidden transition-all duration-300 ${active ? "sb-glass-grain" : ""}`}
            style={{
                background: isPlaying
                    ? "linear-gradient(90deg, rgba(45,115,227,0.22) 0%, rgba(45,115,227,0.05) 60%, transparent 100%)"
                    : hover
                        ? "rgba(255,255,255,0.06)"
                        : "transparent",
                backdropFilter: active ? "blur(10px) saturate(140%)" : undefined,
                WebkitBackdropFilter: active ? "blur(10px) saturate(140%)" : undefined,
                boxShadow: hover && !isPlaying ? "inset 0 0 0 1px rgba(255,255,255,0.06)" : undefined,
            }}
        >
            <span
                aria-hidden
                className={"absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm transition-all duration-300"}
                style={{
                    background: "#2d73e3",
                    opacity: active ? 1 : 0,
                    transform: active ? "scaleY(1)" : "scaleY(0.4)",
                }}
            />

            <div className={"w-6 h-5 flex items-center justify-end shrink-0"}>
                <span
                    className={"text-[10px] tabular-nums tracking-wider transition-colors"}
                    style={{color: isPlaying ? "#2d73e3" : hover ? "#a3a3a3" : "#525252"}}
                >
                    {num}
                </span>
            </div>

            <div className={"w-5 h-5 flex items-center justify-center shrink-0 leading-none"}>
                {isPlaying ? (
                    <div className={"flex items-end gap-[2px] h-3.5"} style={{color: "#2d73e3"}}>
                        {[0, 1, 2].map((i) => (
                            <span
                                key={i}
                                className={"sb-bar"}
                                style={{
                                    width: 2,
                                    animationDelay: `${i * 110}ms`,
                                    animationDuration: `${600 + i * 70}ms`,
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <span
                        className={`material-symbols-outlined select-none transition-all duration-200 leading-none ${
                            hover ? "text-white opacity-100 scale-100" : "text-neutral-600 opacity-70 scale-90"
                        }`}
                        style={{
                            fontSize: "18px",
                            fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24",
                        }}
                    >
                        play_arrow
                    </span>
                )}
            </div>

            <span
                className={"flex-1 text-sm truncate transition-all duration-300"}
                style={{
                    color: active ? "#fff" : "#d4d4d4",
                    letterSpacing: active ? "0.012em" : undefined,
                }}
            >
                {favourite.name}
            </span>

            <Icon
                icon={"kid_star"}
                onClick={handleStarClick}
                className={"text-[11pt] text-yellow-300 hover:scale-125 transition-transform shrink-0"}
            />
        </div>
    );
};

export default FavouriteListEntry;
