import React, {useRef} from "react";
import {useSelector} from "react-redux";
import store from "../store/store";
import FavouriteListEntry from "./FavouriteListEntry";
import LogoutButton from "./LogoutButton";
import VolumeSlider from "./VolumeSlider";
import {Icon} from "./utils/Icon";
import settingsSlice from "../store/slices/settings";

const LeftSideBar = () => {
    const favourites = useSelector(() => store.getState().board?.favourites);
    const volume = useSelector(() => store.getState().settings?.volume) ?? 100;
    const userName = useSelector(() => store.getState().auth?.userName);

    const favCount = favourites?.length ?? 0;
    const lastVolumeRef = useRef<number>(volume > 0 ? volume : 70);

    const volumeIcon = volume === 0 ? "volume_off" : volume < 50 ? "volume_down" : "volume_up";

    const toggleMute = () => {
        if (volume > 0) {
            lastVolumeRef.current = volume;
            store.dispatch(settingsSlice.actions.setVolume(0));
        } else {
            store.dispatch(settingsSlice.actions.setVolume(lastVolumeRef.current || 70));
        }
    };

    return (
        <div className="sb-sidebar h-full flex flex-col">
            <div className="relative px-4 pt-5 pb-5">
                <span className="text-white font-bold text-base tracking-wide block">DnD Soundboard</span>
                {userName && (
                    <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500 mt-2 block">
                        als {userName}
                    </span>
                )}
                <div className="sb-divider absolute left-4 right-4 bottom-0" />
            </div>

            <div className="flex-1 overflow-y-auto px-2 pt-4 pb-2">
                <div className="flex items-center gap-x-2 px-2 mb-3">
                    <span
                        className="material-symbols-outlined select-none text-yellow-300 leading-none"
                        style={{
                            fontSize: "18px",
                            fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24",
                        }}
                    >
                        kid_star
                    </span>
                    <span className="text-neutral-200 text-[10pt] font-semibold uppercase tracking-[0.22em] leading-none">
                        Favoriten
                    </span>
                    <div className="flex-1 h-px bg-neutral-800" />
                    <span className="text-[10px] text-neutral-500 tabular-nums leading-none">
                        {String(favCount).padStart(2, "0")}
                    </span>
                </div>

                {favCount === 0 ? (
                    <div className="mt-6 mx-2 px-4 py-6 rounded-lg border border-dashed border-neutral-800 text-center">
                        <Icon icon="auto_awesome" className="text-neutral-600 text-2xl" />
                        <p className="text-neutral-500 text-xs mt-3 leading-relaxed">
                            Pinne deine Lieblings-Sounds mit dem Stern.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {favourites?.map((fav, idx) => (
                            <FavouriteListEntry key={fav._id} favourite={fav} index={idx} />
                        ))}
                    </div>
                )}
            </div>

            <div className="px-4 py-4 border-t border-neutral-800">
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-x-2">
                            <button
                                onClick={toggleMute}
                                aria-label="mute"
                                className="inline-flex items-center justify-center text-neutral-400 hover:text-white transition-colors leading-none"
                            >
                                <span
                                    key={volumeIcon}
                                    className="material-symbols-outlined select-none leading-none"
                                    style={{
                                        fontSize: "16px",
                                        fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24",
                                    }}
                                >
                                    {volumeIcon}
                                </span>
                            </button>
                            <span className="text-[10pt] uppercase tracking-[0.18em] text-neutral-400 leading-none">Volume</span>
                        </div>
                        <span className="text-xs text-neutral-300 tabular-nums leading-none">{volume}%</span>
                    </div>
                    <VolumeSlider />
                </div>
                <LogoutButton />
            </div>
        </div>
    );
};

export default LeftSideBar;
