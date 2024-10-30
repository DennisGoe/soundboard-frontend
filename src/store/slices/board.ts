import {createSlice, PayloadAction} from "@reduxjs/toolkit";
import {SoundSchema} from "../../modules/api";

interface BoardInterface {
    sounds: SoundSchema[];
    favourites: SoundSchema[],
    filter: string
}

const initialState: BoardInterface = {
    sounds: [],
    favourites:[],
    filter:""
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
        },
        setFilterValue(state, action: PayloadAction<string>){
            state.filter = action.payload
        }
    }
});

export default boardSlice;
