import React from "react";
import {useSelector} from "react-redux";
import store from "../store/store";
import FavouriteListEntry from "./FavouriteListEntry";
import LogoutButton from "./LogoutButton";
import VolumeSlider from "./VolumeSlider";

const LeftSideBar = () => {
    const favourites = useSelector(() => store.getState().board?.favourites);
    const volume = useSelector(() => store.getState().settings?.volume);


    return (
        <div className="h-full flex flex-col">
            <div className="h-12 flex items-center pl-3">
                <span className="text-white font-bold">DnD Soundboard</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2">
                <span className="text-neutral-400 text-lg font-bold ml-1 mb-2 block">Favoriten</span>
                {favourites?.map(fav => (
                    <FavouriteListEntry key={fav._id} favourite={fav}/>
                ))}
            </div>
            <div className="inline-flex gap-y-10 flex flex-col  pb-2 px-2">
                <div className={"w-full"}>
                    <div className="w-full text-white justify-between flex items-center gap-x-2 h-full">
                        <span>Volume:</span>
                        <span>{volume}%</span>
                    </div>
                    <VolumeSlider/>
                </div>
                <div className={"h-12"}>
                    <LogoutButton/>
                </div>
            </div>
        </div>
    );
};

export default LeftSideBar;