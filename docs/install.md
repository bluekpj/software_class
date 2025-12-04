## 环境要求

### 前端开发环境
nvm (Node Version Manager) - Node.js 版本管理工具

Node.js - JavaScript 运行时环境

npm - Node.js 包管理器， nodejs安装后自带

安装nvm,使用curl或是wget
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

```
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

然后
# 1. 安装最新的 LTS 版本
```
nvm install --lts
```

如果切换到刚安装的 LTS 版本
```
nvm use --lts
```

# 3. 验证当前使用的版本
```
node --version # 例如输出：v18.17.1
npm --version  # 同时也会显示对应 npm 的版本
```

## 后端开发环境
uv - Python 虚拟环境管理和包安装工具

安装uv,使用curl或是wget (https://docs.astral.sh/uv/getting-started/installation/)

```
curl -LsSf https://astral.sh/uv/install.sh | sh
```

```
wget -qO- https://astral.sh/uv/install.sh | sh
```

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