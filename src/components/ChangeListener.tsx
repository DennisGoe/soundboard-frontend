import React from 'react';
import useBoardListener from "../hooks/useBoardListener";
import useFavouriteListener from "../hooks/useFavouriteListener";



const ChangeListener = () => {
    useBoardListener()
    useFavouriteListener()
    return (
        <></>
    );
};

export default ChangeListener;