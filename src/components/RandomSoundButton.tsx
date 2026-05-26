import React from "react";
import Button from "./utils/Button";
import store from "../store/store";
import {playSound} from "./utils/functions";

interface RandomSoundButtonProps {
}

const RandomSoundButton = ({}: RandomSoundButtonProps) => {
    const playRandomSound = () => {
        const soundList = store.getState().board?.sounds
        const random = Math.floor(Math.random() * (soundList?.length + 1))
        playSound(soundList[random])
    };
    return (
        <Button onClick={playRandomSound}
                icon={"shuffle"}
                variant={"secondary"}
                iconClassName={"text-[12pt] text-neutral-400 font-thin transition-colors duration-200 group-hover:text-white"}
                text={""}/>
    );
};

export default RandomSoundButton;