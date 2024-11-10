import React from "react";
import LogoutButton from "./LogoutButton";
import UploadFileButton from "./UploadFileButton";
import VolumeSlider from "./VolumeSlider";
import {useSelector} from "react-redux";
import store from "../store/store";
import SearchBar from "./SearchBar";
import RandomSoundButton from "./RandomSoundButton";
import Icon from "./utils/Icon";

interface OptionsProps {
    handleFileChange: (value: File | undefined) => void;
}

const Options = ({handleFileChange}: OptionsProps) => {
    const volume = useSelector(() => store.getState().settings?.volume);
    return (
        <div className={" gap-x-4 flex items-start w-full py-2"}>
            <LogoutButton/>
            <div className={"w-48"}>
                <UploadFileButton handleOpenFileUpload={handleFileChange}/>
            </div>
            <div className={"w-72 text-white h-full flex items-center gap-x-2"}>
                <span>Volume:</span>
                <VolumeSlider/>
                <span>{volume}%</span>
            </div>
            <div className={"flex items-center h-8 gap-x-2"}>
                <Icon icon={"search"} className={"text-white text-[13pt] mt-1"}/>
                <SearchBar/>
            </div>
            <div className={"w-32"}>
                <RandomSoundButton/>
            </div>
        </div>
    );
};

export default Options;