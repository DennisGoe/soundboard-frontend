import React, { useRef } from 'react';
import Button from "./Button";
import apiService from "../../modules/api";

interface UploadFileButtonProps {}

const UploadFileButton = ({}: UploadFileButtonProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleButtonClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            try {
                console.log("UPLOADING");
                // Call the uploadFile function from apiService
                const response = await apiService.uploadFile(file, "eier wir brauchen eier");
                console.log('File uploaded successfully:', response);
            } catch (error) {
                console.error('Error uploading file:', error);
            }
        }
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