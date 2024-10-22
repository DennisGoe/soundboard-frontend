import React from "react";
import "./App.css";
import CustomRouter from "./routes/CustomRouter";
import {ToastProvider} from "./modules/notifications/ToastProvider";

function App() {
    return (
        <>
            <CustomRouter/>
            <ToastProvider/>
        </>
    );
}

export default App;
