import React from "react";
import {useSelector} from "react-redux";
import {RootState} from "@reduxjs/toolkit/query";
import apiService from "../modules/api";
import {ToastManager} from "../modules/notifications/ToastService";
import {FailureToastTemplate, SuccessToastTemplate} from "../modules/notifications/ToastTemplates";
import boardSlice from "../store/slices/board";
import store from "../store/store";
import Button from "./utils/Button";

interface DeleteModalProps {
}

export function DeleteModal({}: DeleteModalProps) {
    const sound = useSelector((state: any) => state.board?.selectedSound);


    const confirmDelete = async () => {
        try {
            await apiService.deleteFile(sound._id);
            ToastManager.show({...SuccessToastTemplate});
        } catch (e) {
            console.log(e);
            ToastManager.show({
                ...FailureToastTemplate

            });
        } finally {
            store.dispatch(boardSlice.actions.setSelectedSound(null));
            store.dispatch(boardSlice.actions.setShowDelete(false));
        }
    };

    const cancelDelete = () => {
        store.dispatch(boardSlice.actions.setSelectedSound(null));
        store.dispatch(boardSlice.actions.setShowDelete(false));
    };

    return (
        <div className={"backdrop-blur-sm fixed inset-0 z-30 bg-black bg-opacity-15 flex items-center justify-center"}>
            <div className={" text-white rounded-2xl shadow-2xl p-5 flex flex-col gap-y-8 bg-[#121212]"}>
                <div className={"flex flex-col gap-y-2 "}>
                    <span className={"text-blue_main"}>{sound?.name}</span>
                    löschen?
                </div>
                <div className={"flex items-center gap-x-12 justify-between w-full"}>
                    <Button onClick={cancelDelete} variant={"secondary"} text={"Abbrechen"}/>
                    <Button onClick={confirmDelete} variant={"secondary"} text={"Bestätigen"}/>
                </div>
            </div>
        </div>
    );
}
