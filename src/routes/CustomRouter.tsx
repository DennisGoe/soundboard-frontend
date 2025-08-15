import {BrowserRouter as Router, Routes, Route, Navigate} from "react-router-dom";
import React from "react";
import LoginPage from "../pages/LoginPage";
import BoardPage from "../pages/BoardPage";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth } from "../hooks/useAuth";

const CustomRouter = (): JSX.Element => {
    const { token, isAuthenticated } = useAuth();

    return (
        <Router>
            <Routes>
                <Route path="/" element={
                    (token && isAuthenticated) ? <Navigate to="/board" replace /> : <LoginPage/>
                }/>
                <Route path="/board" element={
                    <ProtectedRoute>
                        <BoardPage/>
                    </ProtectedRoute>
                }/>
            </Routes>
        </Router>
    );
};

export default CustomRouter;
