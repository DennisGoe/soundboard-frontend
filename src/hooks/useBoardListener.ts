import { useEffect } from "react";
import apiService, { SoundSchema} from "../modules/api";
import socket from "../modules/notifications/socket";
import store from "../store/store";
import boardSlice from "../store/slices/board";


const useBoardListener = () => {


    const fetchData = async () => {
        try {
            const sounds = await apiService.getAllFiles();
            store.dispatch(boardSlice.actions.setSounds(sounds))
        } catch (error) {
            console.error('Error fetching sounds:', error);
        }
    };

    useEffect(() => {
        fetchData();

        socket.on('updatedSoundboard', async(newSound: SoundSchema) => {
            await fetchData()
        });

        return () => {
            socket.off('updatedSoundboard');
        };
    }, []);


};

export default useBoardListener;
