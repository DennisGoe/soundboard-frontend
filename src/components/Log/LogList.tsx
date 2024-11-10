import React, {useEffect, useRef, useState} from "react";
import useLogListener from "./useLogListener";

const LogList = () => {
    const [show, setShow] = useState(false);
    const {completeLog} = useLogListener();
    const endOfLogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endOfLogRef.current?.scrollIntoView({behavior: "smooth"});
    }, [completeLog]);

    return (
        <>
            <div
                className={"w-5 h-5 bg-blue-600 absolute top-2 right-2 rounded-full cursor-pointer bg-opacity-0 hover:bg-opacity-100"}
                onClick={() => setShow(true)}
            />
            {show && <div className={"fixed h-screen w-screen"}>
                <div className="absolute inset-0 backdrop-blur-sm" onClick={() => setShow(false)}></div>
                <div className={"absolute flex flex-col right-0 bottom-0 w-1/3 rounded-2xl p-2 bg-[#121212] text-white top-[50%]"}>
                    <span className={"font-bold"}>Log</span>
                    <div className={"w-full flex-1  relative "}>
                    <div
                        className=" absolute inset-0  flex flex-col overflow-y-auto">
                        {completeLog.map((entry, index) => (
                            <span key={index} className="mb-1 p-2 bg-gray-700 rounded-lg">
                                {entry}
                            </span>
                        ))}
                        <div ref={endOfLogRef}/>
                    </div>
                    </div>
                </div>
            </div>}
        </>
    );
};

export default LogList;
