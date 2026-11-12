import axios, { AxiosResponse, InternalAxiosRequestConfig, AxiosHeaders } from 'axios';
import store from "../store/store";
import authSlice from "../store/slices/auth";
import {ToastManager} from "./notifications/ToastService";
import {FailureToastTemplate} from "./notifications/ToastTemplates";

interface UserCredentials {
    username: string;
    password: string;
}

interface AuthResponse {
    token: string;
    msg?: string;
}

export interface SoundSchema {
    _id: string;
    url: string;
    name: string;
}

export interface UserSchema {
    username: string;
}

// window.__API_BASE_URL__ (zur Laufzeit per <script> injizierbar, zb von
// headless-verify-Skripten) hat Vorrang. Danach REACT_APP_API_URL (Build-Zeit).
// Fallback: Render-Prod-Backend.
const runtimeOverride =
    typeof window !== 'undefined'
        ? ((window as any).__API_BASE_URL__ as string | undefined)
        : undefined;
const url =
    runtimeOverride ||
    process.env.REACT_APP_API_URL ||
    'https://soundboard-backend.onrender.com';
export const BASE_URL = url;

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add token to all requests
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('token');
        if (token) {
            if (config.headers instanceof AxiosHeaders) {
                config.headers.set('Authorization', `Bearer ${token}`);
            } else {
                const headersObject = config.headers ? (config.headers as Record<string, string>) : {};
                const updatedHeaders = new AxiosHeaders(headersObject);
                updatedHeaders.set('Authorization', `Bearer ${token}`);
                config.headers = updatedHeaders;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle authentication errors
api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        if (error.response?.status === 401) {
            const wasAuthenticated = !!store.getState().auth?.isAuthenticated;
            if (wasAuthenticated) {
                ToastManager.show({
                    ...FailureToastTemplate,
                    translationKey: "Deine Session ist abgelaufen. Bitte logge dich neu ein.",
                });
            }
            store.dispatch(authSlice.actions.clearAuth());
            // ProtectedRoute reacts to isAuthenticated=false and navigates via react-router.
        }
        return Promise.reject(error);
    }
);

const handleRequest = async <T>(request: Promise<AxiosResponse<T>>): Promise<T> => {
    try {
        const response = await request;
        return response.data;
    } catch (error: any) {
        if (error.response && error.response.data) {
            throw error.response.data;
        } else {
            throw { msg: 'An unexpected error occurred' };
        }
    }
};

const apiService = {
    register: (credentials: UserCredentials): Promise<void> => {
        return handleRequest(api.post<void>('/api/auth/register', credentials));
    },

    login: async (credentials: UserCredentials): Promise<AuthResponse> => {
        const response = await handleRequest(api.post<AuthResponse>('/api/auth/login', credentials));
        if (response.token) {
            store.dispatch(authSlice.actions.setToken(response.token))
        }
        return response;
    },

    changeFavourites: async (soundId: string): Promise<{ favourites: string[] }> => {
        return handleRequest(
            api.post<{ favourites: string[] }>(`/api/favorites/changeFavourite/${soundId}`)
        );
    },

    getFavourites: async (): Promise<{ favourites: SoundSchema[] }> => {
        return handleRequest(api.get<{ favourites: SoundSchema[] }>('/api/favorites/getFavourites'));
    },

    logout: (): void => {
        store.dispatch(authSlice.actions.clearAuth());
    },

    uploadFile: async (file: File, name: string): Promise<{ _id: string; url: string; name: string }> => {
        const formData = new FormData();
        formData.append('mp3', file);
        formData.append('name', name);

        return handleRequest(
            api.post<{ _id: string; url: string; name: string }>('/api/files/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })
        );
    },

    deleteFile: async (fileId: string): Promise<{ msg: string }> => {
        return handleRequest(api.delete<{ msg: string }>(`/api/files/delete/${fileId}`));
    },

    getAllFiles: async (): Promise<SoundSchema[]> => {
        return handleRequest(api.get<SoundSchema[]>('/api/files/all'));
    },

    // ---------- D&D-Builder: Maps + Kampagnen ----------
    listMaps: async (): Promise<{ maps: MapListItem[] }> => {
        return handleRequest(api.get<{ maps: MapListItem[] }>('/api/maps'));
    },

    getMap: async (id: string): Promise<{ map: MapFull }> => {
        return handleRequest(api.get<{ map: MapFull }>(`/api/maps/${id}`));
    },

    createMap: async (body: { name: string; doc: any; kind?: string }): Promise<{ map: MapFull }> => {
        return handleRequest(api.post<{ map: MapFull }>('/api/maps', body));
    },

    updateMap: async (id: string, body: { name?: string; doc?: any }): Promise<{ map: MapFull }> => {
        return handleRequest(api.put<{ map: MapFull }>(`/api/maps/${id}`, body));
    },

    deleteMap: async (id: string): Promise<{ msg: string }> => {
        return handleRequest(api.delete<{ msg: string }>(`/api/maps/${id}`));
    },

    // ---------- User-Assets (eigene Stempel) ----------
    listAssets: async (): Promise<{ assets: UserAssetDoc[] }> => {
        return handleRequest(api.get<{ assets: UserAssetDoc[] }>('/api/assets'));
    },
    uploadAsset: async (file: File, meta: { name: string; category?: string; tags?: string[]; width?: number; height?: number }): Promise<{ asset: UserAssetDoc }> => {
        const fd = new FormData();
        fd.append('image', file);
        fd.append('name', meta.name);
        if (meta.category) fd.append('category', meta.category);
        if (meta.tags && meta.tags.length) fd.append('tags', meta.tags.join(','));
        if (meta.width !== undefined) fd.append('width', String(meta.width));
        if (meta.height !== undefined) fd.append('height', String(meta.height));
        return handleRequest(api.post<{ asset: UserAssetDoc }>('/api/assets/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }));
    },
    updateAsset: async (id: string, patch: { name?: string; category?: string; tags?: string[] }): Promise<{ asset: UserAssetDoc }> => {
        return handleRequest(api.put<{ asset: UserAssetDoc }>(`/api/assets/${id}`, patch));
    },
    deleteAsset: async (id: string): Promise<{ msg: string }> => {
        return handleRequest(api.delete<{ msg: string }>(`/api/assets/${id}`));
    },

    uploadMapImage: async (
        file: File,
        name: string
    ): Promise<{ map: MapListItem }> => {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('name', name);
        return handleRequest(
            api.post<{ map: MapListItem }>('/api/maps/upload-2d', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
        );
    },

    listCampaigns: async (): Promise<{ campaigns: Campaign[] }> => {
        return handleRequest(api.get<{ campaigns: Campaign[] }>('/api/campaigns'));
    },

    getCampaign: async (id: string): Promise<{ campaign: Campaign }> => {
        return handleRequest(api.get<{ campaign: Campaign }>(`/api/campaigns/${id}`));
    },

    createCampaign: async (body: CampaignInput): Promise<{ campaign: Campaign }> => {
        return handleRequest(api.post<{ campaign: Campaign }>('/api/campaigns', body));
    },

    updateCampaign: async (
        id: string,
        body: Partial<CampaignInput>
    ): Promise<{ campaign: Campaign }> => {
        return handleRequest(api.put<{ campaign: Campaign }>(`/api/campaigns/${id}`, body));
    },

    deleteCampaign: async (id: string): Promise<{ msg: string }> => {
        return handleRequest(api.delete<{ msg: string }>(`/api/campaigns/${id}`));
    },

    addPlayer: async (campaignId: string, userId: string): Promise<{ campaign: Campaign }> => {
        return handleRequest(
            api.post<{ campaign: Campaign }>(`/api/campaigns/${campaignId}/players`, { userId })
        );
    },

    removePlayer: async (campaignId: string, userId: string): Promise<{ campaign: Campaign }> => {
        return handleRequest(
            api.delete<{ campaign: Campaign }>(`/api/campaigns/${campaignId}/players/${userId}`)
        );
    },

    setActiveMap: async (campaignId: string, mapId: string | null): Promise<{ campaign: Campaign }> => {
        return handleRequest(
            api.put<{ campaign: Campaign }>(`/api/campaigns/${campaignId}/active-map`, { mapId })
        );
    },

    getChat: async (campaignId: string): Promise<{ messages: ChatMessage[] }> => {
        return handleRequest(
            api.get<{ messages: ChatMessage[] }>(`/api/campaigns/${campaignId}/chat`)
        );
    },

    searchUsers: async (q: string): Promise<{ users: UserHit[] }> => {
        const query = q ? `?q=${encodeURIComponent(q)}` : '';
        return handleRequest(api.get<{ users: UserHit[] }>(`/api/users${query}`));
    },

    // ---------- Charaktere ----------
    listCharacters: async (): Promise<{ characters: CharacterDoc[] }> => {
        return handleRequest(api.get<{ characters: CharacterDoc[] }>('/api/characters'));
    },
    createCharacter: async (body: { name: string; initiativeBonus?: number }): Promise<{ character: CharacterDoc }> => {
        return handleRequest(api.post<{ character: CharacterDoc }>('/api/characters', body));
    },
    updateCharacter: async (id: string, body: { name?: string; initiativeBonus?: number }): Promise<{ character: CharacterDoc }> => {
        return handleRequest(api.put<{ character: CharacterDoc }>(`/api/characters/${id}`, body));
    },
    deleteCharacter: async (id: string): Promise<{ msg: string }> => {
        return handleRequest(api.delete<{ msg: string }>(`/api/characters/${id}`));
    },
    uploadCharacterToken: async (id: string, file: File): Promise<{ character: CharacterDoc }> => {
        const fd = new FormData();
        fd.append('image', file);
        return handleRequest(
            api.post<{ character: CharacterDoc }>(`/api/characters/${id}/token`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
        );
    },

    // ---------- Charakter-Auswahl pro Kampagne ----------
    setMyCharacter: async (
        campaignId: string,
        characterId: string | null
    ): Promise<{ campaign: Campaign }> => {
        return handleRequest(
            api.put<{ campaign: Campaign }>(
                `/api/campaigns/${campaignId}/my-character`,
                { characterId }
            )
        );
    },

    // ---------- Map-Grid (2d-image) ----------
    setMapGrid: async (mapId: string, grid: MapGrid | null): Promise<{ map: MapFull }> => {
        return handleRequest(api.put<{ map: MapFull }>(`/api/maps/${mapId}/grid`, { grid }));
    },

    // ---------- Tokens initial (REST, danach via Socket) ----------
    getMapTokens: async (
        campaignId: string,
        mapId: string
    ): Promise<{ tokens: TokenInstance[]; groups: TokenGroup[] }> => {
        return handleRequest(
            api.get<{ tokens: TokenInstance[]; groups: TokenGroup[] }>(
                `/api/campaigns/${campaignId}/maps/${mapId}/tokens`
            )
        );
    },

    // ---------- Lighting (Nebel + Dunkelheit + Lichter) ----------
    getMapLighting: async (
        campaignId: string,
        mapId: string
    ): Promise<{ lighting: MapLighting }> => {
        return handleRequest(
            api.get<{ lighting: MapLighting }>(
                `/api/campaigns/${campaignId}/maps/${mapId}/lighting`
            )
        );
    },

    // ---------- Initiative + Inventar ----------
    getInitiative: async (campaignId: string): Promise<{ initiative: Initiative }> => {
        return handleRequest(
            api.get<{ initiative: Initiative }>(`/api/campaigns/${campaignId}/initiative`)
        );
    },
    getMyInventory: async (campaignId: string): Promise<{ inventory: InventoryDoc }> => {
        return handleRequest(
            api.get<{ inventory: InventoryDoc }>(`/api/campaigns/${campaignId}/inventory`)
        );
    },
    getAllInventories: async (campaignId: string): Promise<{ inventories: InventoryDoc[] }> => {
        return handleRequest(
            api.get<{ inventories: InventoryDoc[] }>(`/api/campaigns/${campaignId}/inventories`)
        );
    },
};

export interface LightSource {
    id: string;
    kind: 'static' | 'token';
    tokenId: string | null;
    x: number;
    y: number;
    bright: number; // Fuß
    dim: number;    // Fuß
    color: string;
    label: string;
    enabled: boolean;
}

export interface MapLighting {
    fogW: number;
    fogH: number;
    fogBits: string; // Base64
    darkness: boolean;
    // Spieler-Deckkraft: 1 = voll schwarz/Nebel, 0 = unsichtbar.
    // Von optional, damit alte Server-Antworten weiterhin funktionieren (default 1).
    darknessOpacity?: number;
    fogOpacity?: number;
    lights: LightSource[];
}

export interface MapGrid {
    cellPx: number | null;
    offsetX: number;
    offsetY: number;
    show: boolean;
    color: string;
    opacity: number;
}

export interface MapListItem {
    _id: string;
    name: string;
    owner: string | null;
    isExample: boolean;
    kind?: '3d' | '2d-image' | '2d-editor';
    imageUrl?: string | null;
    createdAt: string;
    updatedAt: string;
    grid?: MapGrid | null;
}

export interface MapFull extends MapListItem {
    doc: any;
}

export interface PlayerRef {
    _id: string;
    username: string;
}

export interface CharacterDoc {
    _id: string;
    owner: string;
    name: string;
    tokenUrl: string | null;
    initiativeBonus?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface InitiativeEntry {
    id: string;
    userId: string | null;
    characterId: string | null;
    isNpc: boolean;
    name: string;
    tokenUrl: string | null;
    roll: number | null;
    bonus: number;
    order: number;
}

export interface Initiative {
    active: boolean;
    round: number;
    turnIndex: number;
    entries: InitiativeEntry[];
}

export interface InventoryItem {
    id: string;
    name: string;
    qty: number;
    description: string;
}

export interface InventoryDoc {
    userId: string;
    username?: string;
    notes: string;
    items: InventoryItem[];
}

export interface CharacterSelection {
    userId: string;
    characterId: string;
}

export interface TokenInstance {
    id: string;
    characterId: string | null;
    ownerUserId: string | null;
    label: string;
    color: string;
    x: number;
    y: number;
    size: number;
    groupId: string | null;
    locked: boolean;
}

export interface TokenGroup {
    id: string;
    name: string;
    locked: boolean;
}

export interface Campaign {
    _id: string;
    name: string;
    description: string;
    owner: string;
    players: PlayerRef[];
    mapIds: string[];
    activeMapId: string | null;
    role: 'owner' | 'player';
    characterSelections: CharacterSelection[];
    characters: CharacterDoc[];
    createdAt: string;
    updatedAt: string;
}

export interface CampaignInput {
    name: string;
    description?: string;
    mapIds?: string[];
    players?: string[];
}

export interface ChatMessage {
    _id: string;
    userId: string;
    username: string;
    text: string;
    createdAt: string;
    campaignId?: string;
}

export interface UserAssetDoc {
    _id: string;
    owner: string;
    name: string;
    category: string;
    tags: string[];
    imageUrl: string;
    width: number;
    height: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface UserHit {
    _id: string;
    username: string;
}

export default apiService;
