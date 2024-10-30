import {useEffect} from "react";
import apiService from "../modules/api";
import store from "../store/store";
import boardSlice from "../store/slices/board";
import socket from "../modules/notifications/socket";
import {useSelector} from "react-redux";

const useFavouriteListener = () => {
    const token = useSelector(() => store.getState().auth?.token)
    const fetchFavorites = async () => {
        try {
            const response = await apiService.getFavourites();
            store.dispatch(boardSlice.actions.setFavourites(response.favourites));
        } catch (e: any) {
            console.log("error fetching favourites", e.msg);
        }
    };

    useEffect(() => {
        fetchFavorites();
    }, [token]);

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
