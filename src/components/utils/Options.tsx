import React from 'react';
import LogoutButton from "../LogoutButton";
import UploadFileButton from "./UploadFileButton";

interface OptionsProps {
    handleFileChange: (value : File | undefined) => void
}
const Options = ({handleFileChange}: OptionsProps) => {
    return (
        <div className={"absolute top-2 left-2 gap-x-4 flex items-center"}>
            <LogoutButton/>
            <div className={"w-48"}>
                <UploadFileButton handleOpenFileUpload={handleFileChange}/>
            </div>
        </div>
    );
};

export default Options;