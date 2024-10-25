import React, { useEffect } from "react";
import { SoundSchema } from "../modules/api";
import socket from "../modules/notifications/socket";

interface TileProps {
    sound: SoundSchema;
}

const Tile = ({ sound }: TileProps) => {
    const playSound = () => {
        socket.emit("playSound", sound);
    };

    useEffect(() => {
        socket.on("playSound", (data: SoundSchema) => {
            if (data._id === sound._id) {
                const audio = new Audio(data.url);
                audio.play();
            }
        });

        return () => {
            socket.off("playSound");
        };
    }, [sound._id]);

    return (
        <div
            onClick={playSound}
            className={"bg-neutral-800 p-2 w-24 break-words aspect-square flex items-center justify-center rounded-sm cursor-pointer border-neutral-700 border-[1px] text-white hover:bg-neutral-700"}
        >
            <span className={"break-words text-sm max-w-full"}>{sound?.name}</span>
        </div>
    );
};

export default Tile;
