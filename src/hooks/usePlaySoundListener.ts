import {useSelector} from "react-redux";
import {useEffect} from "react";
import socket from "../modules/notifications/socket";
import {SoundSchema} from "../modules/api";

const usePlaySoundListener = () => {
    const volume = useSelector((state: any) => state.settings?.volume);

    useEffect(() => {
        socket.on("playSound", (data: SoundSchema) => {
            const audio = new Audio(data.url);
            audio.volume = (volume ?? 100) / 100;
            audio.play();
        });

        return () => {
            socket.off("playSound");
        };
    }, [volume]);
};

export default usePlaySoundListener;
