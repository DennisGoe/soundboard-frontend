import React from "react";
import {Icon} from "./Icon";

interface StandardInputProps {
    value: string,
    setValue: (value: string) => void,
    password?: boolean,
    className?: string,
    placeholder?: string
}

const StandardInput = ({value, setValue, password = false, className = "", placeholder = ""}: StandardInputProps) => {
    return (
        <div className={"h-full w-full flex items-center gap-x-2 ml-10"}>
            <input className={`${className} w-full h-full bg-neutral-200 rounded-full pl-10 `}
                   value={value}
                   placeholder={placeholder}
                   type={password ? "password" : "text"}
                   onChange={(e) => setValue(e.target.value)}/>
            <Icon icon={"search"} className={"text-neutral-100"}/>
        </div>
    );
};

export default StandardInput;