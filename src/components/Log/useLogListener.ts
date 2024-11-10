import React, {useEffect, useState} from "react";
import socket from "../../modules/notifications/socket";


const useLogListener = () => {
    const [completeLog, setCompleteLog] = useState<string[]>([]);

    useEffect(() => {
        const handleLog = (entry: string) => {
            setCompleteLog((prev) => [...prev, entry]);
        };

        socket.on('log', handleLog);

        return () => {
            socket.off('log', handleLog);
        };
    }, []);

    return {completeLog};
};

export default useLogListener;
