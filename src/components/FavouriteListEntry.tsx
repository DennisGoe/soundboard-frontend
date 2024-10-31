import React from 'react';
import apiService, {SoundSchema} from "../modules/api";
import {Icon} from "./utils/Icon";
import socket from "../modules/notifications/socket";
import {playSound} from "./utils/functions";

interface FavouriteListEntryProps {
    favourite: SoundSchema
}

const FavouriteListEntry = ({favourite}:FavouriteListEntryProps) => {

    const handleStarClick = (e : React.MouseEvent) => {
        e.stopPropagation()
        apiService.changeFavourites(favourite._id);
    }

    return (
        <div className={"flex items-center w-full p-2 cursor-pointer gap-x-3 text-white hover:bg-neutral-700"}
        onClick={() => playSound(favourite)}>
            <Icon icon={"kid_star"}
                  onClick={e => handleStarClick(e)}
                  className={"text-yellow-300 text-sm hover:scale-[1.5]"}/>
            <span className={""}>{favourite.name}</span>
        </div>
    );
};

export default FavouriteListEntry;