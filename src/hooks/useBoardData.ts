import { useEffect, useState } from "react";
import apiService, { SoundSchema } from "../modules/api";
import { io } from "socket.io-client";

const socket = io('http://localhost:3000'); // Connect to the backend server

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
