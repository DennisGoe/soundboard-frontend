import React, {useState, useEffect} from "react";
import ReactDOM from "react-dom";
import {ToastManager} from "./ToastService";
import Toast from "./Toast";

interface ToastMessage {
    translationKey: string;
    bgColor?: string;
    iconName?: string;
    textColor?: string;
}

export const ToastProvider: React.FC = () => {
    const [message, setMessage] = useState<ToastMessage | null>(null);

    useEffect(() => {
        ToastManager.subscribe((msg: ToastMessage | null) => setMessage(msg));

        return () => {
            ToastManager.subscribe(() => {
            });
        };
    }, []);

    return (
        <>
            {message && ReactDOM.createPortal(
                <Toast
                    translationKey={message.translationKey}
                    bgColor={message.bgColor}
                    iconName={message.iconName}
                    textColor={message.textColor}
                />,
                document.body
            )}
        </>
    );
};
