import { io, Socket } from 'socket.io-client';
import { BASE_URL } from "../api";
import store from "../../store/store";
import authSlice from "../../store/slices/auth";

// Zentraler Socket fuer BE (Soundboard + Kampagnen-Spielraum).
// Seit der neuen JWT-Auth auf der Serverseite MUSS der Token mitgeschickt
// werden. Wir halten EINE Socket-Instanz und updaten ihren `auth`-Payload,
// wenn sich der Token aendert (Login/Logout/Account-Wechsel). Dadurch
// bleiben vorhandene `socket.on(...)`-Listener gueltig.

let socket: Socket | null = null;

const currentToken = (): string => localStorage.getItem('token') || '';

const bindHandlers = (s: Socket) => {
    s.on('connect_error', (error) => {
        if (
            error?.message === 'Unauthorized' ||
            error?.message === 'Authentication failed'
        ) {
            store.dispatch(authSlice.actions.clearAuth());
            if (window.location.pathname !== '/') {
                window.location.href = '/';
            }
        }
    });
    s.on('disconnect', (reason) => {
        if (reason === 'io server disconnect' && s) {
            try { s.connect(); } catch { /* ignore */ }
        }
    });
};

const getSocket = (): Socket => {
    if (!socket) {
        const token = currentToken();
        socket = io(BASE_URL, {
            transports: ['websocket'],
            secure: true,
            reconnection: true,
            reconnectionAttempts: 5,
            timeout: 10000,
            auth: { token },
            extraHeaders: { Authorization: token ? `Bearer ${token}` : '' },
            autoConnect: !!token,
        });
        bindHandlers(socket);
    }
    return socket;
};

const disconnectSocket = (): void => {
    if (socket) {
        try { socket.disconnect(); } catch { /* ignore */ }
    }
};

// Auth-Payload aktualisieren + reconnect, damit die SAME Socket-Instanz
// (inkl. aller `on(...)`-Listener in Hooks) weiter funktioniert.
const reconnectWithFreshToken = (): void => {
    if (!socket) {
        getSocket();
        return;
    }
    const token = currentToken();
    (socket as any).auth = { token };
    socket.io.opts.extraHeaders = { Authorization: token ? `Bearer ${token}` : '' };
    try { socket.disconnect(); } catch { /* ignore */ }
    if (token) {
        try { socket.connect(); } catch { /* ignore */ }
    }
};

// Store-Abo: Token-Wechsel -> Socket neu verbinden.
let subscribed = false;
const subscribeToAuth = () => {
    if (subscribed) return;
    subscribed = true;
    let prev: string = store.getState().auth?.token || '';
    store.subscribe(() => {
        const current: string = store.getState().auth?.token || '';
        if (current === prev) return;
        prev = current;
        reconnectWithFreshToken();
    });
};
subscribeToAuth();

export { getSocket, disconnectSocket, reconnectWithFreshToken };
export default getSocket();
