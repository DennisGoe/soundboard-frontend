import React from "react";
import {useSelector} from "react-redux";
import store from "../store/store";
import FavouriteListEntry from "./FavouriteListEntry";

const LeftSideBar = () => {
    const favourites = useSelector(() => store.getState().board?.favourites);
    return (
        <div className={"relative w-full h-full flex flex-col"}>
            <span className={"text-neutral-400 text-lg font-bold ml-3"}>Favoriten</span>
            <div className={"flex-1 overflow-y-auto "}>
                {favourites?.map(favourite => {
                    return (<FavouriteListEntry key={favourite._id} favourite={favourite}/>)
                })}
            </div>
        </div>
    );
};

export default LeftSideBar;