import {createSlice, PayloadAction} from "@reduxjs/toolkit";

interface settingsInterface {
    volume: number
}

const initialState: settingsInterface = {
    volume: Number(localStorage.getItem("volume") ?? 25)
};


const settingsSlice = createSlice({
    name: "settingsSlice",
    initialState,
    reducers: {
        setVolume(state, action: PayloadAction<number>){
            state.volume = action.payload
            localStorage.setItem("volume", action.payload.toString())
        }
    }
});

export default settingsSlice;
