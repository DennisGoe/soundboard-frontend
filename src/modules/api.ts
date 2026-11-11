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

// REACT_APP_API_URL erlaubt lokales Testen gegen ein eigenes Backend
// (z.B. REACT_APP_API_URL=http://localhost:3000 npm start). Produktion
// faellt weiterhin auf das Render-Backend zurueck.
const url = process.env.REACT_APP_API_URL || 'https://soundboard-backend.onrender.com';
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

    listCampaigns: async (): Promise<{ campaigns: Campaign[] }> => {
        return handleRequest(api.get<{ campaigns: Campaign[] }>('/api/campaigns'));
    },

    getCampaign: async (id: string): Promise<{ campaign: Campaign }> => {
        return handleRequest(api.get<{ campaign: Campaign }>(`/api/campaigns/${id}`));
    },

    createCampaign: async (body: CampaignInput): Promise<{ campaign: Campaign }> => {
        return handleRequest(api.post<{ campaign: Campaign }>('/api/campaigns', body));
    },

    updateCampaign: async (id: string, body: Partial<CampaignInput>): Promise<{ campaign: Campaign }> => {
        return handleRequest(api.put<{ campaign: Campaign }>(`/api/campaigns/${id}`, body));
    },

    deleteCampaign: async (id: string): Promise<{ msg: string }> => {
        return handleRequest(api.delete<{ msg: string }>(`/api/campaigns/${id}`));
    },
};

export interface MapListItem {
    _id: string;
    name: string;
    owner: string | null;
    isExample: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Campaign {
    _id: string;
    name: string;
    description: string;
    owner: string;
    mapIds: string[];
    createdAt: string;
    updatedAt: string;
}

export interface CampaignInput {
    name: string;
    description?: string;
    mapIds?: string[];
}

export default apiService;
