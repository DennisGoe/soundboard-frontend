import React from "react";
import useBoardData from "../hooks/useBoardData";
import Tile from "./Tile";


const Board = () => {
    const board = useBoardData();
    return (
        <div className={"flex flex-wrap justify-center max-w-screen px-2 gap-1"}>
            {board.map(sound => {
                return (
                    <Tile key={sound._id} sound={sound}/>
                );
            })}

        </div>
    );
};

export default Board;