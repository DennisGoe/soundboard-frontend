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
        <input className={`${className} w-full h-10  bg-neutral-200 rounded-full pl-10 `}
               value={value}
               placeholder={placeholder}
               type={password ? "password" : "text"}
               onChange={(e) => setValue(e.target.value)}/>
    );
};

export default StandardInput;