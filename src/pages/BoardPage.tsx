import React from "react";
import useBoardData from "../hooks/useBoardData";
import Board from "./Board";

interface BoardPageProps {
}

const BoardPage = ({}: BoardPageProps) => {
    return (
        <div
            className={"w-full h-screen flex items-center justify-center bg-neutral-900 "}>
            <Board/>
        </div>
    );
};
export default BoardPage;