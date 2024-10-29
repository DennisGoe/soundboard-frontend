import React from "react";
import useBoardListener from "../hooks/useBoardListener";
import Tile from "./Tile";
import {useSelector} from "react-redux";
import store from "../store/store";


const Board = () => {
   const board = useSelector(() => store.getState().board?.sounds)
    return (
        <div
            className={"flex flex-wrap mt-4 justify-center max-w-screen px-2 gap-1"}>
            {board.map(sound => {
                return (<Tile key={sound._id} sound={sound}/>);
            })}

        </div>
    );
};

export default Board;