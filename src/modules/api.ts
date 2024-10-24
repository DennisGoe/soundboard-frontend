// src/apiService.ts
import axios, { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig, AxiosHeaders } from 'axios';
import {ToastManager} from "./notifications/ToastService";
import {FailureToastTemplate} from "./notifications/ToastTemplates";

// Define user-related types
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
    name: string
}

// Example of another potential data model
interface UserData {
    id: string;
    username: string;
}

// Base URL for your API
const BASE_URL = 'http://localhost:3000';

// Create an axios instance
const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to add token to every request if available
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('token'); // Get token from localStorage
        if (token) {
            // Ensure headers are properly handled with AxiosHeaders
            if (config.headers instanceof AxiosHeaders) {
                config.headers.set('Authorization', `Bearer ${token}`);
            } else {
                // Convert existing headers to a plain object before creating AxiosHeaders
                const headersObject = config.headers ? (config.headers as Record<string, string>) : {};
                const updatedHeaders = new AxiosHeaders(headersObject);
                updatedHeaders.set('Authorization', `Bearer ${token}`);
                config.headers = updatedHeaders;
            }
        }
        // else {
        //     ToastManager.show({...FailureToastTemplate, translationKey:"BITTE EINLOGGEN"})
        //     window.location.href = "/"
        // }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// General function to handle requests
const handleRequest = async <T>(request: Promise<AxiosResponse<T>>): Promise<T> => {
    try {
        const response = await request;
        return response.data;  // Return `response.data` directly
    } catch (error: any) {
        if (error.response && error.response.data) {
            throw error.response.data; // Custom error response from server
        } else {
            throw { msg: 'An unexpected error occurred' }; // General error
        }
    }
};

// Define API functions
const apiService = {
    // Register a new user (corrected endpoint)
    register: (credentials: UserCredentials): Promise<void> => {
        return handleRequest(
            api.post<void>('/api/auth/register', credentials)
        );
    },

    // Login an existing user
    login: async (credentials: UserCredentials): Promise<AuthResponse> => {
        const response = await handleRequest(
            api.post<AuthResponse>('/api/auth/login', credentials)
        );

        // Save the JWT token in localStorage for persistence
        if (response.token) {
            localStorage.setItem('token', response.token);
        }

        return response;  // Return the response so it can be used by the caller
    },

    // Logout user
    logout: (): void => {
        // Remove the token from localStorage
        localStorage.removeItem('token');
    },

    uploadFile: async (file: File, name: string): Promise<{ _id: string; url: string; name: string }> => {
        const formData = new FormData();
        formData.append('mp3', file); // The backend expects the field name to be 'mp3'
        formData.append('name', name); // Append the custom name to the form data

        // Make the API request
        return handleRequest(
            api.post<{ _id: string; url: string; name: string }>('/api/files/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })
        );
    },
    getAllFiles: async (): Promise<SoundSchema[]> => {
        return handleRequest(
            api.get<{ _id: string; url: string; name: string }[]>('/api/files/all')
        );
    },
};

export default apiService;
