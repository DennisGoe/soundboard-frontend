import { io, Socket } from 'socket.io-client';
import {BASE_URL} from "../api";

const socket = io(BASE_URL, {
    transports: ['websocket'],
    secure: true,
    reconnection: true,
    reconnectionAttempts: 5,
    timeout: 10000,
});

export default socket;
