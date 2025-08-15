import {useSelector} from "react-redux";
import {useEffect, useState} from "react";
import { getSocket } from "../modules/notifications/socket";
import {SoundSchema} from "../modules/api";

interface Props {
    sound: SoundSchema;
}

const usePlaySoundListener = ({sound}: Props) => {
    const volume = useSelector((state: any) => state.settings?.volume);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const socket = getSocket();
        
        const handlePlaySound = (data: SoundSchema) => {
            if (data._id === sound._id) {
                const audio = new Audio(data.url);
                audio.volume = (volume ?? 100) / 100;

                audio.onplay = () => setIsPlaying(true);
                audio.onended = () => setIsPlaying(false);

                audio.play().catch((error) => {
                    console.error('Error playing audio:', error);
                    setIsPlaying(false);
                });
            }
        };

        socket.on("playSound", handlePlaySound);

        return () => {
            socket.off("playSound", handlePlaySound);
        };
    }, [sound._id, volume]);

    return {isPlaying};
};

export default usePlaySoundListener;
