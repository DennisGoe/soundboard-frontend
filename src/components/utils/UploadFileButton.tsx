import React, { useRef } from 'react';
import Button from "./Button";
import apiService from "../../modules/api";

interface UploadFileButtonProps {
    handleOpenFileUpload:(value: File |undefined) =>void
}

const UploadFileButton = ({handleOpenFileUpload}: UploadFileButtonProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleButtonClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        handleOpenFileUpload(file)
    };

    return (
        <div>
            <Button
                onClick={handleButtonClick}
                text={"Upload MP3 File"}
            />
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