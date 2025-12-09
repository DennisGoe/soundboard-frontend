import {createSlice, PayloadAction} from "@reduxjs/toolkit";
import {SoundSchema} from "../../modules/api";

interface BoardInterface {
    sounds: SoundSchema[];
    favourites: SoundSchema[],
    filter: string,
    selectedSound?: SoundSchema |null,
    showDelete:boolean
}

const initialState: BoardInterface = {
    sounds: [],
    favourites:[],
    filter:"",
    selectedSound: null,
    showDelete:false
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
        },
        setSelectedSound(state, action: PayloadAction<SoundSchema | null>){
            state.selectedSound = action.payload
        },
        setShowDelete(state, action: PayloadAction<boolean>){
            state.showDelete = action.payload
        }
    }
});

export default boardSlice;
