import {getSocket} from "./notifications/socket";
import {SoundSchema} from "./api";

type Listener = (playing: boolean) => void;
type GlobalListener = (sound: SoundSchema) => void;

const subscribers = new Map<string, Set<Listener>>();
const globalPlayListeners = new Set<GlobalListener>();
const activeAudios = new Map<string, HTMLAudioElement>();
let currentVolume = 1;
let initialized = false;

function notify(soundId: string, playing: boolean) {
    subscribers.get(soundId)?.forEach((cb) => cb(playing));
}

function notifyGlobalPlay(sound: SoundSchema) {
    globalPlayListeners.forEach((cb) => cb(sound));
}

export function initAudioPlayer() {
    if (initialized) return;
    initialized = true;

    const socket = getSocket();
    socket.off("playSound");
    socket.on("playSound", (data: SoundSchema) => {
        const existing = activeAudios.get(data._id);
        if (existing) {
            existing.pause();
            existing.currentTime = 0;
            activeAudios.delete(data._id);
        }

        const audio = new Audio(data.url);
        audio.volume = currentVolume;
        activeAudios.set(data._id, audio);

        const cleanup = () => {
            if (activeAudios.get(data._id) === audio) {
                activeAudios.delete(data._id);
                notify(data._id, false);
            }
        };

        audio.onended = cleanup;
        audio.onerror = cleanup;

        notify(data._id, true);
        notifyGlobalPlay(data);

        audio.play().catch((err) => {
            console.error("Error playing audio:", err);
            cleanup();
        });
    });
}

export function setGlobalVolume(v: number) {
    currentVolume = Math.max(0, Math.min(1, v));
    activeAudios.forEach((a) => {
        a.volume = currentVolume;
    });
}

export function subscribeGlobalPlay(cb: GlobalListener): () => void {
    globalPlayListeners.add(cb);
    return () => {
        globalPlayListeners.delete(cb);
    };
}

export function subscribeIsPlaying(soundId: string, cb: Listener): () => void {
    let set = subscribers.get(soundId);
    if (!set) {
        set = new Set();
        subscribers.set(soundId, set);
    }
    set.add(cb);

    if (activeAudios.has(soundId)) cb(true);

    return () => {
        const s = subscribers.get(soundId);
        if (!s) return;
        s.delete(cb);
        if (s.size === 0) subscribers.delete(soundId);
    };
}
