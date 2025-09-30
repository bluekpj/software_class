import { useState } from 'react'
import axios from 'axios'
import './ImageDetection.css'

const ImageDetection = () => {
  const [selectedFile, setSelectedFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [detectionResult, setDetectionResult] = useState(null)
  const [error, setError] = useState(null)

  // 处理文件选择
  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSelectedFile(file)
      setDetectionResult(null)
      setError(null)

      // 生成预览
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  // 处理拖拽上传
  const handleDrop = (event) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file)
      setDetectionResult(null)
      setError(null)

      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
  }

  // 开始检测
  const startDetection = async () => {
    if (!selectedFile) return

    setDetecting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await axios.post('/api/detect', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000 // 30秒超时
      })

      setDetectionResult(response.data)
    } catch (err) {
      console.error('检测失败:', err)
      setError(err.response?.data?.detail || '检测失败，请重试')
    } finally {
      setDetecting(false)
    }
  }

  // 清除结果
  const clearResults = () => {
    setSelectedFile(null)
    setPreview(null)
    setDetectionResult(null)
    setError(null)
  }

  return (
    <div className="image-detection">
      <h2>图像目标检测</h2>

      {/* 文件上传区域 */}
      <div
        className={`upload-area ${selectedFile ? 'has-file' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {!preview ? (
          <div className="upload-content">
            <div className="upload-icon">📁</div>
            <p>拖拽图片到此处或点击选择文件</p>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="file-input"
            />
          </div>
        ) : (
          <div className="preview-container">
            <img src={preview} alt="Preview" className="preview-image" />
            {selectedFile && (
              <div className="file-info">
                <p>文件: {selectedFile.name}</p>
                <p>大小: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="action-buttons">
        <button
          onClick={startDetection}
          disabled={!selectedFile || detecting}
          className="detect-button"
        >
          {detecting ? '检测中...' : '开始检测'}
        </button>

        <button
          onClick={clearResults}
          className="clear-button"
          disabled={detecting}
        >
          清除
        </button>
      </div>

      {/* 进度指示器 */}
      {detecting && (
        <div className="detection-progress">
          <div className="progress-bar">
            <div className="progress-fill"></div>
          </div>
          <p>正在处理图像，请稍候...</p>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
        </div>
      )}

      {/* 检测结果 */}
      {detectionResult && (
        <div className="detection-results">
          <h3>检测结果</h3>
          <div className="results-summary">
            <p>检测到 {detectionResult.detection_count} 个对象</p>
          </div>

          {/* 带标注的图像 */}
          <div className="annotated-image-container">
            <div className="image-canvas-wrapper">
              <img
                src={detectionResult.image_base64}
                alt="检测结果"
                className="result-image"
              />
              <svg className="annotation-overlay" viewBox={`0 0 ${detectionResult.image_width} ${detectionResult.image_height}`}>
                {detectionResult.detections.map((detection, index) => (
                  <g key={index}>
                    {/* 边界框 */}
                    <rect
                      x={detection.bbox[0]}
                      y={detection.bbox[1]}
                      width={detection.bbox[2]}
                      height={detection.bbox[3]}
                      fill="none"
                      stroke={getColorForLabel(detection.label)}
                      strokeWidth="3"
                      className="detection-box"
                    />
                    {/* 标签背景 */}
                    <rect
                      x={detection.bbox[0]}
                      y={detection.bbox[1] - 25}
                      width={detection.label.length * 8 + 20}
                      height="25"
                      fill={getColorForLabel(detection.label)}
                      className="label-background"
                    />
                    {/* 标签文字 */}
                    <text
                      x={detection.bbox[0] + 5}
                      y={detection.bbox[1] - 8}
                      fill="white"
                      fontSize="14"
                      fontFamily="Arial, sans-serif"
                      className="label-text"
                    >
                      {detection.label} ({(detection.confidence * 100).toFixed(1)}%)
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* 检测详情 */}
          <div className="detection-details">
            <h4>检测详情</h4>
            <div className="detections-list">
              {detectionResult.detections.map((detection, index) => (
                <div key={index} className="detection-item">
                  <div
                    className="detection-color"
                    style={{ backgroundColor: getColorForLabel(detection.label) }}
                  ></div>
                  <div className="detection-info">
                    <span className="detection-label">{detection.label}</span>
                    <span className="detection-confidence">
                      置信度: {(detection.confidence * 100).toFixed(1)}%
                    </span>
                    <span className="detection-bbox">
                      位置: ({detection.bbox[0]}, {detection.bbox[1]})
                      大小: {detection.bbox[2]}×{detection.bbox[3]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 为不同标签生成颜色
const getColorForLabel = (label) => {
  const colors = {
    'person': '#FF6B6B',
    'car': '#4ECDC4',
    'dog': '#45B7D1',
    'cat': '#FFA07A',
    'bicycle': '#98D8C8',
    'motorbike': '#F7DC6F',
    'bus': '#BB8FCE',
    'truck': '#85C1E9'
  }

  return colors[label] || '#999999'
}

export default ImageDetection