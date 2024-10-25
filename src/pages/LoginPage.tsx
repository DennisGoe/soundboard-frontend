import React, {useState} from "react";
import StandardInput from "../components/utils/StandardInput";
import Button from "../components/utils/Button";
import apiService from "../modules/api";
import {ToastManager} from "../modules/notifications/ToastService";
import {FailureToastTemplate, SuccessToastTemplate} from "../modules/notifications/ToastTemplates";
import {useNavigate} from "react-router-dom";

interface LoginPageProps {
}

const LoginPage = ({}: LoginPageProps) => {
     const navigate = useNavigate()

    const [userName, setUserName] = useState("");
    const [password, setPassword] = useState("");

    const confirmRegistrationAttempt = async () => {
        try {
            await apiService.register({username: userName, password: password});
            ToastManager.show({...SuccessToastTemplate, translationKey: "Hat geklapppt kannst dich mit den Daten jetzt einloggen"});
        } catch (e: any) {
            ToastManager.show({...FailureToastTemplate, translationKey: e.msg});
        }
    };

    const confirmLoginAttempt = async () => {
        try {
            await apiService.login({username: userName, password: password});
            ToastManager.show({...SuccessToastTemplate});
            navigate("/board")
        } catch (e: any) {
            ToastManager.show({...FailureToastTemplate, translationKey: e.msg});
        }
    };


    return (
        <div
            className={"w-full h-screen flex items-center justify-center flex-col bg-neutral-900"}>
            <div className={"h-1/3 w-80 p-5 flex justify-center items-center flex-col gap-y-5"}>
                <span className={"font-bold text-xl text-neutral-100"}>DND Soundboard</span>
                <StandardInput value={userName}
                               placeholder={"Username"}
                               setValue={setUserName}/>
                <StandardInput value={password}
                               placeholder={"Password"}
                               password={true}
                               setValue={setPassword}/>
                <div className={"h-16 w-full flex flex-col gap-y-3"}>
                    <Button onClick={confirmLoginAttempt} text={"Login"}/>
                    <Button onClick={confirmRegistrationAttempt} text={"Registrieren"}/>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;