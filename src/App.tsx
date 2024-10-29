import React from "react";
import "./App.css";
import CustomRouter from "./routes/CustomRouter";
import {ToastProvider} from "./modules/notifications/ToastProvider";
import {Provider} from "react-redux";
import store from "./store/store";
import ChangeListener from "./components/ChangeListener";

function App() {
    return (
        <Provider store={store}>
            <ChangeListener/>
            <CustomRouter/>
            <ToastProvider/>
        </Provider>
    );
}

export default App;
