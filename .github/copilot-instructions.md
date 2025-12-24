# Copilot / AI 助手 指南（项目专用）

只记录可从代码验证的事实与命令，确保 AI 代理能立刻高效协作。

## 架构总览
- 后端：`fastapi-backend`（入口 `fastapi-backend/main.py`）。接收图片与点标注，写入 `uploads/`，集成 PointOBB 推理，结果保存到 `uploads/COCO/pseudo_obb_result.json`，可视化输出到 `uploads/visual/`。
- 前端：`react-frontend`（Vite + React）。`src/utils/api.js` 的 `baseURL` 指向 `http://localhost:8000`。关键页面/组件：`components/ImageDetection.jsx`（流程页，包含上传/标注/结果查看）、`components/ImageAnnotation.jsx`（点标注画布）。
- 转换脚本：`fastapi-backend/test_dota2coco_P2B_obb.py`、`fastapi-backend/dota_utils.py` 与顶层 `dota_utils.py` 用于将点标注/文本转 COCO。

## 目录与约定
- 静态挂载：`UPLOAD_DIR = fastapi-backend/uploads` 挂载为 `/uploads`（见 `main.py`），前端直接以 `/uploads/...` 访问。
- 子目录：`uploads/images`（原图）、`uploads/label`（点标注 txt）、`uploads/COCO`（JSON 结果）、`uploads/visual`（检测可视化）。请勿改动结构或路由。
- 标注格式：每行 12 字段：`x1 y1 x2 y2 x3 y3 x4 y4 point_x point_y class difficulty`。后端写入时会固定前8点示例值，真实点位来自前端的 `{x,y,label}`（见 `main.py`/`ImageAnnotation.jsx`）。
- 文件命名：批量上传保存为 `imageNNN.ext`；单次检测路径里常用 `image001.jpg` 作为固定可视化输出名。

## 后端接口与数据流（`main.py`）
- 上传：`POST /upload/images` 批量保存图片并顺序命名；`GET /api/images/list` 列出已上传。
- 标注：`GET /api/annotations/get?filename=imageNNN.jpg`；`POST /api/annotations/save { filename, annotations }` 写入 `uploads/label/imageNNN.txt`。
- 检测：`POST /api/detect`（单图）与 `POST /api/detect/batch`（多图，基于已上传文件名）。结果 JSON 位于 `uploads/COCO/pseudo_obb_result.json`，可视化拷贝到 `uploads/visual/<imageNNN>.jpg`。
- 结果查看：`GET /api/visual/list`、`GET /api/visual/zip`，以及 `GET /api/detection/results`（选取最新或指定文件）。
- 前端当前默认流程：`ImageDetection.jsx` 先保存标注，然后直接打开“结果查看”模式，优先展示 `/uploads/visual` 下图片；若无则回退到 `/uploads/images`。未强制调用 `/api/detect`，便于联调与离线演示。

## PointOBB 集成要点
- 关键常量（`main.py` 顶部）：`WORK_PATH`、`WORK_DIR`、`MODEL_PATH`、`POINTOBB_PYTHON`。命令通过 `bash -c` 执行；日志写入 `WORK_PATH/execute_logs/`。
- 开发模式：`DEVEL_SKIP_MODEL` 环境变量已支持（默认 true）。开启时跳过外部推理，仅复制原图到 `uploads/visual/` 并仍尝试读取 `uploads/COCO/pseudo_obb_result.json`。
- 完整推理前需正确设置上述路径常量；失败原因请查看 `execute_logs/*.log`。

## 常用命令
- 启动后端（开发）
  ```bash
  uvicorn fastapi-backend.main:app --reload --host 0.0.0.0 --port 8000
  ```
- 启动前端（开发）
  ```bash
  cd react-frontend
  npm install
  npm run dev
  ```
- 点标注转 COCO（示例脚本）
  ```bash
  python fastapi-backend/test_dota2coco_P2B_obb.py
  # 输出：uploads/coco_format_point_labels.json（可自定义类别列表）
  ```

## 代理协作提示（改动建议）
- 配置化：如需跨环境运行，可把 `WORK_PATH/WORK_DIR/MODEL_PATH/POINTOBB_PYTHON` 改为从环境变量读取并提供报错提示（位置：`main.py` 顶部）。
- 联调模式：已支持 `DEVEL_SKIP_MODEL`（默认启用）。前端可直接浏览 `uploads/visual`/`uploads/images`；亦可放置伪造 `uploads/COCO/pseudo_obb_result.json` 进行前端联调。
- 保持不变：请勿更改 `/uploads` 静态路由与 `uploads/*` 目录结构，避免破坏前后端耦合路径。

## 快速定位文件
- 后端主流程与路由：`fastapi-backend/main.py`
- COCO/标注转换：`fastapi-backend/dota_utils.py`、`fastapi-backend/test_dota2coco_P2B_obb.py`、顶层 `dota_utils.py`
- 前端请求与交互：`react-frontend/src/utils/api.js`、`react-frontend/src/components/ImageDetection.jsx`、`react-frontend/src/components/ImageAnnotation.jsx`

—— 若你需要我将路径常量改为读取环境变量、或接入真正的推理流程，也可以直接告诉我优先顺序，我来改 `fastapi-backend/main.py` 并提交 PR。
