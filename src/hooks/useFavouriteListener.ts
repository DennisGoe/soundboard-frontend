import {useEffect} from "react";
import apiService from "../modules/api";
import store from "../store/store";
import boardSlice from "../store/slices/board";
import { getSocket } from "../modules/notifications/socket";
import {useSelector} from "react-redux";

const useFavouriteListener = () => {
    const token = useSelector(() => store.getState().auth?.token)
    
    const fetchFavorites = async () => {
        try {
            const response = await apiService.getFavourites();
            store.dispatch(boardSlice.actions.setFavourites(response.favourites));
        } catch (e: any) {
            console.log("error fetching favourites", e.msg);
            // If it's an auth error, the interceptor will handle it
        }
    };

    useEffect(() => {
        if (token) {
            fetchFavorites();
        }
    }, [token]);

    useEffect(() => {
        const socket = getSocket();
        
        const handleUpdatedFavorites = () => {
            fetchFavorites();
        };

        socket.on("updatedFavorites", handleUpdatedFavorites);

        return () => {
            socket.off("updatedFavorites", handleUpdatedFavorites);
        };
    }, []);
};

export default useFavouriteListener;
