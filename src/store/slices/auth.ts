import {createSlice, PayloadAction} from "@reduxjs/toolkit";
import {isJwtExpired} from "../../Utils/jwt";

const persistedToken = localStorage.getItem("token") ?? "";
const persistedUsername = localStorage.getItem("username") ?? "";
const tokenValid = !!persistedToken && !isJwtExpired(persistedToken);

if (!tokenValid && persistedToken) {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
}

const initialState = {
    token: tokenValid ? persistedToken : "",
    userName: tokenValid ? persistedUsername : "",
    isAuthenticated: tokenValid,
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
