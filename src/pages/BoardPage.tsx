import React, {useState} from "react";
import Board from "../components/Board";
import UploadOverlay from "../components/UploadOverlay";
import Options from "../components/Options";
import LeftSideBar from "../components/LeftSideBar";


const BoardPage = () => {
    const [showUploadOverlay, setShowUploadOverlay] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);
    const handleFileChange = (file: File | undefined) => {
        setShowUploadOverlay(true);
        setSelectedFile(file);
    };
    return (
        <div
            className={"w-full h-screen w-full flex flex-col items-center justify-center bg-neutral-900 "}>
            <Options handleFileChange={handleFileChange}/>
            <div className={"flex-1 w-full flex-1  flex"}>
                <div className={"w-[20%] border-r-[1px] relative border-neutral-500 h-full"}>
                    <LeftSideBar/>
                </div>
                <div className={"w-full h-full  relative"}>
                    <div className={"absolute left-0 right-0 top-0 bottom-0 overflow-y-auto"}>
                        <Board/>
                    </div>
                </div>
            </div>
            {
                showUploadOverlay &&
                <UploadOverlay file={selectedFile} setShow={setShowUploadOverlay}/>
            }
        </div>
    );
};
export default BoardPage;