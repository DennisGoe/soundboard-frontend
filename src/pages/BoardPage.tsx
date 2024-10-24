import React from "react";
import Board from "./Board";
import LogoutButton from "../components/LogoutButton";
import UploadFileButton from "../components/utils/UploadFileButton";


const BoardPage = () => {
    return (
        <div
            className={"w-full h-screen flex items-center justify-center bg-neutral-900 "}>
            <LogoutButton/>
            <div className={"flex flex-col gap-y-5"}>
                <Board/>
                <UploadFileButton/>
            </div>
        </div>
    );
};
export default BoardPage;