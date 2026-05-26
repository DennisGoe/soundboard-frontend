import React, {useState} from "react";
import apiService, {SoundSchema} from "../modules/api";
import {Icon} from "./utils/Icon";
import useIsFavourite from "../hooks/useIsFavourite";
import {playSound} from "./utils/functions";
import usePlaySoundListener from "../hooks/usePlaySoundListener";
import boardSlice from "../store/slices/board";
import store from "../store/store";

interface TileProps {
    sound: SoundSchema;
    index?: number;
    animate?: boolean;
}

const Tile = ({sound, index = 0, animate = false}: TileProps) => {
    const {isFavourite} = useIsFavourite({sound});
    const {isPlaying} = usePlaySoundListener({sound});
    const [isHovering, setIsHovering] = useState(false);
    const [isPressing, setIsPressing] = useState(false);
    const [rippleKey, setRippleKey] = useState(0);

    const active = isHovering || isPlaying;

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        store.dispatch(boardSlice.actions.setSelectedSound(sound));
        store.dispatch(boardSlice.actions.setShowDelete(true));
    };

    const handleFavClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        apiService.changeFavourites(sound._id);
    };

    const tileStyle: React.CSSProperties = {};
    if (animate) {
        tileStyle.animationDelay = `${200 + Math.min(index * 8, 950)}ms`;
    }
    (tileStyle as any)["--blue-overlay"] = active
        ? "radial-gradient(circle 300px at 50% 250%, rgba(255,255,255,0.01) 100%, transparent 100%), rgba(45,115,227,0.08)"
        : "transparent";

    return (
        <div
            className={`sb-glass-grain aspect-[9/12] w-28 border-[1px] relative hover:border-blue_main hover:border-opacity-80 transition-all duration-300 hover:cursor-pointer border-neutral-800 rounded-lg overflow-hidden flex flex-col ${animate ? "sb-tile-in" : ""}`}
            style={tileStyle}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => { setIsHovering(false); setIsPressing(false); }}
            onMouseDown={() => setIsPressing(true)}
            onMouseUp={() => setIsPressing(false)}
            onClick={() => { setRippleKey(k => k + 1); playSound(sound); }}
        >
            {
                isHovering &&
                <Icon icon={"delete"} className={"text-red-600 text-xs absolute hover:scale-105 top-1 right-1 z-10"}
                      onClick={handleDelete}/>
            }
            <div
                className="w-full h-2/3 relative transition-all duration-300 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900"
            >
                {rippleKey > 0 && (
                    <>
                        <span key={`r1-${rippleKey}`} aria-hidden className="sb-click-ripple"/>
                        <span key={`r2-${rippleKey}`} aria-hidden className="sb-click-ripple" style={{animationDelay: "120ms"}}/>
                    </>
                )}
                <div
                    className="aspect-square w-[52px] relative flex items-center justify-center rounded-full"
                    style={{
                        background: "rgba(38,38,38,0.7)",
                        boxShadow: "inset 0 2px 5px rgba(0,0,0,0.55), inset 0 -1px 0 rgba(255,255,255,0.04)",
                    }}
                >
                    <div
                        className="aspect-square w-[38px] flex items-center justify-center rounded-full"
                        style={{
                            background: isPlaying
                                ? "rgba(45,115,227,0.55)"
                                : "rgba(82,82,82,0.95)",
                            boxShadow: isPressing
                                ? "inset 0 3px 6px rgba(0,0,0,0.55), inset 0 -1px 0 rgba(255,255,255,0.04)"
                                : "0 3px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 4px rgba(0,0,0,0.25)",
                            transition: "box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1), background 300ms ease",
                        }}
                    >
                        {isPlaying ? (
                            <div className="flex items-end gap-[3px] h-5" style={{color: "#fff"}}>
                                {[0, 1, 2, 3].map((i) => (
                                    <span
                                        key={i}
                                        className="sb-bar"
                                        style={{
                                            width: 2.5,
                                            animationDelay: `${i * 130}ms`,
                                            animationDuration: `${640 + i * 80}ms`,
                                        }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <Icon icon="play_arrow" className="text-2xl text-white"/>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex-1 flex items-center px-1 w-full">
                <span className="break-words text-white text-[9pt] max-w-full">
                    {sound?.name}
                </span>
            </div>
            <div className={"absolute top-1 left-2 z-10"}>
                <Icon icon={"kid_star"}
                      onClick={e => handleFavClick(e)}
                      className={`text-[12pt] transition-all duration-300  hover:scale-125 ${isFavourite ? "text-yellow-300" : "text-neutral-600"}`}/>
            </div>
        </div>

    );
};

export default Tile;
