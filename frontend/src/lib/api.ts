import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use(async (config) => {
    if (typeof window !== "undefined") {
        try {
            const res = await fetch("/api/token");
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
            window.location.href = "/sign-in";
        }
        return Promise.reject(err);
    }
);

export default api;
