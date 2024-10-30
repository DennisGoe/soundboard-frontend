import React, {useEffect, useState} from "react";
import StandardInput from "./utils/StandardInput";
import store from "../store/store";
import boardSlice from "../store/slices/board";
import {useSelector} from "react-redux";



const SearchBar = () => {
    const searchValue = useSelector(() => store.getState().board?.filter)

    return (
        <div className={"h-8"}>
            <StandardInput value={searchValue} setValue={(value) => store.dispatch(boardSlice.actions.setFilterValue(value)) }/>
        </div>
    );
};

export default SearchBar;