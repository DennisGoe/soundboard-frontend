import React from "react";
import apiService, {SoundSchema} from "../modules/api";
import {Icon} from "./utils/Icon";
import socket from "../modules/notifications/socket";
import {playSound} from "./utils/functions";

interface FavouriteListEntryProps {
    favourite: SoundSchema;
}

const FavouriteListEntry = ({favourite}: FavouriteListEntryProps) => {

    const handleStarClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        apiService.changeFavourites(favourite._id);
    };

    return (
        <div
            className="flex items-center w-full transition-all duration-300 p-2 cursor-pointer rounded-md gap-x-3 text-white hover:bg-gradient-to-r hover:from-[rgba(45,115,227,0.2)] hover:to-[rgba(45,115,227,0.1)]"
            onClick={() => playSound(favourite)}>
            <Icon icon={"kid_star"}
                  onClick={e => handleStarClick(e)}
                  className={"text-yellow-300 text-sm hover:scale-[1.5]"}/>
            <span className={""}>{favourite.name}</span>
        </div>
    );
};

export default FavouriteListEntry;