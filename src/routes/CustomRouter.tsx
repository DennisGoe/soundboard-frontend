import {BrowserRouter as Router, Routes, Route} from "react-router-dom";
import React from "react";
import LoginPage from "../pages/LoginPage";
import BoardPage from "../pages/BoardPage";


const CustomRouter = (): JSX.Element => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LoginPage/>}/>
                <Route path="/board" element={<BoardPage/>}/>
            </Routes>
        </Router>
    );
};

export default CustomRouter;
