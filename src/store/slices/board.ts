import {createSlice, PayloadAction} from "@reduxjs/toolkit";
import {SoundSchema} from "../../modules/api";

interface BoardInterface {
    sounds: SoundSchema[];
    favourites: SoundSchema[]
}

const initialState: BoardInterface = {
    sounds: [],
    favourites:[]
};


const boardSlice = createSlice({
    name: "boardSlice",
    initialState,
    reducers: {
        setSounds(state, action: PayloadAction<SoundSchema[]>) {
            state.sounds = action.payload;
        },
        setFavourites(state, action: PayloadAction<SoundSchema[]>){
            state.favourites = action.payload
        }
    }
});

export default boardSlice;
