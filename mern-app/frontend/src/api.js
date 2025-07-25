// Password reset endpoint
export const resetPassword = async ({ email, newPassword }) => {
    try {
        const res = await api.post('/users/reset-password', { email, newPassword });
        return res.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Password reset failed');
    }
};
// Fully implemented real code for frontend/src/api.js
import axios from "axios";

// Use relative URL by default for Cloudflare/prod compatibility
const API_URL = process.env.REACT_APP_API_URL || "/api";

// Create axios instance with default config
const api = axios.create({
    baseURL: API_URL,
    timeout: 10000, // 10 second timeout
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor for auth token
api.interceptors.request.use(
    (config) => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.token) {
            config.headers.Authorization = `Bearer ${user.token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export const register = async (userData) => {
    try {
        const res = await api.post('/users/register', userData);
        return res.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Registration failed');
    }
};

export const login = async (userData) => {
    try {
        const res = await api.post('/users/login', userData);
        return res.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Login failed');
    }
};

export const submitForm = async (formData, token) => {
    try {
        const res = await api.post('/forms/submit', formData, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        return res.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Form submission failed');
    }
};

// Auto-save form data as in-progress (not final submission)
export const autoSaveForm = async (formData, token) => {
    try {
        const res = await api.post('/forms/submit', {
            ...formData,
            isAutoSave: true
        }, {
            headers: token ? {
                Authorization: `Bearer ${token}`,
            } : undefined,
        });
        return res.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Auto-save failed');
    }
};

export const getResumeData = async (token) => {
    try {
        const res = await api.get('/forms/resume', {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        return res.data;
    } catch (error) {
        // Return null if no data found instead of throwing error
        if (error.response?.status === 404) {
            return null;
        }
        throw new Error(error.response?.data?.message || 'Failed to fetch resume data');
    }
};
