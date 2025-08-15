import {createSlice, PayloadAction} from "@reduxjs/toolkit";

const initialState = {
    token: localStorage.getItem("token") ?? "",
    userName: localStorage.getItem("username") ?? "",
    isAuthenticated: !!(localStorage.getItem("token")),
};

const authSlice = createSlice({
    name: "authSlice",
    initialState,
    reducers: {
        setToken(state, action: PayloadAction<string>) {
            state.token = action.payload;
            state.isAuthenticated = !!action.payload;
            localStorage.setItem("token", action.payload);
        },
        setUsername(state, action: PayloadAction<string>) {
            state.userName = action.payload;
            localStorage.setItem("username", action.payload);
        },
        clearAuth(state) {
            state.token = "";
            state.userName = "";
            state.isAuthenticated = false;
            localStorage.removeItem("token");
            localStorage.removeItem("username");
        }
    }
});

export default authSlice;
