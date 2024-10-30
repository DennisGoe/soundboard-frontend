import {combineReducers, configureStore} from "@reduxjs/toolkit";
import settingsSlice from "./slices/settings";
import boardSlice from "./slices/board";
import authSlice from "./slices/auth";

const combinedReducer = combineReducers({
    settings: settingsSlice.reducer,
    board: boardSlice.reducer,
    auth: authSlice.reducer

});

const store = configureStore({reducer: combinedReducer});

export default store;
