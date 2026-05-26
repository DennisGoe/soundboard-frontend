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
        default:
            "py-1 px-2.5 gap-x-1.5 text-sm bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-800 transition-all duration-300 hover:border-blue_main hover:border-opacity-80 hover:from-[rgba(45,115,227,0.2)]",
        secondary:
            "py-1 px-3 gap-x-1.5 text-sm bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-800 transition-all duration-300 hover:border-blue_main hover:border-opacity-80 hover:from-[rgba(45,115,227,0.2)]",
    };

    return (
        <div
            onClick={onClick}
            className={twMerge(
                "group cursor-pointer text-white inline-flex items-center justify-center rounded-lg overflow-hidden select-none",
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
