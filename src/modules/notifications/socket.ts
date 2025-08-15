import { io, Socket } from 'socket.io-client';
import {BASE_URL} from "../api";
import store from "../../store/store";
import authSlice from "../../store/slices/auth";

const createSocket = (): Socket => {
    const token = localStorage.getItem('token');
    
    return io(BASE_URL, {
        transports: ['websocket'],
        secure: true,
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 10000,
        auth: {
            token: token
        },
        extraHeaders: {
            Authorization: `Bearer ${token}`
        }
    });
};

let socket: Socket | null = null;

const getSocket = (): Socket => {
    if (!socket) {
        socket = createSocket();
        
        // Handle authentication errors
        socket.on('connect_error', (error) => {
            if (error.message === 'Authentication failed' || error.message === 'Unauthorized') {
                // Clear auth state and redirect to login
                store.dispatch(authSlice.actions.clearAuth());
                
                if (window.location.pathname !== '/') {
                    window.location.href = '/';
                }
            }
        });
        
        // Handle disconnection
        socket.on('disconnect', (reason) => {
            if (reason === 'io server disconnect' && socket) {
                // Server disconnected us, try to reconnect
                socket.connect();
            }
        });
    }
    return socket;
};

const disconnectSocket = (): void => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

export { getSocket, disconnectSocket };
export default getSocket();
