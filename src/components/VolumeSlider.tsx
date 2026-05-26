import React from 'react';
import {useSelector} from "react-redux";
import store from "../store/store";
import settingsSlice from "../store/slices/settings";

const VolumeSlider = () => {
    const volume = useSelector(() => store.getState().settings?.volume) ?? 100;

    return (
        <input
            className="sb-volume w-full"
            value={volume}
            step={1}
            min={0}
            max={100}
            onChange={(e) => store.dispatch(settingsSlice.actions.setVolume(Number(e.target.value)))}
            type="range"
            style={{"--volume": `${volume}%`} as React.CSSProperties}
        />
    );
};

export default VolumeSlider;
