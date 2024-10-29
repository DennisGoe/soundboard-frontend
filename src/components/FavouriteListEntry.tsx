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
        <div className={"flex items-center w-full hover:bg-neutral-600"}
        onClick={handleClick}>
            <Icon icon={"star"} className={"text-yellow-300"}/>
            <span className={""}>{favourite.name}</span>
        </div>
    );
};

export default FavouriteListEntry;