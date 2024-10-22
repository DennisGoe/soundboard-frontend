import React from "react";

interface TileProps {
    entry: string;
}

const Tile = ({entry}: TileProps) => {
    return (
        <div
            className={"bg-neutral-800 p-5 aspect-square w-20 rounded-sm cursor-pointer border-neutral-700 border-[1px] text-white grid place-items-center hover:bg-neutral-700 text-white"}>
            {entry}
        </div>
    );
};

export default Tile;