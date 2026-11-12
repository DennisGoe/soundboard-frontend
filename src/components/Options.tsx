import React from "react";
import UploadFileButton from "./UploadFileButton";
import SearchBar from "./SearchBar";
import RandomSoundButton from "./RandomSoundButton";
import LogList from "./Log/LogList";

interface OptionsProps {
    handleFileChange: (value: File | undefined) => void;
}

const Options = ({handleFileChange}: OptionsProps) => {
    return (
        <div className={"gap-x-4 flex items-center justify-between px-2 h-[55px] w-full py-2"}>
            <SearchBar/>
            <div className={"inline-flex items-center gap-x-2 h-full"}>
                <RandomSoundButton/>
                <UploadFileButton handleOpenFileUpload={handleFileChange}/>
                <LogList/>
            </div>
        </div>
    );
};

export default Options;