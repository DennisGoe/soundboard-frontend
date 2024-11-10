import React, {useState} from "react";
import apiService from "../modules/api";
import {ToastManager} from "../modules/notifications/ToastService";
import {FailureToastTemplate, SuccessToastTemplate} from "../modules/notifications/ToastTemplates";
import {useNavigate} from "react-router-dom";
import "../login.css";


const LoginPage = () => {
    const [isActive, setIsActive] = useState(false);
    const navigate = useNavigate();

    const [userName, setUserName] = useState("");
    const [password, setPassword] = useState("");
    const confirmLoginAttempt = async () => {
        try {
            await apiService.login({username: userName, password: password});
            ToastManager.show({...SuccessToastTemplate});
            navigate("/board");
        } catch (e: any) {
            ToastManager.show({...FailureToastTemplate, translationKey: e.msg});
        }
    };

    const confirmRegistrationAttempt = async () => {
        try {
            await apiService.register({username: userName, password: password});
            ToastManager.show({
                ...SuccessToastTemplate,
                translationKey: "Hat geklapppt kannst dich mit den Daten jetzt einloggen"
            });
        } catch (e: any) {
            ToastManager.show({...FailureToastTemplate, translationKey: e.msg});
        }
    };

    const handleToggle = () => {
        const container = document.getElementById("container");
        const registerBtn = document.getElementById("register");
        const loginBtn = document.getElementById("login");

        registerBtn?.addEventListener("click", () => {
            container?.classList.add("active");
        });

        loginBtn?.addEventListener("click", () => {
            container?.classList.remove("active");
        });
    };

    return (
        <div className={"login-wrapper"}>


            <div className={`container ${isActive ? "active" : ""}`} id="container">
                <div className="form-container sign-in">
                    <form>
                        <h1>Login</h1>
                        <input type="text" value={userName} onChange={e => setUserName(e.target.value)}
                               placeholder="Username"/>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                               placeholder="Password"/>
                        <button type="button" onClick={confirmLoginAttempt}>Login</button>
                    </form>
                </div>

                <div className="form-container sign-up">
                    <form>
                        <h1>Create Account</h1>
                        <input type="text" value={userName} onChange={e => setUserName(e.target.value)}
                               placeholder="Username"/>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                               placeholder="Password"/>
                        <button type="button" onClick={confirmRegistrationAttempt}>Sign Up</button>
                    </form>
                </div>

                <div className="toggle-container">
                    <div className="toggle">
                        <div className="toggle-panel toggle-left">
                            <h1>Already have an Account?</h1>
                            <button className="reg" id="login" onClick={handleToggle}>
                                Click to login
                            </button>
                        </div>
                        <div className="toggle-panel toggle-right">
                            <h1>New here?</h1>
                            <button className="reg" id="register" onClick={handleToggle}>
                                Click to Register
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
