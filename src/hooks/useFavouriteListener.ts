import {useEffect} from "react";
import apiService from "../modules/api";
import store from "../store/store";
import boardSlice from "../store/slices/board";
import socket from "../modules/notifications/socket";

const useFavouriteListener = () => {

    const fetchFavorites = async () => {
        const response = await apiService.getFavourites();
        console.log("response", response);
        store.dispatch(boardSlice.actions.setFavourites(response.favourites));
    };

    useEffect(() => {
        fetchFavorites();
    }, []);

    useEffect(() => {
        socket.on("updatedFavorites", () => {
            fetchFavorites();
        });

        return () => {
            socket.off("updatedFavorites");
        };
    }, []);
};

export default useFavouriteListener;
