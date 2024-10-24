import React from "react";
import {SoundSchema} from "../modules/api";

interface TileProps {
    sound: SoundSchema;
}

const Tile = ({sound}: TileProps) => {
    const playSound = () => {
        if (sound?.url) {
            const audio = new Audio(sound.url);
            audio.play().catch((error) => {
                console.error("Error playing sound:", error);
            });
        }
    };
    return (
        <div onClick={playSound}
            className={"bg-neutral-800 p-2 w-24 break-words aspect-square flex items-center justify-center rounded-sm cursor-pointer border-neutral-700 border-[1px] text-white  hover:bg-neutral-700 text-white"}>
            <span className={" break-words text-sm max-w-full"}>{sound?.name}</span>
        </div>
    );
};

export default Tile;