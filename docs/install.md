## 环境要求

### 前端开发环境
nvm (Node Version Manager) - Node.js 版本管理工具

Node.js - JavaScript 运行时环境

npm - Node.js 包管理器， nodejs安装后自带

## 后端开发环境
uv - Python 虚拟环境管理和包安装工具



## 运行方法

### 后端服务

进入后端目录
```bash
cd fastapi-backend
```

安装依赖（首次运行）
```bash
uv sync
```

启动开发服务器
```bash
uv run uvicorn main:app --reload
```

### 前端服务
进入前端目录（新开终端窗口）
```bash
cd react-frontend 
```

安装依赖（首次运行）
```bash
npm install
```

启动开发服务器
```bash
npm run dev
```