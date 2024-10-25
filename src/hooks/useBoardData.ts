import { useEffect, useState } from "react";
import apiService, { SoundSchema} from "../modules/api";
import socket from "../modules/notifications/socket";


const useBoardData = () => {
    const [allSounds, setAllSounds] = useState<SoundSchema[]>([]);

    const fetchData = async () => {
        try {
            const sounds = await apiService.getAllFiles();
            setAllSounds(sounds);
        } catch (error) {
            console.error('Error fetching sounds:', error);
        }
    };

    useEffect(() => {
        fetchData();

        socket.on('updatedSoundboard', (newSound: SoundSchema) => {
            setAllSounds((prevSounds) => [...prevSounds, newSound]);
        });

        return () => {
            socket.off('updatedSoundboard');
        };
    }, []);

    return allSounds;
};

export default useBoardData;
