import axios from "axios";

// 动态拼接后端地址：将当前 origin 的端口替换为 8000，便于公网/本地一致使用
const resolveBaseURL = () => {
  if (typeof window === "undefined") return "http://124.70.209.154:8000"; // Updated for public access
  try {
    const url = new URL(window.location.origin);
    url.port = "8000";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "http://124.70.209.154:8000"; // Updated for public access
  }
};

const api = axios.create({
  baseURL: resolveBaseURL(),
  timeout: 30000, // 30秒超时
});

// 请求拦截器
api.interceptors.request.use(
    (config) => {
    // 可以在这里添加 token 等
    return config;
  },
    (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 统一错误处理
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export default api;
