# AI图像检测系统开发日志

## 项目概述

本项目是一个基于React前端和FastAPI后端的AI图像检测系统，支持图像上传、点标注和目标检测功能。系统采用前后端分离架构，提供直观的用户界面和强大的后端处理能力。

## 技术栈

### 前端 (React Frontend)
- **框架**: React 19.1.1
- **构建工具**: Vite 7.1.7
- **HTTP客户端**: Axios 1.12.2
- **语言**: JavaScript + JSX
- **样式**: CSS Modules

### 后端 (FastAPI Backend)
- **框架**: FastAPI 0.118.0
- **服务器**: Uvicorn 0.37.0
- **图像处理**: OpenCV 4.12.0.88
- **文件上传**: python-multipart 0.0.20
- **图像处理**: Pillow 12.0.0
- **语言**: Python 3.13+

## 项目结构

```
├── fastapi-backend/          # 后端服务
│   ├── main.py              # FastAPI主应用
│   ├── test_dota2coco_P2B_obb.py  # 数据转换工具
│   ├── dota_utils.py        # DOTA数据集工具
│   ├── uploads/             # 上传文件目录
│   │   ├── images/          # 图像文件
│   │   ├── label/           # 标注文件
│   │   └── coco_format_point_labels.json  # COCO格式标注
│   └── .venv/               # Python虚拟环境
├── react-frontend/          # 前端应用
│   ├── src/
│   │   ├── components/       # React组件
│   │   │   ├── ImageDetection.jsx    # 图像检测主组件
│   │   │   └── ImageAnnotation.jsx   # 图像标注组件
│   │   ├── utils/
│   │   │   └── api.js       # API工具函数
│   │   ├── App.jsx          # 主应用组件
│   │   └── main.jsx         # 应用入口
│   └── package.json         # 前端依赖配置
└── DEVELOPMENT_LOG.md       # 本文档
```

## 核心功能模块

### 1. 图像上传模块
- **位置**: `react-frontend/src/components/ImageDetection.jsx`
- **功能**: 
  - 支持拖拽上传和点击选择文件
  - 实时图像预览
  - 文件类型验证（支持JPG、PNG格式）
  - 文件大小显示

### 2. 图像标注模块
- **位置**: `react-frontend/src/components/ImageAnnotation.jsx`
- **功能**:
  - 点击图像添加标注点
  - 拖拽调整标注点位置
  - 标注点标签编辑
  - 标注点列表管理
  - 批量清除功能
  - 响应式画布自适应

### 3. 目标检测模块
- **后端位置**: `fastapi-backend/main.py`
- **功能**:
  - 接收图像和标注数据
  - 调用检测算法（当前为模拟实现）
  - 生成检测结果和可视化
  - 支持标注数据辅助检测

### 4. 数据转换模块
- **位置**: `fastapi-backend/test_dota2coco_P2B_obb.py`
- **功能**:
  - 点标注数据转换为COCO格式
  - 支持DOTA/DIOR数据集格式
  - 生成标准化的训练数据格式

## API接口设计

### 1. 图像检测接口
```
POST /api/detect
Content-Type: multipart/form-data

Parameters:
- file: 图像文件
- annotations: JSON格式的标注数据（可选）

Response:
{
  "success": true,
  "filename": "image.jpg",
  "image_base64": "data:image/jpeg;base64,...",
  "detections": [...],
  "image_width": 640,
  "image_height": 480,
  "detection_count": 3,
  "annotations_used": 2
}
```

### 2. 服务状态接口
```
GET /api/detection/status

Response:
{
  "status": "ready",
  "message": "图像检测服务运行正常"
}
```

### 3. 图像上传接口
```
POST /upload/avatar/
Content-Type: multipart/form-data

Parameters:
- file: 图像文件

Response:
{
  "message": "图片上传成功",
  "filename": "avatar_xxx.jpg",
  "url": "/images/avatar_xxx.jpg"
}
```

## 数据格式规范

### 1. 标注数据格式
```json
[
  {
    "x": 530,
    "y": 614,
    "label": "ship",
    "type": "point"
  },
  {
    "x": 332,
    "y": 244,
    "label": "ship",
    "type": "point"
  }
]
```

### 2. COCO格式标注
```json
{
  "images": [
    {
      "file_name": "00006.jpg",
      "id": 1,
      "width": 800,
      "height": 800
    }
  ],
  "categories": [
    {
      "id": 1,
      "name": "person",
      "supercategory": "person"
    }
  ],
  "annotations": [
    {
      "category_id": 4,
      "segmentation": [[0,0,0,0,0,0,0,0]],
      "iscrowd": 0,
      "area": 0.0,
      "point": [530.0, 614.0],
      "true_rbox": [0,0,0,0,0,0,0,0],
      "bbox": [522.0, 606.0, 16.0, 16.0],
      "image_id": 1,
      "id": 1
    }
  ]
}
```

### 3. 标注文件格式
```
0 0 0 0 0 0 0 0 530 614 ship 0
0 0 0 0 0 0 0 0 332 244 ship 0
```
格式说明：`x1 y1 x2 y2 x3 y3 x4 y4 point_x point_y class_name difficulty`

## 关键技术实现

### 1. 前端画布标注技术
- 使用HTML5 Canvas进行图像渲染
- 实现屏幕坐标到图像坐标的转换
- 支持响应式画布缩放
- 实现拖拽和点击交互

### 2. 文件上传处理
- FormData对象处理多部分表单数据
- Base64编码传输图像数据
- 异步文件上传和进度处理

### 3. CORS跨域配置
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4. 错误处理机制
- 前端：axios拦截器统一处理API错误
- 后端：HTTPException返回标准错误信息
- 用户友好的错误提示界面

## 部署和运行

### 后端启动
```bash
cd fastapi-backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt  # 或 uv sync
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 前端启动
```bash
cd react-frontend
npm install
npm run dev
```

### 访问地址
- 前端应用: http://localhost:5173
- 后端API: http://localhost:8000
- API文档: http://localhost:8000/docs

## 当前状态和待办事项

### 已完成功能
✅ 基础项目架构搭建  
✅ React前端界面开发  
✅ FastAPI后端服务搭建  
✅ 图像上传功能  
✅ 点标注功能  
✅ 检测结果显示  
✅ CORS跨域配置  
✅ 数据转换工具  

### 待实现功能
🔄 集成真实的PyTorch检测模型  
🔄 添加更多检测类别  
🔄 批量图像处理  
🔄 标注数据持久化存储  
🔄 用户认证和权限管理  
🔄 检测结果导出功能  
🔄 性能优化和缓存机制  

### 已知问题
⚠️ 当前检测函数为模拟实现，需要替换为真实模型  
⚠️ 缺少数据库存储，标注数据不持久  
⚠️ 大图像处理可能存在性能问题  

## 开发规范

### 代码规范
- 前端使用ESLint进行代码检查
- 后端遵循PEP 8 Python编码规范
- 组件命名采用PascalCase
- 文件命名采用kebab-case

### Git工作流
- 功能分支开发
- 代码审查机制
- 自动化测试集成

### 文档维护
- API文档使用FastAPI自动生成
- 组件文档使用JSDoc注释
- 定期更新开发日志

## 性能优化建议

1. **前端优化**
   - 图像懒加载
   - Canvas渲染优化
   - 组件memo化

2. **后端优化**
   - 异步处理大文件
   - 图像压缩处理
   - 缓存机制

3. **网络优化**
   - 图像分块上传
   - 响应数据压缩
   - CDN加速

## 安全考虑

1. **文件上传安全**
   - 文件类型验证
   - 文件大小限制
   - 恶意文件检测

2. **API安全**
   - 请求频率限制
   - 输入数据验证
   - SQL注入防护

3. **数据安全**
   - 敏感数据加密
   - 访问权限控制
   - 日志审计

---

**最后更新**: 2025-06-17  
**版本**: v1.0.0  
**维护者**: 开发团队