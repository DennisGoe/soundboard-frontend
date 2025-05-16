import React from "react";
import {twMerge} from "tailwind-merge";
import Icon from "./Icon";

interface ButtonProps {
    onClick: () => void;
    icon?: string;
    iconClassName?: string;
    text: string;
    className?: string;
    variant?: "default" | "secondary";
}

const Button = ({
                    text,
                    onClick,
                    icon,
                    iconClassName,
                    className = "",
                    variant = "default"
                }: ButtonProps) => {
    const baseStyles = {
        default: "bg-blue-500 hover:bg-blue-600 py-1 px-4",
        secondary:"bg-black gap-x-4 border border-neutral-800 py-2 px-4 transition-all duration-200 hover:bg-neutral-900 hover:bg-opacity-30 hover:brightness-110"
    };

    return (
        <div
            onClick={onClick}
            className={twMerge(
                "cursor-pointer h-full text-white flex items-center justify-center rounded-md",
                baseStyles[variant],
                className
            )}
        >
            {icon && <Icon icon={icon} className={iconClassName}/>}
            {text && (text.trim() !== "") &&
                <span className="font-light">{text}</span>
            }
        </div>
    );
};

export default Button;
