import React, { useEffect } from "react";
import { SoundSchema } from "../modules/api";
import socket from "../modules/notifications/socket";
import { useSelector } from "react-redux";

interface TileProps {
    sound: SoundSchema;
}

const Tile = ({ sound }: TileProps) => {
    // Properly use useSelector to get the volume from the Redux store
    const volume = useSelector((state: any) => state.settings?.volume);

    const playSound = () => {
        socket.emit("playSound", sound);
    };

    useEffect(() => {
        // Register socket event listener for "playSound"
        socket.on("playSound", (data: SoundSchema) => {
            if (data._id === sound._id) {
                const audio = new Audio(data.url);
                audio.volume = (volume ?? 100) / 100; // Ensure volume is handled safely
                audio.play();
            }
        });

        // Cleanup the socket event listener on component unmount
        return () => {
            socket.off("playSound");
        };
    }, [sound._id, volume]); // Add volume to the dependency array

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
