import React from 'react';
import Button from "./utils/Button";
import {useNavigate} from "react-router-dom";
import apiService from "../modules/api";



const LogoutButton = () => {
    const navigate = useNavigate()
    const logout = () => {
        navigate("/")
        apiService.logout()
    }
    return (
        <div className={"absolute top-2 left-2 w-32"}>
            <Button onClick={logout} text={"Logout"}/>
        </div>
    );
};

export default LogoutButton;