import {combineReducers, configureStore} from "@reduxjs/toolkit";
import settingsSlice from "./slices/settings";

const combinedReducer = combineReducers({
    settings: settingsSlice.reducer,

});

const store = configureStore({reducer: combinedReducer});

export default store;
