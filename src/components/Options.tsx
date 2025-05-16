import React from "react";
import UploadFileButton from "./UploadFileButton";
import SearchBar from "./SearchBar";
import RandomSoundButton from "./RandomSoundButton";
import Icon from "./utils/Icon";
import LogList from "./Log/LogList";

interface OptionsProps {
    handleFileChange: (value: File | undefined) => void;
}

const Options = ({handleFileChange}: OptionsProps) => {
    return (
        <div className={" gap-x-4 flex items-center justify-between px-2 h-[55px] w-full py-2"}>
            <div className={"flex items-center h-full gap-x-2"}>
                <Icon icon={"search"} className={"text-white text-[13pt] mt-1"}/>
                <SearchBar/>
            </div>
            <div className={"inline-flex gap-x-2 h-full"}>
                <RandomSoundButton/>
                <UploadFileButton handleOpenFileUpload={handleFileChange}/>
                <LogList/>
            </div>
        </div>
    );
};

export default Options;