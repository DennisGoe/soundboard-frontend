import React, { useRef } from 'react';
import Button from "./utils/Button";
import {ToastManager} from "../modules/notifications/ToastService";
import {FailureToastTemplate} from "../modules/notifications/ToastTemplates";

interface UploadFileButtonProps {
    handleOpenFileUpload: (value: File | undefined) => void;
}

const UploadFileButton = ({ handleOpenFileUpload }: UploadFileButtonProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleButtonClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];

        if (file) {
            const audio = new Audio(URL.createObjectURL(file));
            audio.onloadedmetadata = () => {
                if (audio.duration <= 10) {
                    handleOpenFileUpload(file);
                } else {
                    ToastManager.show({...FailureToastTemplate, translationKey: "File darf nicht länger als 10 Sekunden sein"})
                    fileInputRef.current!.value = ""; // Clear the input
                }
            };
        }
    };

    return (
        <div>
            <Button onClick={handleButtonClick} text={"Upload MP3 File"} />
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".mp3"
                style={{ display: 'none' }}
            />
        </div>
    );
};

export default UploadFileButton;
