from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # 导入 CORS 中间件

# 创建 FastAPI 应用实例
app = FastAPI()

# 配置 CORS 中间件
# 允许的前端源列表（根据你的前端开发服务器地址调整）
origins = [
    "http://localhost:3000",  # 默认的 Create React App 地址
    "http://localhost:5173",  # Vite 默认的开发服务器地址
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # 允许的源列表
    allow_credentials=True,
    allow_methods=["*"],    # 允许所有方法 (GET, POST, 等)
    allow_headers=["*"],    # 允许所有头部
)

# 定义一个简单的根路由
@app.get("/")
async def root():
    return {"message": "Hello World from FastAPI!"}

# 定义一个 API 端点用于测试
@app.get("/api/items")
async def read_items():
    return [{"id": 1, "name": "Item 1"}, {"id": 2, "name": "Item 2"}]
