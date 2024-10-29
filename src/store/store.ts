import {combineReducers, configureStore} from "@reduxjs/toolkit";
import settingsSlice from "./slices/settings";
import boardSlice from "./slices/board";

const combinedReducer = combineReducers({
    settings: settingsSlice.reducer,
    board: boardSlice.reducer

});

const store = configureStore({reducer: combinedReducer});

export default store;
