import {BrowserRouter as Router, Routes, Route, Navigate} from "react-router-dom";
import React, { useEffect } from "react";
import LoginPage from "../pages/LoginPage";
import BoardPage from "../pages/BoardPage";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth } from "../hooks/useAuth";

// Fallback fuer /bilder ohne Trailing-Slash: wenn Render/die SPA den Request
// trotz _redirects an die React-App durchreicht, hart auf /bilder/ umlenken,
// damit die Vite-Sub-App (D&D-Builder) geladen wird.
const BilderRedirect = (): null => {
    useEffect(() => {
        window.location.replace("/bilder/");
    }, []);
    return null;
};

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
                <Route path="/bilder" element={<BilderRedirect/>}/>
            </Routes>
        </Router>
    );
};

export default CustomRouter;
