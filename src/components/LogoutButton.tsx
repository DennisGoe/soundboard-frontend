import React from "react";
import Button from "./utils/Button";
import {useNavigate} from "react-router-dom";
import apiService from "../modules/api";
import { disconnectSocket } from "../modules/notifications/socket";

const LogoutButton = () => {
    const navigate = useNavigate();
    
    const logout = () => {
        // Disconnect socket first
        disconnectSocket();
        
        // Clear auth state
        apiService.logout();
        
        // Navigate to login
        navigate("/");
    };
    
    return (
        <Button
            icon={"logout"}
            iconClassName={"text-[14pt] mt-2"}
            onClick={logout}
            text={"Logout"}
            variant={"secondary"}
        />
    );
};

export default LogoutButton;