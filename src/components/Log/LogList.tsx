import React, { useEffect, useRef, useState } from "react";
import useLogListener from "./useLogListener";
import Button from "../utils/Button";

const LogList = () => {
    const [show, setShow] = useState(false);
    const { completeLog } = useLogListener();
    const endOfLogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endOfLogRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [completeLog]);

    return (
        <>
            <Button onClick={() => setShow(true)} text={"Log"} variant={"secondary"} />
            {show && (
                <div className="fixed inset-0 z-[9999]">
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/50" onClick={() => setShow(false)}></div>
                    <div className="fixed top-10 right-10 bottom-10 w-1/3 bg-[#121212] rounded-2xl p-4 text-white flex flex-col shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <span className="font-bold text-lg">Log</span>
                            <button onClick={() => setShow(false)} className="text-sm text-gray-300 hover:text-white">Close</button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {completeLog.map((entry, index) => (
                                <span key={index} className="block p-2 bg-gray-700 rounded-lg text-sm">
                                    {entry}
                                </span>
                            ))}
                            <div ref={endOfLogRef} />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default LogList;
