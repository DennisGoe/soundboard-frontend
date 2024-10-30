import React from 'react';
import {SoundSchema} from "../modules/api";
import {Icon} from "./utils/Icon";
import socket from "../modules/notifications/socket";

interface FavouriteListEntryProps {
    favourite: SoundSchema
}

const FavouriteListEntry = ({favourite}:FavouriteListEntryProps) => {
    const handleClick = () => {
        socket.emit("playSound", favourite);

    }
    return (
        <div className={"flex items-center w-full p-2 cursor-pointer gap-x-3 text-white hover:bg-neutral-700"}
        onClick={handleClick}>
            <Icon icon={"kid_star"} className={"text-yellow-300 text-sm"}/>
            <span className={""}>{favourite.name}</span>
        </div>
    );
};

export default FavouriteListEntry;