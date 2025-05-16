import React from "react";
import Button from "./utils/Button";
import {useNavigate} from "react-router-dom";
import apiService from "../modules/api";


const LogoutButton = () => {
    const navigate = useNavigate();
    const logout = () => {
        navigate("/");
        apiService.logout();
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