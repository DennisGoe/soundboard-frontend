import React from 'react';
import useBoardListener from "../hooks/useBoardListener";
import useFavouriteListener from "../hooks/useFavouriteListener";
import usePlaySoundListener from "../hooks/usePlaySoundListener";



const ChangeListener = () => {
    useBoardListener()
    useFavouriteListener()
    return (
        <></>
    );
};

export default ChangeListener;