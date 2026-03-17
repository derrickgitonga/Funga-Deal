import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use(async (config) => {
    if (typeof window !== "undefined") {
        const res = await fetch("/api/token");
        if (!res.ok) {
            return Promise.reject(new Error("Not authenticated"));
        }
        const { accessToken } = await res.json();
        if (!accessToken) {
            return Promise.reject(new Error("No access token — sign in again"));
        }
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
        const status = err.response?.status;
        if ((status === 401 || status === 403) && typeof window !== "undefined") {
            window.location.href = "/sign-in";
        }
        return Promise.reject(err);
    }
);

export default api;
