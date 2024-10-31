import React from 'react';

interface ButtonProps {
    onClick:() => void,
    text:string,
    className?:string
}

const Button = ({ text, onClick, className = ""}:ButtonProps) => {
    return (
        <button
            onClick={onClick}
            className={"w-full cursor-pointer h-full text-white rounded-full bg-blue-500 hover:bg-blue-600 px-2 py-1"}>
            {text}
        </button>
    );
};

export default Button;