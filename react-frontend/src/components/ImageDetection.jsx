import { useState } from 'react'
import axios from 'axios'
import ImageAnnotation from './ImageAnnotation'
import './ImageDetection.css'

const ImageDetection = () => {
  const [selectedFile, setSelectedFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [detectionResult, setDetectionResult] = useState(null)
  const [error, setError] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [showAnnotation, setShowAnnotation] = useState(false)

  // 处理文件选择
  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSelectedFile(file)
      setDetectionResult(null)
      setError(null)
      setAnnotations([])
      setShowAnnotation(false)

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
      setAnnotations([])
      setShowAnnotation(false)

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

  // 进入标注模式
  const startAnnotation = () => {
    setShowAnnotation(true)
  }

  // 标注完成，开始检测
  const startDetection = async () => {
    if (!selectedFile) return

    setDetecting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      // 添加标注数据
      if (annotations.length > 0) {
        formData.append('annotations', JSON.stringify(annotations))
      }

      const response = await axios.post('/api/detect', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000 // 30秒超时
      })

      setDetectionResult(response.data)
      setShowAnnotation(false)
    } catch (err) {
      console.error('检测失败:', err)
      setError(err.response?.data?.detail || '检测失败，请重试')
    } finally {
      setDetecting(false)
    }
  }

  // 标注数据变化回调
  const handleAnnotationsChange = (newAnnotations) => {
    setAnnotations(newAnnotations)
  }

  // 清除结果
  const clearResults = () => {
    setSelectedFile(null)
    setPreview(null)
    setDetectionResult(null)
    setError(null)
    setAnnotations([])
    setShowAnnotation(false)
  }

  return (
    <div className="image-detection">
      {/* 如果正在标注，显示标注界面 */}
      {showAnnotation && preview ? (
        <div className="annotation-mode">
          <div className="annotation-header-bar">
            <h2>📍 标注目标点</h2>
            <div className="annotation-actions-top">
              <button
                onClick={startDetection}
                disabled={detecting}
                className="btn-start-detection"
              >
                {detecting ? '检测中...' : '✓ 完成标注，开始检测'}
              </button>
              <button
                onClick={() => setShowAnnotation(false)}
                className="btn-back"
                disabled={detecting}
              >
                ← 返回
              </button>
            </div>
          </div>
          <ImageAnnotation
            imageUrl={preview}
            onAnnotationsChange={handleAnnotationsChange}
            initialAnnotations={annotations}
          />
        </div>
      ) : (
        /* 正常上传和结果显示模式 */
        <>
          <div className="detection-header">
            <h2>🔍 图像目标检测</h2>
            <p className="detection-subtitle">上传图片，标注目标点，开始智能检测</p>
          </div>

          {/* 文件上传区域 */}
          {!detectionResult && (
            <>
              <div
                className={`upload-area ${selectedFile ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                {!preview ? (
                  <div className="upload-content">
                    <div className="upload-icon">📁</div>
                    <p className="upload-text">拖拽图片到此处或点击选择文件</p>
                    <p className="upload-hint">支持 JPG, PNG 格式</p>
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
                        <p>📄 {selectedFile.name}</p>
                        <p>📊 {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              {selectedFile && (
                <div className="action-buttons">
                  <button
                    onClick={startAnnotation}
                    className="btn-annotate"
                    disabled={detecting}
                  >
                    📍 标注目标点
                  </button>
                  <button
                    onClick={startDetection}
                    disabled={detecting}
                    className="btn-detect-direct"
                  >
                    {detecting ? '检测中...' : '⚡ 直接检测（无标注）'}
                  </button>
                  <button
                    onClick={clearResults}
                    className="btn-clear"
                    disabled={detecting}
                  >
                    🗑️ 清除
                  </button>
                </div>
              )}
            </>
          )}

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
              <div className="results-header">
                <h3>✨ 检测结果</h3>
                <button onClick={clearResults} className="btn-new-detection">
                  🔄 新检测
                </button>
              </div>
              <div className="results-summary">
                <div className="summary-item">
                  <span className="summary-icon">🎯</span>
                  <span className="summary-text">检测到 {detectionResult.detection_count} 个对象</span>
                </div>
                {annotations.length > 0 && (
                  <div className="summary-item">
                    <span className="summary-icon">📍</span>
                    <span className="summary-text">使用了 {annotations.length} 个标注点</span>
                  </div>
                )}
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
                <h4>📋 检测详情</h4>
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
        </>
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
