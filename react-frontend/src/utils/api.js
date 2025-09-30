import axios from "axios";

// 创建 axios 实例
const api = axios.create({
    baseURL: "http://localhost:8000", // FastAPI 后端地址
    timeout: 30000, //30秒超时
})

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
