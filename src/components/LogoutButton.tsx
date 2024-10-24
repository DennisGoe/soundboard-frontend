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
        <div className={" w-32"}>
            <Button onClick={logout} text={"Logout"}/>
        </div>
    );
};

export default LogoutButton;