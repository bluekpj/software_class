from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, StreamingResponse
import subprocess
import os
import json
import asyncio
from pathlib import Path
import base64
from typing import Optional, Dict, List
from pydantic import BaseModel
import shutil
from datetime import datetime
import traceback
import io
import zipfile

# ======================== 全局配置 ========================
APP_TITLE = "图像检测API"
APP_DESCRIPTION = "支持图像上传、标注点传入和目标检测的FastAPI服务（集成PointOBB模型）"

# 路径配置（建议统一使用绝对路径，避免跨环境问题）
BASE_DIR = Path(__file__).parent  # 项目根目录
UPLOAD_DIR = BASE_DIR / "uploads"
IMAGE_DIR = UPLOAD_DIR / "images"
LABEL_DIR = UPLOAD_DIR / "label"
COCO_DIR = UPLOAD_DIR / "COCO"
P2BNET_DIR = UPLOAD_DIR / "DIOR-R_scene_pretrain"  # 示例目录：P2Bnet 可视化输出
POINT_OBB_DIR = UPLOAD_DIR / "DIOR-R_scene_pretrain_obb"  # 示例目录：PointOBB 可视化输出

# PointOBB相关配置（请根据实际环境修改）
WORK_PATH = "/mnt/c/mengchao/shared/wsl/PointOBB-main/PointOBB"
WORK_DIR = "xxx/work_dir/test_pointobb_r50_fpn_2x_dior"  # 替换为实际工作目录
MODEL_PATH = "xxx/work_dir/my_modle/pointobb-DIOR-mAP38.08-with-oriented-rcnn.pth"  # 替换为实际模型路径
POINTOBB_PYTHON = "/home/userwsl/miniconda3/envs/pointobb/bin/python"

# 开发模式：跳过实际模型推理，直接返回成功并输出 visual 图片
DEVEL_SKIP_MODEL = os.getenv("DEVEL_SKIP_MODEL", "true").lower() in ["1", "true", "yes", "y"]

# 创建必要目录（确保启动时目录存在）
for dir_path in [IMAGE_DIR, LABEL_DIR, COCO_DIR, P2BNET_DIR, POINT_OBB_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# ======================== 工具函数 ========================
def safe_json_load(file_path: Path) -> Optional[Dict]:
    """安全读取JSON文件"""
    try:
        if file_path.exists() and file_path.stat().st_size > 0:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            print(f"⚠ JSON文件不存在或为空：{file_path}")
            return None
    except Exception as e:
        print(f"❌ 读取JSON文件失败：{str(e)}")
        return None

def generate_safe_filename(original_filename: str, prefix: str = "detect") -> str:
    """生成安全的唯一文件名（避免重复和特殊字符）"""
    # 提取文件扩展名
    if "." in original_filename:
        ext = original_filename.split(".")[-1].lower()
        # 限制支持的图片格式
        ext = ext if ext in ["jpg", "jpeg", "png", "bmp"] else "jpg"
    else:
        ext = "jpg"
    
    # 用时间戳+哈希生成唯一文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # 毫秒级时间戳
    file_hash = hash(original_filename + timestamp) % 10000  # 简单哈希避免冲突
    return f"{prefix}_{timestamp}_{file_hash}.{ext}"


def list_images_from_dir(dir_path: Path) -> List[Dict]:
    """列出指定目录下的图片文件，按修改时间倒序"""
    dir_path.mkdir(parents=True, exist_ok=True)
    paths = list(dir_path.glob("*.jpg")) + list(dir_path.glob("*.png")) + list(dir_path.glob("*.bmp"))
    paths.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    rel = dir_path.relative_to(UPLOAD_DIR)
    images = [{
        "filename": p.name,
        "url": f"/uploads/{rel}/{p.name}",
        "mtime": datetime.fromtimestamp(p.stat().st_mtime).isoformat()
    } for p in paths]
    return images


def zip_images_from_dir(dir_path: Path, prefix: str) -> StreamingResponse:
    """打包指定目录下的图片为 zip 返回"""
    dir_path.mkdir(parents=True, exist_ok=True)
    paths = list(dir_path.glob("*.jpg")) + list(dir_path.glob("*.png")) + list(dir_path.glob("*.bmp"))
    if not paths:
        raise HTTPException(status_code=404, detail=f"{dir_path.name} 目录下无可下载的图片")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            try:
                zf.write(p, arcname=p.name)
            except Exception:
                continue
    buf.seek(0)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{prefix}_{ts}.zip"
    headers = {
        "Content-Disposition": f"attachment; filename={filename}"
    }
    return StreamingResponse(buf, media_type="application/zip", headers=headers)

# ======================== 检测核心函数 ========================
async def run_detection(image_path: str, annotations: List[Dict] = None, base_name: str = "image001") -> Dict:
    """
    执行完整检测流程：
    1. 处理标注点并保存为txt
    2. 异步执行PointOBB相关命令
    3. 读取检测结果JSON
    4. 返回标准化检测结果
    """
    # 确保标注点列表不为None
    annotations = annotations or []
    image_filename = Path(image_path).name
    # 基础名（不含扩展）用于生成唯一的标注/可视化文件
    base_stem = Path(base_name).stem  # 允许运行时传入 image002 / image010 等

    print(f"\n📥 开始处理检测任务：{image_filename}，标注点数量：{len(annotations)}")

    # 1. 保存标注点为指定格式的txt文件（使用固定文件名）
    txt_filename = f"{base_stem}.txt"
    txt_file_path = LABEL_DIR / txt_filename
    try:
        with open(txt_file_path, "w", encoding="utf-8") as f:
            for idx, ann in enumerate(annotations):
                # 验证标注点数据完整性
                x = ann.get("x", 0.0)
                y = ann.get("y", 0.0)
                label = ann.get("label", f"point_{idx+1}")
                # 按照指定格式写入：x1 y1 x2 y2 x3 y3 x4 y4 point_x point_y class_name difficulty
                line = f"271.0 196.0 300.0 177.0 363.0 275.0 334.0 293.0 {x} {y} {label} 0\n"
                f.write(line)
        print(f"✅ 标注点已保存至：{txt_file_path}")
    except Exception as e:
        print(f"⚠ 保存标注点失败：{str(e)}，将继续执行检测")

    # 2. 构建并执行命令流
    # 确保可视化目录存在
    visual_dir = UPLOAD_DIR / "visual"
    visual_dir.mkdir(parents=True, exist_ok=True)
    
    # 可视化结果文件名
    visual_filename = f"{base_stem}.jpg"
    visual_file_path = visual_dir / visual_filename
    
    core_cmd = f"""
    set -euo pipefail
    # 切换工作目录
    cd {WORK_PATH} || {{ echo "❌ 切换工作目录失败：{WORK_PATH}"; exit 1; }}
    echo "✅ 工作目录：{WORK_PATH}"
    echo "✅ Python解释器：{POINTOBB_PYTHON}"
    echo "✅ 处理图片：{image_path}"
    echo "✅ 标注文件：{txt_file_path}"
    
    # 1. 数据转换
    {POINTOBB_PYTHON} tools_data_trans/test_dota2coco_P2B_obb-pt.py || {{ 
        echo "❌ 数据转换脚本失败"; 
        ls -l tools_data_trans/; 
        exit 1; 
    }}
    
    # 2. 模型推理
    {POINTOBB_PYTHON} tools/train.py \
      --config configs2/pointobb/pointobb_r50_fpn_2x_dior.py \
      --work-dir {WORK_DIR} \
      --cfg-options \
        evaluation.save_result_file="{WORK_DIR}/pseudo_obb_result.json" \
        evaluation.do_first_eval=True \
        runner.max_epochs=0 \
        load_from="{MODEL_PATH}" || {{ 
        echo "❌ train.py执行失败"; 
        exit 1; 
    }}
    
    # 3. 可视化（可选，失败不影响结果）
    echo "📊 开始生成可视化结果..."
    {POINTOBB_PYTHON} visual_json_trans_obb.py || echo "⚠ 可视化脚本执行失败（非关键错误）"
    
    # 检查可视化结果是否生成
    if [ -d "visual" ]; then
        echo "✅ 可视化目录存在，包含文件："
        ls -l visual/ || echo "⚠ 无法列出visual目录内容"
    else
        echo "⚠ visual目录不存在，创建它..."
        mkdir -p visual
    fi
    
    # 4. 复制结果文件（确保目标目录存在）
    mkdir -p {COCO_DIR} || {{ echo "❌ 创建COCO目录失败"; exit 1; }}
    cp -f {WORK_DIR}/pseudo_obb_result.json {COCO_DIR}/ || {{ 
        echo "❌ 复制结果文件失败"; 
        ls -l {WORK_DIR}/; 
        exit 1; 
    }}
    
    # 5. 复制并命名可视化结果到静态文件目录
    echo "📤 复制并命名可视化结果到静态目录..."
    mkdir -p {visual_dir} || {{ echo "❌ 创建可视化目录失败"; exit 1; }}
    
    # 查找最新的可视化结果文件
    latest_visual_file=$(ls -t visual/*.jpg 2>/dev/null | head -1)
    if [ -z "$latest_visual_file" ]; then
        latest_visual_file=$(ls -t visual/*.png 2>/dev/null | head -1)
    fi
    if [ -z "$latest_visual_file" ]; then
        latest_visual_file=$(ls -t visual/*.bmp 2>/dev/null | head -1)
    fi
    
    # 复制并命名为image001.jpg
    if [ -n "$latest_visual_file" ]; then
        echo "✅ 找到最新可视化文件：$latest_visual_file"
        cp -f "$latest_visual_file" {visual_file_path} || {{ 
            echo "❌ 复制可视化结果失败"; 
            exit 1; 
        }}
        echo "✅ 已将可视化结果命名为：{visual_filename}"
    else
        echo "⚠ 未找到可视化结果文件，将使用原图作为可视化结果"
        # 如果没有可视化结果，复制原图到可视化目录
        cp -f {image_path} {visual_file_path} || {{ 
            echo "❌ 复制原图作为可视化结果失败"; 
        }}
    fi
    
    # 检查是否复制成功
    echo "✅ 复制完成，静态目录包含文件："
    ls -l {visual_dir} || echo "⚠ 无法列出静态目录内容"
    
    echo "🎉 检测流程执行完成！"
    echo "📁 结果文件路径：{COCO_DIR}/pseudo_obb_result.json"
    echo "📊 可视化结果路径：{visual_file_path}"
    """

    # 日志配置
    log_dir = Path(WORK_PATH) / "execute_logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_filename = f"execute_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{Path(image_path).stem}.log"
    log_file_path = log_dir / log_filename

    # 异步执行命令（不阻塞事件循环）
    async def execute_cmd() -> bool:
        """执行命令流并返回执行状态"""
        print(f"🚀 开始执行命令流，日志保存至：{log_file_path}")
        try:
            loop = asyncio.get_running_loop()
            # 使用线程池执行同步的subprocess调用
            await loop.run_in_executor(None, lambda: subprocess.run(
                ["bash", "-c", core_cmd],
                check=True,
                stdout=open(log_file_path, "w", encoding="utf-8"),
                stderr=open(log_file_path, "a", encoding="utf-8"),
                timeout=3600  # 1小时超时
            ))
            print(f"✅ 命令流执行成功：{log_file_path}")
            return True
        except subprocess.CalledProcessError as e:
            error_msg = f"命令执行失败（返回码：{e.returncode}）"
        except subprocess.TimeoutExpired:
            error_msg = "命令执行超时（超过1小时）"
        except Exception as e:
            error_msg = f"命令执行异常：{str(e)}"
        
        print(f"❌ {error_msg}，详情见日志：{log_file_path}")
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(f"\n===== 执行失败 =====\n{error_msg}\n{traceback.format_exc()}\n")
        return False

    # 执行命令并等待完成
    if DEVEL_SKIP_MODEL:
        # 开发模式：跳过外部命令，将原图复制为可视化输出
        try:
            if Path(image_path).exists():
                shutil.copy(image_path, visual_file_path)
        except Exception:
            pass
        cmd_success = True
    else:
        cmd_success = await execute_cmd()
    # 命令已经执行完

    # 3. 读取并解析检测结果
    result_file_path = COCO_DIR / "pseudo_obb_result.json"
    # 即使在开发模式也尝试读取（若不存在则为 None）
    detection_json = safe_json_load(result_file_path)

    # 4. 标准化检测结果（适配前端格式）
    # 固定可视化结果文件名
    visual_filename = f"{base_stem}.jpg"
    visual_file_path = UPLOAD_DIR / "visual" / visual_filename
    
    # 检查可视化结果文件是否存在
    visual_file_exists = visual_file_path.exists()
    latest_visual_file = str(visual_file_path) if visual_file_exists else None
    
    # 获取所有可视化结果文件
    visual_dir = UPLOAD_DIR / "visual"
    visual_files = list(visual_dir.glob("*.jpg")) + list(visual_dir.glob("*.png")) + list(visual_dir.glob("*.bmp"))
    
    # 输出可视化结果信息到日志
    print(f"📊 可视化结果：")
    print(f"   - 可视化目录：{visual_dir}")
    print(f"   - 固定结果文件名：{visual_filename}")
    print(f"   - 固定结果文件路径：{visual_file_path}")
    print(f"   - 固定结果文件是否存在：{visual_file_exists}")
    print(f"   - 结果文件数：{len(visual_files)}")
    for vf in visual_files:
        print(f"   - {vf.name} (修改时间：{vf.stat().st_mtime})")
    
    standard_result = {
        "detections": [],
        "image_width": 640,  # 实际应从图片元数据读取，这里先默认
        "image_height": 480,
        "used_annotations": len(annotations),
        "cmd_success": cmd_success,
        "log_file": str(log_file_path),
        "result_file": str(result_file_path) if result_file_path.exists() else None,
        "visual_file": latest_visual_file,
        "visual_files": [str(f) for f in visual_files],
        "visual_count": len(visual_files),
        "visual_filename": visual_filename  # 添加固定文件名字段
    }

    # 如果有真实检测结果，解析为前端需要的格式
    if detection_json and isinstance(detection_json, (dict, list)):
        # 适配COCO格式的检测结果（根据实际JSON结构调整，这里是通用示例）
        if isinstance(detection_json, dict):
            detections = detection_json.get("annotations", [])
        else:
            detections = detection_json

        standard_detections = []
        # 用于统计各类别的得分
        category_scores = {}
        
        for det in detections:
            # 适配常见的检测结果字段（根据你的JSON结构修改）
            bbox = det.get("bbox", [0, 0, 0, 0])  # [x, y, width, height]
            label = det.get("category_name", det.get("label", "unknown"))
            confidence = det.get("score", det.get("confidence", 0.0))
            
            standard_detections.append({
                "bbox": [float(x) for x in bbox],
                "label": str(label),
                "confidence": float(confidence) if confidence is not None else 0.0
            })
            
            # 统计各类别的得分
            if label in category_scores:
                category_scores[label].append(confidence)
            else:
                category_scores[label] = [confidence]
        
        # 计算各类别的平均得分和最高得分
        category_stats = {}
        for category, scores in category_scores.items():
            category_stats[category] = {
                "count": len(scores),
                "avg_score": sum(scores) / len(scores),
                "max_score": max(scores),
                "min_score": min(scores)
            }
        
        standard_result["detections"] = standard_detections
        standard_result["detection_count"] = len(standard_detections)
        standard_result["category_stats"] = category_stats
        # 尝试从JSON中获取图片尺寸
        if isinstance(detection_json, dict):
            images = detection_json.get("images", [])
            if images:
                standard_result["image_width"] = images[0].get("width", 640)
                standard_result["image_height"] = images[0].get("height", 480)
    else:
        # 无真实结果时返回空检测结果，不使用模拟数据
        standard_result["detections"] = []
        standard_result["detection_count"] = 0
        standard_result["category_stats"] = {}
        # 仍然可以返回可视化结果，即使没有检测数据
        print(f"⚠ 没有检测到真实结果，但可能仍有可视化结果")

    print(f"📋 检测任务处理完成：{image_filename}，检测到目标数：{standard_result['detection_count']}")
    return standard_result

# ======================== FastAPI应用配置 ========================
app = FastAPI(title=APP_TITLE, description=APP_DESCRIPTION, version="1.0.0")

# 配置CORS（支持更多前端地址，生产环境建议限制具体域名）
app.add_middleware(
    CORSMiddleware,
    # 放宽 CORS 方便公网访问；如需收紧可改为具体域名列表
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录（用于前端访问上传的图片）
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ======================== 批量检测数据模型 ========================
class AnnotationItem(BaseModel):
    x: float
    y: float
    label: Optional[str] = None

class BatchDetectItem(BaseModel):
    filename: str
    annotations: List[AnnotationItem] = []

class BatchDetectRequest(BaseModel):
    items: List[BatchDetectItem]

class SaveAnnotationsRequest(BaseModel):
    filename: str
    annotations: List[AnnotationItem] = []

# ======================== 路由定义 ========================
@app.get("/", tags=["基础接口"])
async def root():
    return {
        "message": "欢迎使用图像检测API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "redoc_url": "/redoc"
    }

@app.get("/api/health", tags=["基础接口"])
async def health_check():
    """服务健康检查"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "fastapi": "running",
            "pointobb": "ready" if Path(WORK_PATH).exists() else "path_not_found"
        }
    }

@app.post("/upload/avatar", tags=["文件上传"])
async def upload_avatar(file: UploadFile = File(...)):
    """上传头像（仅支持图片格式）"""
    # 验证文件类型
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持图片文件（JPG、PNG、BMP）")
    
    # 生成安全文件名并保存
    safe_filename = generate_safe_filename(file.filename, prefix="avatar")
    file_path = IMAGE_DIR / safe_filename
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # 返回可访问的URL
        image_url = f"/uploads/images/{safe_filename}"
        return {
            "success": True,
            "message": "头像上传成功",
            "filename": safe_filename,
            "url": image_url,
            "full_path": str(file_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败：{str(e)}")

@app.post("/upload/images", tags=["文件上传"])
async def upload_images(files: List[UploadFile] = File(...)):
    """批量上传图片并按 image001/002 顺序命名"""
    if not files:
        raise HTTPException(status_code=400, detail="未提供文件")

    # 统计现有 imageNNN 文件，确定起始编号
    existing = [p for p in IMAGE_DIR.glob("image*.jpg")] + [p for p in IMAGE_DIR.glob("image*.png")] + [p for p in IMAGE_DIR.glob("image*.jpeg")]
    max_index = 0
    for p in existing:
        name = p.stem  # image001
        if name.startswith("image") and len(name) == 8:  # image + 3 digits
            try:
                idx = int(name[5:])
                max_index = max(max_index, idx)
            except ValueError:
                pass

    saved = []
    next_index = max_index + 1
    for uf in files:
        if not uf.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"文件 {uf.filename} 不是图片类型")
        ext = os.path.splitext(uf.filename)[1].lower() or ".jpg"
        if ext not in [".jpg", ".jpeg", ".png", ".bmp"]:
            ext = ".jpg"
        sequential_name = f"image{next_index:03d}{ext if ext != '.jpeg' else '.jpg'}"
        next_index += 1
        file_path = IMAGE_DIR / sequential_name
        content = await uf.read()
        with open(file_path, "wb") as f:
            f.write(content)
        saved.append({
            "original": uf.filename,
            "saved": sequential_name,
            "url": f"/uploads/images/{sequential_name}",
            "path": str(file_path)
        })
    return {"success": True, "count": len(saved), "files": saved}

@app.get("/api/images/list", tags=["文件上传"])
async def list_images():
    """列出当前已上传的顺序命名图片（支持 jpg/png/jpeg/bmp）以及是否存在对应可视化结果"""
    items = []
    paths = list(IMAGE_DIR.glob("image*.jpg")) + list(IMAGE_DIR.glob("image*.png")) + list(IMAGE_DIR.glob("image*.jpeg")) + list(IMAGE_DIR.glob("image*.bmp"))
    for img in sorted(paths, key=lambda p: p.stat().st_mtime):
        stem = img.stem
        visual_file_jpg = (UPLOAD_DIR / "visual" / f"{stem}.jpg")
        visual_file_png = (UPLOAD_DIR / "visual" / f"{stem}.png")
        visual_exists = visual_file_jpg.exists() or visual_file_png.exists()
        visual_url = None
        if visual_file_jpg.exists():
            visual_url = f"/uploads/visual/{visual_file_jpg.name}"
        elif visual_file_png.exists():
            visual_url = f"/uploads/visual/{visual_file_png.name}"
        items.append({
            "filename": img.name,
            "url": f"/uploads/images/{img.name}",
            "visual_exists": visual_exists,
            "visual_url": visual_url
        })
    return {"success": True, "count": len(items), "images": items}

@app.get("/api/visual/list", tags=["结果查询"])
async def list_visual_images():
    """列出 uploads/visual 下的图片，按修改时间倒序"""
    visual_dir = UPLOAD_DIR / "visual"
    visual_dir.mkdir(parents=True, exist_ok=True)
    paths = list(visual_dir.glob("*.jpg")) + list(visual_dir.glob("*.png")) + list(visual_dir.glob("*.bmp"))
    paths.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    images = [{
        "filename": p.name,
        "url": f"/uploads/visual/{p.name}",
        "mtime": datetime.fromtimestamp(p.stat().st_mtime).isoformat()
    } for p in paths]
    # 统一返回 files 字段，前端已兼容 images 字段也不受影响
    return {"success": True, "count": len(images), "files": images}


@app.get("/api/visual/p2bnet", tags=["结果查询"])
async def list_visual_p2bnet():
    """模拟 P2Bnet：列出 uploads/pretarain 下的图片"""
    images = list_images_from_dir(P2BNET_DIR)
    return {"success": True, "count": len(images), "files": images}


@app.get("/api/visual/pointobb", tags=["结果查询"])
async def list_visual_pointobb():
    """模拟 PointOBB：列出 uploads/pretrain_obb 下的图片"""
    images = list_images_from_dir(POINT_OBB_DIR)
    return {"success": True, "count": len(images), "files": images}

@app.get("/api/visual/zip", tags=["结果查询"])
async def download_visual_zip():
    """将 uploads/visual 下的图片打包为 zip 返回下载"""
    visual_dir = UPLOAD_DIR / "visual"
    return zip_images_from_dir(visual_dir, "visual_images")


@app.get("/api/visual/zip/p2bnet", tags=["结果查询"])
async def download_visual_zip_p2bnet():
    """将 uploads/DIOR-R_scene_pretrain 下的图片打包为 zip 返回下载"""
    return zip_images_from_dir(P2BNET_DIR, "p2bnet_images")


@app.get("/api/visual/zip/pointobb", tags=["结果查询"])
async def download_visual_zip_pointobb():
    """将 uploads/DIOR-R_scene_pretrain_obb 下的图片打包为 zip 返回下载"""
    return zip_images_from_dir(POINT_OBB_DIR, "pointobb_images")

@app.get("/api/annotations/get", tags=["标注"])
async def get_annotations(filename: str):
    """读取指定图片的标注，来源于 label/<imageXXX>.txt"""
    base = Path(filename).stem
    txt_path = LABEL_DIR / f"{base}.txt"
    result = []
    if not txt_path.exists():
        return {"success": True, "filename": filename, "annotations": []}
    try:
        with open(txt_path, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 10:
                    try:
                        px = float(parts[8])
                        py = float(parts[9])
                        label = parts[10] if len(parts) >= 11 else ""
                        result.append({"x": px, "y": py, "label": label or None})
                    except Exception:
                        continue
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取标注失败：{str(e)}")
    return {"success": True, "filename": filename, "annotations": result}

@app.post("/api/annotations/save", tags=["标注"])
async def save_annotations(payload: SaveAnnotationsRequest):
    """将标注保存为 label/<imageXXX>.txt，格式与检测前置一致"""
    base = Path(payload.filename).stem
    txt_path = LABEL_DIR / f"{base}.txt"
    try:
        LABEL_DIR.mkdir(parents=True, exist_ok=True)
        with open(txt_path, "w", encoding="utf-8") as f:
            for idx, ann in enumerate(payload.annotations):
                x = ann.x
                y = ann.y
                label = ann.label or f"point_{idx+1}"
                line = f"271.0 196.0 300.0 177.0 363.0 275.0 334.0 293.0 {x} {y} {label} 0\n"
                f.write(line)
        return {"success": True, "filename": payload.filename, "path": str(txt_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存标注失败：{str(e)}")

@app.post("/api/detect", tags=["目标检测"])
async def detect_objects(
    file: UploadFile = File(...),
    annotations: Optional[str] = Form(None)
):
    """
    核心检测接口：上传图片+可选标注点，返回检测结果
    - file: 图片文件（支持JPG、PNG、BMP）
    - annotations: 标注点JSON字符串（格式：[{"x": 100, "y": 200, "label": "点1"}, ...]）
    """
    # 1. 验证文件类型
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持图片文件（JPG、PNG、BMP）")
    
    try:
        # 2. 保存上传的图片（使用固定文件名）
        safe_filename = "image001.jpg"
        file_path = IMAGE_DIR / safe_filename
        
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        print(f"✅ 图片已保存：{file_path}")

        # 3. 解析标注数据
        annotation_data = None
        if annotations:
            try:
                annotation_data = json.loads(annotations)
                # 验证标注数据格式
                if not isinstance(annotation_data, list):
                    raise ValueError("标注数据必须是数组格式")
                # 过滤无效标注点
                annotation_data = [
                    ann for ann in annotation_data
                    if isinstance(ann, dict) and "x" in ann and "y" in ann
                ]
                print(f"✅ 解析标注点：有效数量={len(annotation_data)}")
            except json.JSONDecodeError:
                raise ValueError("标注数据JSON格式错误")
            except Exception as e:
                raise ValueError(f"标注数据处理失败：{str(e)}")

        # 4. 执行检测（核心步骤）
        detection_result = await run_detection(str(file_path), annotation_data)

        # 5. 生成图片Base64（用于前端预览）
        with open(file_path, "rb") as f:
            img_base64 = base64.b64encode(f.read()).decode("utf-8")
        file_extension = safe_filename.split(".")[-1]
        base64_url = f"data:image/{file_extension};base64,{img_base64}"

        # 6. 构建返回结果
        # 固定可视化结果文件名和URL
        visual_filename = "image001.jpg"
        visual_url = f"/uploads/visual/{visual_filename}"
        
        # 生成所有可视化结果URL列表
        visual_urls = []
        for visual_file in detection_result.get("visual_files", []):
            vf = Path(visual_file)
            visual_urls.append(f"/uploads/visual/{vf.name}")
        
        # 输出调试信息
        print(f"🔍 调试信息：")
        print(f"   - 图片文件名：{safe_filename}")
        print(f"   - 图片URL：/uploads/images/{safe_filename}")
        print(f"   - 固定可视化文件名：{visual_filename}")
        print(f"   - 固定可视化URL：{visual_url}")
        print(f"   - 可视化URL列表：{visual_urls}")
        print(f"   - 可视化文件数量：{detection_result.get('visual_count', 0)}")
        
        return {
            "success": True,
            "filename": safe_filename,
            "image_url": f"/uploads/images/{safe_filename}",  # 静态文件访问URL
            "image_base64": base64_url,  # Base64编码（用于前端直接显示）
            "detections": detection_result["detections"],
            "detection_count": detection_result["detection_count"],
            "category_stats": detection_result["category_stats"],  # 各类别得分统计
            "image_width": detection_result["image_width"],
            "image_height": detection_result["image_height"],
            "annotations_used": detection_result["used_annotations"],
            "cmd_status": "success" if detection_result["cmd_success"] else "failed",
            "log_file": detection_result["log_file"],
            "result_file": detection_result["result_file"],
            "visual_url": visual_url,  # 固定可视化结果URL
            "visual_urls": visual_urls,  # 所有可视化结果URL列表
            "visual_count": detection_result.get("visual_count", 0),  # 可视化结果数量
            "visual_filename": visual_filename,  # 固定可视化文件名
            "debug_info": {
                "visual_dir": str(UPLOAD_DIR / "visual"),
                "visual_files": [str(Path(f).name) for f in detection_result.get("visual_files", [])],
                "fixed_visual_url": visual_url
            }
        }

    except HTTPException:
        # 重新抛出已定义的HTTP异常
        raise
    except Exception as e:
        # 捕获所有其他异常，返回详细错误信息
        error_detail = f"检测失败：{str(e)}\n{traceback.format_exc()[:500]}"  # 限制错误长度
        print(f"❌ 检测接口异常：{error_detail}")
        raise HTTPException(status_code=500, detail=error_detail)

@app.post("/api/detect/batch", tags=["目标检测"])
async def batch_detect(request: BatchDetectRequest):
    if not request.items:
        raise HTTPException(status_code=400, detail="请求中无 items")
    results = []
    for idx, item in enumerate(request.items, start=1):
        image_path = IMAGE_DIR / item.filename
        if not image_path.exists():
            results.append({
                "filename": item.filename,
                "success": False,
                "error": "图片不存在"
            })
            continue
        anns = [ann.model_dump() for ann in item.annotations]
        # 基于文件名的基础名用于生成唯一输出
        base_name = Path(item.filename).stem
        det_res = await run_detection(str(image_path), anns, base_name=base_name)
        unique_result_file = None
        src_result = det_res.get("result_file")
        if src_result and Path(src_result).exists():
            unique_result = COCO_DIR / f"{base_name}_pseudo_obb_result.json"
            try:
                shutil.copy(src_result, unique_result)
                unique_result_file = str(unique_result)
            except Exception:
                unique_result_file = None
        unique_visual_file = None
        visual_src = det_res.get("visual_file")
        if visual_src and visual_src:
            vf_path = Path(visual_src)
            if vf_path.exists():
                target_visual = vf_path.parent / f"{base_name}{vf_path.suffix}"
                try:
                    if vf_path != target_visual:
                        shutil.copy(vf_path, target_visual)
                    unique_visual_file = str(target_visual)
                except Exception:
                    unique_visual_file = None
        results.append({
            "filename": item.filename,
            "success": True,
            "detection_count": det_res.get("detection_count", 0),
            "detections": det_res.get("detections", []),
            "category_stats": det_res.get("category_stats", {}),
            "result_file": det_res.get("result_file"),
            "unique_result_file": unique_result_file,
            "visual_file": det_res.get("visual_file"),
            "unique_visual_file": unique_visual_file,
            "annotations_used": det_res.get("used_annotations", 0)
        })
    return {"success": True, "batch_count": len(results), "results": results}

@app.get("/api/detection/results", tags=["结果查询"])
async def get_detection_results(filename: Optional[str] = None):
    """
    查询检测结果：
    - 不指定filename：返回最新的检测结果
    - 指定filename：返回对应图片的检测结果
    """
    # 查找最新的结果文件
    result_files = list(COCO_DIR.glob("*.json"))
    if not result_files:
        raise HTTPException(status_code=404, detail="暂无检测结果")
    
    # 按修改时间排序（最新的在前）
    result_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    
    # 查找指定文件或返回最新文件
    target_file = None
    if filename:
        target_filename = Path(filename).stem + ".json"
        for file in result_files:
            if file.name == target_filename:
                target_file = file
                break
        if not target_file:
            raise HTTPException(status_code=404, detail=f"未找到{filename}对应的检测结果")
    else:
        target_file = result_files[0]
    
    # 读取并返回结果
    result_data = safe_json_load(target_file)
    if not result_data:
        raise HTTPException(status_code=500, detail="读取检测结果失败")
    
    return {
        "success": True,
        "filename": target_file.name,
        "last_modified": datetime.fromtimestamp(target_file.stat().st_mtime).isoformat(),
        "result": result_data
    }

if __name__ == "__main__":
    import uvicorn
    # 启动服务（支持热重载）
    uvicorn.run(
        "main:app",  # 注意：如果文件名为其他名称，需修改此处（如"api:app"）
        host="0.0.0.0",  # 允许外部访问
        port=8000,
        reload=True  # 开发环境启用热重载，生产环境禁用
    )