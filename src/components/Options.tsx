import React from 'react';
import LogoutButton from "./LogoutButton";
import UploadFileButton from "./UploadFileButton";
import VolumeSlider from "./VolumeSlider";
import {useSelector} from "react-redux";
import store from "../store/store";

interface OptionsProps {
    handleFileChange: (value : File | undefined) => void
}
const Options = ({handleFileChange}: OptionsProps) => {
    const volume = useSelector(() => store.getState().settings?.volume)
    return (
        <div className={"absolute top-2 left-2 gap-x-4 flex items-center"}>
            <LogoutButton/>
            <div className={"w-48"}>
                <UploadFileButton handleOpenFileUpload={handleFileChange}/>
            </div>
            <div className={"w-72 text-white flex items-center gap-x-2"}>
                <span>Volume:</span>
                <VolumeSlider/>
                <span>{volume}%</span>
            </div>
        </div>
    );
};

export default Options;