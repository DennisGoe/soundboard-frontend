import {createSlice, PayloadAction} from "@reduxjs/toolkit";



const initialState = {
    token: localStorage.getItem("token") ?? ""
};


const authSlice = createSlice({
    name: "authSlice",
    initialState,
    reducers: {
        setToken(state, action: PayloadAction<string>) {
            state.token = action.payload
            localStorage.setItem('token', action.payload);
        }
    }
});

export default authSlice;
