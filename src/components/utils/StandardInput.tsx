import React from "react";

interface StandardInputProps {
    value: string,
    setValue: (value: string) => void,
    password?: boolean,
    className?: string,
    placeholder?: string
}

const StandardInput = ({value, setValue, password = false, className = "", placeholder = ""}: StandardInputProps) => {
    return (
        <input
            className={`w-full text-white placeholder:text-neutral-500 bg-neutral-800 border border-neutral-800 rounded-lg py-1.5 px-3 text-sm transition-colors duration-200 hover:border-blue_main hover:border-opacity-80 focus:border-blue_main focus:border-opacity-100 focus:outline-none ${className}`}
            value={value}
            placeholder={placeholder}
            type={password ? "password" : "text"}
            onChange={(e) => setValue(e.target.value)}
        />
    );
};

export default StandardInput;
