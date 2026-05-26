import React, {useEffect, useState} from "react";
import Board from "../components/Board";
import UploadOverlay from "../components/UploadOverlay";
import Options from "../components/Options";
import LeftSideBar from "../components/LeftSideBar";
import {DeleteModal} from "../components/DeleteModal";
import NowPlayingBanner from "../components/NowPlayingBanner";
import {useSelector} from "react-redux";
import store from "../store/store";
import {initAudioPlayer} from "../modules/audioPlayer";


const BoardPage = () => {
    const showDelete = useSelector(() => store.getState().board?.showDelete);
    const [showUploadOverlay, setShowUploadOverlay] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);

    useEffect(() => {
        initAudioPlayer();
    }, []);

    const handleFileChange = (file: File | undefined) => {
        setShowUploadOverlay(true);
        setSelectedFile(file);
    };
    return (
        <div className={"w-full h-screen flex bg-neutral-900"}>
            {showDelete &&
                <DeleteModal/>
            }
            <div className={"w-[20%] border-r-[1px] relative border-neutral-800 h-full"}>
                <LeftSideBar/>
            </div>
            <div className={"flex-1 h-full px-2 flex flex-col"}>
                <Options handleFileChange={handleFileChange}/>
                <div className={"flex-1 w-full relative"}>
                    <div className={"absolute left-0 right-0 top-0 bottom-0 overflow-y-auto"}>
                        <Board/>
                    </div>
                </div>
            </div>
            {
                showUploadOverlay &&
                <UploadOverlay file={selectedFile} setShow={setShowUploadOverlay}/>
            }
            <NowPlayingBanner/>

        </div>
    );
};
export default BoardPage;