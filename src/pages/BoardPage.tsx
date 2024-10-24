import React, {useState} from "react";
import Board from "./Board";
import UploadOverlay from "../components/utils/UploadOverlay";
import Options from "../components/utils/Options";


const BoardPage = () => {
    const [showUploadOverlay, setShowUploadOverlay] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);
    const handleFileChange = (file: File | undefined) => {
        setShowUploadOverlay(true);
        setSelectedFile(file);
    };
    return (
        <div
            className={"w-full h-screen flex items-center justify-center bg-neutral-900 "}>
            <Options handleFileChange={handleFileChange}/>
            <div className={"flex flex-col w-full gap-y-5"}>
                <Board/>
            </div>
            {
                showUploadOverlay &&
                <UploadOverlay file={selectedFile} setShow={setShowUploadOverlay}/>
            }
        </div>
    );
};
export default BoardPage;