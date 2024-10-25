import React, {useState} from "react";
import Board from "../components/Board";
import UploadOverlay from "../components/UploadOverlay";
import Options from "../components/Options";


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