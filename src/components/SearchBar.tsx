import React from "react";
import store from "../store/store";
import boardSlice from "../store/slices/board";
import {useSelector} from "react-redux";

const SearchBar = () => {
    const searchValue = useSelector(() => store.getState().board?.filter);

    return (
        <div className="relative w-80">
            <span
                className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none select-none"
                style={{fontSize: "18px", lineHeight: 1}}
            >
                search
            </span>
            <input
                className="w-full text-white placeholder:text-neutral-500 bg-neutral-800 border border-neutral-800 rounded-lg py-1.5 pl-9 pr-3 text-sm transition-colors duration-200 hover:border-blue_main hover:border-opacity-80 focus:border-blue_main focus:border-opacity-100 focus:outline-none"
                value={searchValue ?? ""}
                placeholder="Sound suchen..."
                onChange={(e) => store.dispatch(boardSlice.actions.setFilterValue(e.target.value))}
            />
        </div>
    );
};

export default SearchBar;
