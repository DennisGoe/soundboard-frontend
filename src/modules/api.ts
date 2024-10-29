import axios, { AxiosResponse, InternalAxiosRequestConfig, AxiosHeaders } from 'axios';

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

interface UserData {
    id: string;
    username: string;
}

// const url = 'https://soundboard-backend.onrender.com';
const url = 'http://localhost:3000';
export const BASE_URL = url;

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

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
            localStorage.setItem('token', response.token);
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
        localStorage.removeItem('token');
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
};

export default apiService;
