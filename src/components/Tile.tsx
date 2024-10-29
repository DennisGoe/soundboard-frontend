import React, {useEffect, useState} from "react";
import apiService, {SoundSchema} from "../modules/api";
import socket from "../modules/notifications/socket";
import {useSelector} from "react-redux";
import {Icon} from "./utils/Icon";
import {ToastManager} from "../modules/notifications/ToastService";
import {FailureToastTemplate, SuccessToastTemplate} from "../modules/notifications/ToastTemplates";
import useIsFavourite from "../hooks/useIsFavourite";

interface TileProps {
    sound: SoundSchema;
}

const Tile = ({sound}: TileProps) => {
    const [showDelete, setShowDelete] = useState(false);
    const {isFavourite} = useIsFavourite({sound});

    const playSound = () => {
        socket.emit("playSound", sound);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await apiService.deleteFile(sound._id);
            ToastManager.show({...SuccessToastTemplate});
        } catch (e) {
            ToastManager.show({...FailureToastTemplate});
        }
    };

    const handleFavClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        apiService.changeFavourites(sound._id);
    };

    return (
        <div
            onClick={playSound}
            onMouseEnter={() => setShowDelete(true)}
            onMouseLeave={() => setShowDelete(false)}
            className={"bg-neutral-800 relative p-2 w-24 h-24 break-words aspect-square flex items-center justify-center rounded-sm cursor-pointer border-neutral-700 border-[1px] text-white hover:bg-neutral-700"}
        >
            <span className={"break-words text-sm max-w-full"}>{sound?.name}</span>
            <div className={"absolute top-0 left-0"}>
                <Icon icon={"kid_star"}
                      onClick={e => handleFavClick(e)}
                      className={`text-[12pt] hover:scale-125 ${isFavourite ? "text-yellow-300" : ""}`}/>
            </div>
            {
                showDelete &&
                <div className={"absolute top-0 right-0 text-red-600 hover:scale-125"}>
                    <Icon icon={"delete"}
                          onClick={e => handleDelete(e)}
                          className={"text-[15pt]"}/>
                </div>
            }
        </div>
    );
};

export default Tile;
