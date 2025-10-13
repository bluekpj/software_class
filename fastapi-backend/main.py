from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import os
import json
import asyncio
from pathlib import Path
import base64
from typing import Optional

# 模拟的检测函数 - 您需要替换为实际的PyTorch检测函数调用
async def run_detection(image_path: str, annotations: list = None):
    """
    这是一个示例函数，您需要根据实际的PyTorch项目来替换
    参数:
        image_path - 图片文件路径
        annotations - 标注点列表 [{"x": 100, "y": 200, "label": "点1"}, ...]
    返回: 检测结果字典，包含边界框、标签、置信度等信息

    实际使用时，您可能需要这样调用:
    import your_detection_module
    result = your_detection_module.run_detection(image_path, annotations)
    """
    # 模拟检测延迟
    await asyncio.sleep(2)

    # 如果有标注点，在日志中打印（实际使用时传给模型）
    if annotations:
        print(f"收到 {len(annotations)} 个标注点:")
        for i, ann in enumerate(annotations):
            print(f"  点{i+1}: {ann['label']} at ({ann['x']}, {ann['y']})")

    # 模拟检测结果 - 实际使用时请替换为真实的检测函数调用
    # 如果有标注点，可以根据标注点生成不同的结果
    return {
        "detections": [
            {
                "bbox": [100, 100, 200, 200],  # [x, y, width, height]
                "label": "person",
                "confidence": 0.95
            },
            {
                "bbox": [300, 150, 150, 180],
                "label": "car",
                "confidence": 0.87
            },
            {
                "bbox": [50, 50, 80, 120],
                "label": "dog",
                "confidence": 0.73
            }
        ],
        "image_width": 640,
        "image_height": 480,
        "used_annotations": len(annotations) if annotations else 0
    }
# 创建 FastAPI 应用实例
app = FastAPI(title="图像检测API", description="支持图像上传和目标检测的API服务")

# 配置 CORS 中间件
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 定义一个简单的根路由
@app.get("/")
async def root():
    return {"message": "Hello World from FastAPI!"}

# 定义一个 API 端点用于测试
@app.get("/api/items")
async def read_items():
    return [{"id": 1, "name": "Item 1"}, {"id": 2, "name": "Item 2"}]

# 创建图片保存目录
IMAGE_DIR = Path("uploads/images")
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

@app.post("/upload/avatar/")
async def upload_avatar(file: UploadFile = File(...)):
    # 限制只能上传图片
    allowed_types = ['image/jpeg', 'image/png']
    if file.content_type not in allowed_types:
        return {"error": "只支持 JPG, PNG 格式"}
    
    # 生成安全的文件名
    file_extension = file.filename.split('.')[-1]
    safe_filename = f"avatar_{hash(file.filename)}.{file_extension}"
    
    # 保存文件
    file_path = IMAGE_DIR / safe_filename
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    return {
        "message": "图片上传成功",
        "filename": safe_filename,
        "url": f"/images/{safe_filename}"
    }
@app.post("/api/detect")
async def detect_objects(
    file: UploadFile = File(...),
    annotations: Optional[str] = Form(None)
):
    """
    图像目标检测端点
    接收图片文件和可选的标注数据，返回检测结果

    参数:
        file: 图片文件
        annotations: JSON字符串格式的标注数据（可选）
    """
    # 验证文件类型
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="只支持图片文件")

    try:
        # 保存上传的图片
        file_extension = file.filename.split('.')[-1] if file.filename else 'jpg'
        safe_filename = f"detect_{hash(file.filename or 'image')}.{file_extension}"
        file_path = IMAGE_DIR / safe_filename

        # 读取并保存文件
        content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)

        # 解析标注数据
        annotation_data = None
        if annotations:
            try:
                annotation_data = json.loads(annotations)
                print(f"✓ 接收到标注数据: {len(annotation_data)} 个标注点")
            except json.JSONDecodeError:
                print("⚠ 标注数据解析失败，将不使用标注数据")
                annotation_data = None

        # 调用检测函数，传入标注数据
        detection_result = await run_detection(str(file_path), annotation_data)

        # 读取图片并转换为base64（用于前端显示）
        with open(file_path, "rb") as img_file:
            img_base64 = base64.b64encode(img_file.read()).decode('utf-8')

        # 清理临时文件（可选）
        # os.remove(file_path)

        return {
            "success": True,
            "filename": safe_filename,
            "image_base64": f"data:image/{file_extension};base64,{img_base64}",
            "detections": detection_result["detections"],
            "image_width": detection_result["image_width"],
            "image_height": detection_result["image_height"],
            "detection_count": len(detection_result["detections"]),
            "annotations_used": detection_result.get("used_annotations", 0)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检测失败: {str(e)}")

@app.get("/api/detection/status")
async def get_detection_status():
    """获取检测服务状态"""
    return {
        "status": "ready",
        "message": "图像检测服务运行正常"
    }