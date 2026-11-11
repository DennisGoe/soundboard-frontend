import React from "react";
import {Link} from "react-router-dom";
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
                <Link
                    to="/kampagnen"
                    className={"text-neutral-400 hover:text-amber-200 text-xs uppercase tracking-widest px-2 py-1 border border-neutral-700 rounded hover:border-amber-600 transition-colors"}
                    title={"Kampagnen (D&D-Builder)"}
                >
                    Kampagnen
                </Link>
                <RandomSoundButton/>
                <UploadFileButton handleOpenFileUpload={handleFileChange}/>
                <LogList/>
            </div>
        </div>
    );
};

export default Options;