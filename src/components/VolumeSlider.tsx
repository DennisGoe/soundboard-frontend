import React from 'react';
import {useSelector} from "react-redux";
import store from "../store/store";
import settingsSlice from "../store/slices/settings";

interface VolumeSliderProps {}

const VolumeSlider = ({}:VolumeSliderProps) => {
    const volume = useSelector(() => store.getState().settings?.volume)

    return (
        <input
            className={"w-full"}
            value={volume}
            step={1}
            min={0}
            max={100}
            onChange={e => store.dispatch(settingsSlice.actions.setVolume(Number(e.target.value)))}
            type="range"/>
    );
};

export default VolumeSlider;