import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
});

// Set from App.jsx using Clerk's getToken()
let tokenGetter = null;

export const setAuthTokenGetter = (getter) => {
  tokenGetter = getter;
};

api.interceptors.request.use(async (config) => {
  if (tokenGetter && !config.headers?.Authorization) {
    const token = await tokenGetter();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

export default api;