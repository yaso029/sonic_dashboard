import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Separate axios instance for the client portal — uses its own token so portal
// sessions never mix with staff sessions.
const portalApi = axios.create({ baseURL: BASE });

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('portal_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('portal_token');
      localStorage.removeItem('portal_user');
      if (!window.location.pathname.endsWith('/portal/login')) {
        window.location.href = '/portal/login';
      }
    }
    return Promise.reject(err);
  }
);

export { BASE };
export default portalApi;
