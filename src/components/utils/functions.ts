import {SoundSchema} from "../../modules/api";
import socket from "../../modules/notifications/socket";

export const playSound = (sound: SoundSchema) => {
    socket.emit("playSound", sound);
}