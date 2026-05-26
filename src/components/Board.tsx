import React, {useEffect, useState} from "react";
import Tile from "./Tile";
import {useSelector} from "react-redux";
import store from "../store/store";


const Board = () => {
    const sounds = useSelector(() => store.getState().board?.sounds);
    const filterValue = useSelector(() => store.getState().board?.filter);
    const [animateInitial, setAnimateInitial] = useState(true);

    useEffect(() => {
        const t = setTimeout(() => setAnimateInitial(false), 2000);
        return () => clearTimeout(t);
    }, []);

    const filteredSounds = filterValue
        ? sounds.filter((sound) => sound.name.toLowerCase().includes(filterValue.toLowerCase()))
        : sounds;

    return (
        <div className="flex flex-wrap mt-4 justify-center max-w-screen px-2 gap-1">
            {filteredSounds.map((sound, idx) => (
                <Tile key={sound._id} sound={sound} index={idx} animate={animateInitial}/>
            ))}
        </div>
    );
};

export default Board;
