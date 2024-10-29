import React, {useEffect, useState} from "react";
import {SoundSchema} from "../modules/api";
import {useSelector} from "react-redux";
import store from "../store/store";

interface useIsFavouriteProps {
    sound:SoundSchema
}

const useIsFavourite = ({sound}:useIsFavouriteProps) => {
    const favourites = useSelector(() => store.getState().board?.favourites)
    const [isFavourite, setIsFavourite] = useState(false);

    useEffect(() => {
        setIsFavourite(favourites.some(fav => fav._id === sound._id))
    }, [favourites]);

    return {isFavourite}
};

export default useIsFavourite;