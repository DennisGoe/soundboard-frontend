import React from "react";
import "./App.css";
import CustomRouter from "./routes/CustomRouter";
import {ToastProvider} from "./modules/notifications/ToastProvider";
import {Provider} from "react-redux";
import store from "./store/store";

function App() {
    return (
        <Provider store={store}>
            <CustomRouter/>
            <ToastProvider/>
        </Provider>
    );
}

export default App;
