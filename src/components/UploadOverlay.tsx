import React, {useState} from "react";
import apiService from "../modules/api";
import {ToastManager} from "../modules/notifications/ToastService";
import {SuccessToastTemplate} from "../modules/notifications/ToastTemplates";
import StandardInput from "./utils/StandardInput";
import Button from "./utils/Button";

interface UploadOverlayProps {
    file: File | undefined;
    setShow: (value: boolean) => void;
}

const UploadOverlay = ({file, setShow}: UploadOverlayProps) => {
    const [name, setName] = useState("");
    const confirmUpload = async () => {
        if (file && name) {
            try {
                await apiService.uploadFile(file, name);
                setShow(false);
                ToastManager.show({...SuccessToastTemplate});
            } catch (error: any) {
                ToastManager.show({...SuccessToastTemplate, translationKey: error.msg});
                console.error("Error uploading file:", error);
            }
        }
    };
    return (
        <div
            // onClick={() => setShow(false)}
            className={"absolute w-screen h-screen bg-black bg-opacity-70 flex items-center justify-center"}>
            <div
                className={"absolute w-[30%] py-8 h-48rounded-md shadow-sm bg-neutral-700 flex flex-col items-center text-white"}>
                File:
                <span>{file?.name}</span>
                <div className={"w-1/2 mt-8"}>
                    <span>Bezeichnung</span>
                    <StandardInput
                        className={"rounded-none bg-neutral-800 border-neutral-700 border-[1px] p-2 text-white"}
                        value={name} setValue={setName}/>
                </div>
                {name && file &&
                    <div className={"h-8 w-1/3 mt-20"}>
                        <Button onClick={confirmUpload} text={"Upload"}/>
                    </div>
                }
            </div>
        </div>
    );
};

export default UploadOverlay;