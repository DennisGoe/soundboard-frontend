import React from "react";
import useBoardData from "../hooks/useBoardData";
import Tile from "./Tile";


const Board = () => {
    const board = useBoardData();

    return (
        <div className={"flex flex-col gap-y-1"}>
            {board.map(row => {
                return (
                    <div className={"flex gap-x-1"}>
                        {row.map((entry, index) => {
                            return <Tile entry={entry} key={index}/>;
                        })}
                    </div>
                );
            })}

        </div>
    );
};

export default Board;