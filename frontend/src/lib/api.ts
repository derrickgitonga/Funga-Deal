import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// We fetch the access token from the Next.js API route created by Auth0
api.interceptors.request.use(async (config) => {
    if (typeof window !== "undefined") {
        try {
            const res = await fetch("/api/auth/token");
            if (res.ok) {
                const { accessToken } = await res.json();
                if (accessToken) {
                    config.headers.Authorization = `Bearer ${accessToken}`;
                }
            }
        } catch (e) {
            console.error("Failed to fetch auth token", e);
        }
    }
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
        if (err.response?.status === 401 && typeof window !== "undefined") {
            window.location.href = "/api/auth/login";
        }
        return Promise.reject(err);
    }
);

export default api;
