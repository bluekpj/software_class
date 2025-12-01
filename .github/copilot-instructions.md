# Copilot / AI 助手 指南（项目专用）

下面是让 AI 编码助手快速在此仓库中高效工作的要点。只记录可被代码/文件验证的事实与可执行命令，避免泛泛而谈。

## 项目总体架构（大局）
- **后端**: `fastapi-backend` — 使用 FastAPI 提供 REST 接口（入口：`fastapi-backend/main.py`）。用于接受图片、保存到 `uploads/`、触发 PointOBB 推理并把结果写到 `uploads/COCO/pseudo_obb_result.json`。
- **前端**: `react-frontend` — 基于 Vite + React，前端通过 `react-frontend/src/utils/api.js` 将请求发到 `http://localhost:8000`（`baseURL`）。关键组件：`ImageAnnotation.jsx`（点标注交互）、`ImageDetection.jsx`（检测流程页面）。
- **工具/转换**: 顶层 `dota_utils.py` 与 `fastapi-backend/dota_utils.py` 实现从点标注/文本到 COCO 格式的转换逻辑。

## 关键运行/开发命令
- 启动后端（开发）:
  - 在项目根或 `fastapi-backend` 虚拟环境中运行：
    `uvicorn fastapi-backend.main:app --reload --host 0.0.0.0 --port 8000`
- 启动前端（开发）:
  - 进入 `react-frontend` 执行：
    `npm install` 然后 `npm run dev`（使用 Vite）
- 运行后端测试/脚本：`python fastapi-backend/test_dota2coco_P2B_obb.py`（查看该测试以理解数据转换使用方式）。

## 项目特有约定（重要）
- 上传与静态目录：FastAPI 在 `main.py` 中将 `UPLOAD_DIR = Path(__file__).parent / 'uploads'` 挂载为静态目录（路由 `/uploads`）。前端可直接通过 `/uploads/...` 访问图片。
- 标注文本格式（仓库中多处读取该格式）：每行至少包含 12 个字段：前 8 个为四点坐标（x1 y1 x2 y2 x3 y3 x4 y4），接着 `point_x point_y class_name difficulty`。示例见 `fastapi-backend/main.py` 与 `fastapi-backend/dota_utils.py`。
- 固定文件名/流程：检测流程代码写死使用 `image001.txt`（标注）和 `image001.jpg`（可视化输出），并将模型输出复制为 `uploads/COCO/pseudo_obb_result.json`。任何自动化修改需注意这些硬编码的文件名。
- 外部模型集成点：`fastapi-backend/main.py` 在 `run_detection` 中通过构造一个 shell 脚本串并用 `subprocess`/`bash` 执行 PointOBB 的数据转换、推理与可视化。关键常量（需按部署环境修改）：
  - `WORK_PATH`, `WORK_DIR`, `MODEL_PATH`, `POINTOBB_PYTHON`（文件顶部声明）。

## 调试与本地部署注意事项
- 若要在本地跑完整推理流程，务必先修改 `fastapi-backend/main.py` 顶部的路径常量，或者将这些值设为环境变量并在 `main.py` 中读取。默认值为示例路径（不可直接使用）。
- 因为命令通过 `bash -c` 运行，任何路径或权限错误会在日志 `execute_logs/` 下输出——查看该日志定位子进程错误。
- 若不需要实际模型推理，可跳过调用外部脚本，直接用 `uploads/COCO/pseudo_obb_result.json` 放置一个伪造结果以进行前端联调。

## 代码/样式约定（供自动化修改参考）
- 前端：`api.js` 使用 `axios` 单例，`baseURL` 指向 `http://localhost:8000`，若修改后端端口需同步更新。
- 后端：避免改变 `UPLOAD_DIR` 的相对布局（`uploads/images`, `uploads/label`, `uploads/COCO`, `uploads/visual`），许多脚本与前端路径依赖该结构。

## 推荐的自动化修改示例（Agent 能直接做的事）
- 当用户请求“使检测流程可配置化”时：
  - 把 `WORK_PATH/WORK_DIR/MODEL_PATH/POINTOBB_PYTHON` 改为从环境变量读取（示范代码位置：`fastapi-backend/main.py` 顶部），并提供合理的默认值及错误提示。
- 当用户请求“前端联调后端而不触发模型”时：
  - 在 `fastapi-backend/main.py` 中添加一个 `DEVEL_SKIP_MODEL=True` 的条件分支，用于直接返回 `uploads/COCO/pseudo_obb_result.json` 的内容以便前端开发。

## 查阅位置（快速跳转）
- 后端入口与核心流程：`fastapi-backend/main.py`
- 数据转换与 COCO 格式：`fastapi-backend/dota_utils.py`、`dota_utils.py`
- 前端 Axios/基地址：`react-frontend/src/utils/api.js`
- 前端标注画布与点交互：`react-frontend/src/components/ImageAnnotation.jsx`
- 说明文档/安装提示：`docs/guide.md`、`fastapi-backend/README.md`、`react-frontend/README.md`

---
如果你希望我把常量提取为环境变量、或添加一个开发模式（跳过实际模型调用），我可以直接修改 `fastapi-backend/main.py` 并提交 PR。请告诉我优先要做的两件事。 
