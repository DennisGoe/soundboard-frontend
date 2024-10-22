import React, {useEffect, useState} from "react";

interface ToastProps {
    translationKey: string;
    bgColor?: string;
    iconName?: string;
    textColor?: string;
}

const Toast: React.FC<ToastProps> = ({translationKey, bgColor = "bg-black", iconName, textColor = "text-white"}) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);

        const timer = setTimeout(() => setIsVisible(false), 3000); // Adjust time as necessary

        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            className={`fixed top-0 left-1/2 transform -translate-x-1/2 ${isVisible ? "translate-y-5 opacity-100" : "-translate-y-10 opacity-0"} transition-opacity duration-200 ease-in-out ${bgColor} ${textColor} py-2 px-4 rounded-md z-[9999] flex items-center gap-x-2`}>
            <span className={`transition ease-in-out duration-700`}>{translationKey}</span>
        </div>
    );
};

export default Toast;
