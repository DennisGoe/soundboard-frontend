import React, {useState} from "react";
import apiService, {SoundSchema} from "../modules/api";
import {Icon} from "./utils/Icon";
import {ToastManager} from "../modules/notifications/ToastService";
import {FailureToastTemplate, SuccessToastTemplate} from "../modules/notifications/ToastTemplates";
import useIsFavourite from "../hooks/useIsFavourite";
import {playSound} from "./utils/functions";
import usePlaySoundListener from "../hooks/usePlaySoundListener";
import {cn} from "../Utils/cn";
import boardSlice from "../store/slices/board";
import store from "../store/store";

interface TileProps {
    sound: SoundSchema;
}

const Tile = ({sound}: TileProps) => {
    const [showDelete, setShowDelete] = useState(false);
    const {isFavourite} = useIsFavourite({sound});
    const {isPlaying} = usePlaySoundListener({sound});
    const [isHovering, setIsHovering] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        store.dispatch(boardSlice.actions.setSelectedSound(sound));
        store.dispatch(boardSlice.actions.setShowDelete(true));
    };

    const handleFavClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        apiService.changeFavourites(sound._id);
    };

    return (
        <div
            className="aspect-[9/12] w-28 border-[1px] relative hover:border-blue_main hover:border-opacity-80 transition-all duration-300 hover:cursor-pointer border-neutral-800 rounded-lg overflow-hidden flex flex-col"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={() => playSound(sound)}
        >
            {
                isHovering &&
                <Icon icon={"delete"} className={"text-red-600 text-xs absolute hover:scale-105 top-1 right-1"}
                      onClick={handleDelete}/>
            }
            <div
                className={`w-full h-2/3 bg-gradient-to-br transition-all duration-300 flex to-neutral-900 items-center justify-center ${
                    (isHovering || isPlaying) ? "from-[rgba(45,115,227,0.2)]" : "from-neutral-800 "
                }`}
            >
                <div
                    className={`aspect-square w-[52px]  flex items-center justify-center transition-all duration-300  rounded-full bg-opacity-30 ${
                        (isHovering || isPlaying) ? "bg-blue-500 bg-opacity-15" : "bg-neutral-700"
                    }`}>
                    <div
                        className={`aspect-square w-[38px]  flex items-center justify-center transition-all duration-300  rounded-full bg-opacity-60 ${
                            (isHovering || isPlaying) ? "bg-blue-500 bg-opacity-20" : "bg-neutral-700"
                        }`}>
                        <Icon icon="play_arrow"
                              className={`text-2xl transition-all text-white duration-300 hover:scale-105 ${
                                  (isHovering || isPlaying) ? "text-opacity-80" : ""
                              }`}/>
                    </div>
                </div>
            </div>
            <div className="flex-1 flex items-center px-1 w-full">
                <span className="break-words text-white text-[9pt] max-w-full">{sound?.name}</span>
            </div>
            <div className={"absolute top-1 left-2"}>
                <Icon icon={"kid_star"}
                      onClick={e => handleFavClick(e)}
                      className={`text-[12pt] transition-all duration-300  hover:scale-125 ${isFavourite ? "text-yellow-300" : "text-neutral-600"}`}/>
            </div>
        </div>

    );
};

export default Tile;
