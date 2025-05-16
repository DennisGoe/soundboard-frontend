import {SoundSchema} from "../../modules/api";
import socket from "../../modules/notifications/socket";
import store from "../../store/store";

export const playSound = (sound: SoundSchema) => {
    console.log("playing sound");
    socket.emit("playSound", {
        sound,
        user: store.getState().auth?.userName
    });
};