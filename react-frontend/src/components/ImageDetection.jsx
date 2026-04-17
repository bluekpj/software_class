import { useState, useEffect } from 'react'
import api from '../utils/api'
import ImageAnnotation from './ImageAnnotation'
import './ImageDetection.css'

const ImageDetection = () => {
  const [selectedFiles, setSelectedFiles] = useState([]) // 原始 FileList
  const [uploadedImages, setUploadedImages] = useState([]) // 后端返回的顺序命名文件
  const [currentIndex, setCurrentIndex] = useState(0)
  const [detecting, setDetecting] = useState(false)
  const [batchResults, setBatchResults] = useState({}) // filename -> result
  const [error, setError] = useState(null)
  const [annotationsMap, setAnnotationsMap] = useState({}) // filename -> annotations array
  const [showAnnotation, setShowAnnotation] = useState(false)
  const [showVisual, setShowVisual] = useState(true)
  const [serverImages, setServerImages] = useState([]) // images already on the server
  const [showServerPicker, setShowServerPicker] = useState(false)
  const [selectedServerImages, setSelectedServerImages] = useState({}) // filename -> item
  const [autoLoadAnnotations, setAutoLoadAnnotations] = useState(true) // 是否自动加载服务器已有标注
  // 结果查看相关
  const [showResults, setShowResults] = useState(false)
  const [resultsData, setResultsData] = useState(null)
  const [resultsImages, setResultsImages] = useState([]) // [{fileName, detections}]
  const [resultIndex, setResultIndex] = useState(0)
  const [hasDetected, setHasDetected] = useState(false)
  const [algoLoading, setAlgoLoading] = useState(null) // 'p2bnet' | 'pointobb' | null
  const [currentAlgo, setCurrentAlgo] = useState(null) // 'p2bnet' | 'pointobb' | null

  // 处理文件选择
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) {
      setSelectedFiles(files)
      setError(null)
      setBatchResults({})
      setAnnotationsMap({})
      setCurrentIndex(0)
      setAutoLoadAnnotations(true)
      setShowVisual(true)
    }
  }

  // 处理拖拽上传
  const handleDrop = (event) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length > 0) {
      setSelectedFiles(files)
      setError(null)
      setBatchResults({})
      setAnnotationsMap({})
      setCurrentIndex(0)
      setAutoLoadAnnotations(true)
      setShowVisual(true)
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
  }

  // 进入标注模式
  const startAnnotation = () => {
    if (uploadedImages.length === 0) return
    setShowAnnotation(true)
  }

  // 标注完成，开始检测
  const detectCurrent = async () => {
    const current = uploadedImages[currentIndex]
    if (!current) return
    setDetecting(true)
    setError(null)
    try {
      // 先保存当前标注（可选）
      const anns = annotationsMap[current.saved] || []
      await api.post('/api/annotations/save', { filename: current.saved, annotations: anns })
      // 不再调用检测，直接打开结果查看（仅显示图片）
      setHasDetected(true)
      await openResultsViewer()
    } catch (err) {
      // 即使保存失败也继续进入查看
      setHasDetected(true)
      await openResultsViewer()
    } finally {
      setDetecting(false)
      setShowAnnotation(false)
    }
  }

  const detectAll = async () => {
    if (uploadedImages.length === 0) return
    setDetecting(true)
    setError(null)
    try {
      // 先保存所有标注（可选）
      for (const img of uploadedImages) {
        const anns = annotationsMap[img.saved] || []
        await api.post('/api/annotations/save', { filename: img.saved, annotations: anns })
      }
      setHasDetected(true)
      // 不再调用检测，直接打开结果查看（仅显示图片）
      await openResultsViewer()
    } catch (err) {
      setHasDetected(true)
      await openResultsViewer()
    } finally {
      setDetecting(false)
      setShowAnnotation(false)
    }
  }

  // 标注数据变化回调
  const handleAnnotationsChange = (newAnnotations) => {
    const current = uploadedImages[currentIndex]
    if (!current) return
    setAnnotationsMap(prev => ({ ...prev, [current.saved]: newAnnotations }))
  }

  // 清除结果
  const clearResults = () => {
    setSelectedFiles([])
    setUploadedImages([])
    setBatchResults({})
    setAnnotationsMap({})
    setError(null)
    setShowAnnotation(false)
    setCurrentIndex(0)
    setAutoLoadAnnotations(true)
    setShowVisual(true)
  }

  const uploadSelected = async () => {
    if (selectedFiles.length === 0) return
    const formData = new FormData()
    selectedFiles.forEach(f => formData.append('files', f))
    try {
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUploadedImages(res.data.files || [])
      setShowAnnotation(true)
      setAutoLoadAnnotations(true)
      setShowVisual(true)
    } catch (err) {
      setError(err.response?.data?.detail || '上传失败')
    }
  }

  // 拉取服务器现有图片供选择
  const fetchServerImages = async () => {
    setError(null)
    setShowServerPicker(true)
    try {
      const res = await api.get('/api/images/list')
      const listRaw = res?.data?.images || []
      setServerImages(listRaw)
      setSelectedServerImages({})
    } catch (e) {
      setError(e?.response?.data?.detail || '获取服务器图片失败')
    }
  }

  const toggleServerImage = (item) => {
    setSelectedServerImages(prev => {
      const next = { ...prev }
      if (next[item.filename]) {
        delete next[item.filename]
      } else {
        next[item.filename] = item
      }
      return next
    })
  }

  const useSelectedServerImages = () => {
    const chosen = Object.values(selectedServerImages)
    if (!chosen.length) {
      setError('请选择至少一张服务器图片')
      return
    }
    const mapped = chosen.map(it => ({
      saved: it.filename,
      original: it.filename,
      url: `${backendBase}${it.url}`
    }))
    setUploadedImages(mapped)
    setSelectedFiles([])
    setBatchResults({})
    setAnnotationsMap({})
    setShowAnnotation(true)
    setShowVisual(false) // 默认直接显示原图
    setCurrentIndex(0)
    setHasDetected(false)
    setShowServerPicker(false)
    setAutoLoadAnnotations(false) // 不加载服务器已有标注，留给用户自行标注
  }

  const currentImage = uploadedImages[currentIndex]
  const currentAnnotations = currentImage ? (annotationsMap[currentImage.saved] || []) : []
  const currentResult = currentImage ? batchResults[currentImage.saved] : null

  const nextImage = async () => {
    if (currentIndex < uploadedImages.length - 1) {
      const current = uploadedImages[currentIndex]
      try {
        setDetecting(true)
        const anns = annotationsMap[current.saved] || []
        await api.post('/api/annotations/save', { filename: current.saved, annotations: anns })
      } catch (e) {
        // 失败也继续切换，但可提示错误
        setError(e?.response?.data?.detail || '自动保存失败，但已切换下一张')
      } finally {
        setDetecting(false)
      }
      setCurrentIndex(i => i + 1)
      setShowAnnotation(true)
    }
  }

  const prevImage = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1)
      setShowAnnotation(true)
    }
  }

  // 切换图片时自动从后端加载已保存的标注
  useEffect(() => {
    if (!autoLoadAnnotations) return
    const current = uploadedImages[currentIndex]
    if (!current) return
    api.get('/api/annotations/get', { params: { filename: current.saved } })
      .then(res => {
        const anns = res.data?.annotations || []
        setAnnotationsMap(prev => ({ ...prev, [current.saved]: anns }))
      })
      .catch(() => {})
  }, [currentIndex, uploadedImages, autoLoadAnnotations])

  const toggleVisual = () => setShowVisual(v => !v)

  const backendBase = (api?.defaults?.baseURL || '').replace(/\/$/, '')

  const getVisualUrl = (result, savedName) => {
    if (result?.unique_visual_file) {
      const fname = result.unique_visual_file.split('/').pop()
      return `${backendBase}/uploads/visual/${fname}?t=${Date.now()}`
    }
    // 回退：按保存名猜测 jpg
    const stem = savedName.replace(/\.[^.]+$/, '')
    return `${backendBase}/uploads/visual/${stem}.jpg?t=${Date.now()}`
  }

  const getImageUrl = (savedName) => `${backendBase}/uploads/images/${savedName}?t=${Date.now()}`

  const buildFallbacks = (savedName) => {
    const stem = savedName.replace(/\.[^.]+$/, '')
    return [
      `${backendBase}/uploads/visual/${stem}.png`,
      `${backendBase}/uploads/visual/${stem}.bmp`,
      `${backendBase}/uploads/images/${savedName}`
    ]
  }

  const openResultsViewer = async () => {
    setError(null)
    setShowAnnotation(false)
    setShowResults(true)
    try {
      // 1) 优先列出可视化目录（uploads/visual）
      const visRes = await api.get('/api/visual/list')
      const visRaw = visRes?.data?.files || visRes?.data?.images || []
      let images = []
      if (Array.isArray(visRaw) && visRaw.length > 0) {
        images = visRaw.map(it => ({
          fileName: it.filename || it.name || it.fileName || '',
          url: `${backendBase}${it.url}?t=${Date.now()}`
        }))
      } else {
        // 2) 回退到原图目录（uploads/images）
        const imgRes = await api.get('/api/images/list')
        const listRaw = imgRes?.data?.images || []
        images = (listRaw || []).map(it => ({
          fileName: it.filename || it.name || it.fileName || '',
          url: `${backendBase}${it.url}?t=${Date.now()}`
        }))
      }
      setResultsImages(images)
      setResultIndex(0)
    } catch (e) {
      // 容错：不报错，展示空列表
      setResultsImages([])
      setResultIndex(0)
    }
  }

  const simulateAlgo = async (algo) => {
    const endpoint = algo === 'p2bnet' ? '/api/visual/p2bnet' : '/api/visual/pointobb'
    setAlgoLoading(algo)
    setError(null)
    try {
      await new Promise(res => setTimeout(res, 2000))
      const res = await api.get(endpoint)
      const files = res?.data?.files || res?.data?.images || []
      const mapped = files.map(it => ({
        fileName: it.filename || it.name || it.fileName || '',
        url: `${backendBase}${it.url}?t=${Date.now()}`
      }))
      setResultsImages(mapped)
      setResultIndex(0)
      setShowAnnotation(false)
      setShowResults(true)
      setHasDetected(true)
      setCurrentAlgo(algo)
    } catch (e) {
      setError(e?.response?.data?.detail || '模拟算法运行失败')
    } finally {
      setAlgoLoading(null)
    }
  }

  const handleDownloadJson = async () => {
    try {
      const url = `${backendBase}/uploads/COCO/pseudo_obb_result.json?t=${Date.now()}`
      const resp = await fetch(url, { cache: 'no-store' })
      if (!resp.ok) throw new Error('未找到 JSON 结果文件')
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([blob], { type: 'application/json' }))
      a.download = 'pseudo_obb_result.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (e) {
      setError(e.message || '下载 JSON 失败')
    }
  }

  const handleDownloadVisualZip = async () => {
    try {
      const zipPath = currentAlgo === 'p2bnet'
        ? '/api/visual/zip/p2bnet'
        : currentAlgo === 'pointobb'
          ? '/api/visual/zip/pointobb'
          : '/api/visual/zip'
      const url = `${backendBase}${zipPath}?t=${Date.now()}`
      const resp = await fetch(url, { cache: 'no-store' })
      if (!resp.ok) throw new Error('未找到可视化图片或打包失败')
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([blob], { type: 'application/zip' }))
      // 从响应头推断文件名
      const cd = resp.headers.get('content-disposition') || ''
      const match = cd.match(/filename=([^;]+)/)
      a.download = match ? match[1] : 'visual_images.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (e) {
      setError(e.message || '下载可视化图片失败')
    }
  }

  const parseResultsJson = (json) => {
    // 支持 COCO 风格 {images, annotations, categories} 或 扁平数组
    try {
      if (json && Array.isArray(json.annotations) && Array.isArray(json.images)) {
        const id2file = {}
        json.images.forEach(img => { id2file[img.id] = img.file_name || img.fileName })
        const id2cat = {}
        if (Array.isArray(json.categories)) json.categories.forEach(c => { id2cat[c.id] = c.name })
        const grouped = {}
        json.annotations.forEach(ann => {
          const file = id2file[ann.image_id]
          if (!file) return
          if (!grouped[file]) grouped[file] = []
          grouped[file].push({
            bbox: ann.bbox,
            segmentation: ann.segmentation,
            true_rbox: ann.true_rbox,
            label: id2cat[ann.category_id] || ann.category_name || 'obj',
            score: ann.score
          })
        })
        return Object.keys(grouped).map(file => ({ fileName: file, detections: grouped[file] }))
      }
      if (Array.isArray(json)) {
        const grouped = {}
        json.forEach(ann => {
          const file = ann.image_name || ann.file_name || ann.filename
          if (!file) return
          if (!grouped[file]) grouped[file] = []
          grouped[file].push({
            bbox: ann.bbox,
            segmentation: ann.segmentation,
            true_rbox: ann.true_rbox,
            label: ann.category_name || ann.label || 'obj',
            score: ann.score || ann.confidence
          })
        })
        return Object.keys(grouped).map(file => ({ fileName: file, detections: grouped[file] }))
      }
    } catch {}
    return []
  }

  return (
    <div className="image-detection">
      {/* 如果正在标注，显示标注界面 */}
      {showAnnotation && currentImage ? (
        <div className="annotation-mode">
          <div className="annotation-header-bar">
            <h2>📍 标注目标点 - {currentImage.saved}</h2>
            <div className="annotation-actions-top">
              <button onClick={prevImage} disabled={currentIndex===0 || detecting} className="btn-nav">← 上一张</button>
              <button onClick={nextImage} disabled={currentIndex===uploadedImages.length-1 || detecting} className="btn-nav">下一张 →</button>
              <button onClick={() => api.post('/api/annotations/save', { filename: currentImage.saved, annotations: currentAnnotations })} disabled={detecting} className="btn-save-anns">💾 保存标注</button>
              <button onClick={() => simulateAlgo('p2bnet')} disabled={!!algoLoading || detecting} className="btn-detect-all">
                {algoLoading === 'p2bnet' ? 'P2Bnet 运行中...' : '▶ 选择 P2Bnet'}
              </button>
              <button onClick={() => simulateAlgo('pointobb')} disabled={!!algoLoading || detecting} className="btn-detect-all">
                {algoLoading === 'pointobb' ? 'PointOBB 运行中...' : '▶ 选择 PointOBB'}
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
            imageUrl={showVisual ? getVisualUrl(currentResult, currentImage.saved) : getImageUrl(currentImage.saved)}
            fallbackUrls={showVisual ? buildFallbacks(currentImage.saved) : []}
            onAnnotationsChange={handleAnnotationsChange}
            initialAnnotations={currentAnnotations}
          />
          <div className="toggle-visual-bar">
            <button onClick={toggleVisual} className="btn-toggle-visual">
              {showVisual ? '显示原图' : '显示检测图'}
            </button>
          </div>
        </div>
      ) : (
        /* 正常上传和结果显示模式 */
        <>
          {/* 结果查看模式 */}
          {showResults ? (
            <div className="detection-results">
              <div className="results-header">
                <h3>👀 结果查看（{resultsImages.length} 张）</h3>
                <div style={{display:'flex', gap:10}}>
                  <button className="btn-new-detection" onClick={() => simulateAlgo('p2bnet')} disabled={!!algoLoading}>
                    {algoLoading === 'p2bnet' ? 'P2Bnet 运行中...' : '显示 P2Bnet 结果'}
                  </button>
                  <button className="btn-new-detection" onClick={() => simulateAlgo('pointobb')} disabled={!!algoLoading}>
                    {algoLoading === 'pointobb' ? 'PointOBB 运行中...' : '显示 PointOBB 结果'}
                  </button>
                  <button className="btn-new-detection" onClick={handleDownloadJson}>📄 下载JSON</button>
                  <button className="btn-new-detection" onClick={handleDownloadVisualZip} disabled={resultsImages.length===0}>🗜️ 下载可视化图片.zip</button>
                  <button className="btn-new-detection" onClick={() => setShowResults(false)}>返回</button>
                </div>
              </div>
              {resultsImages.length > 0 ? (
                <div className="annotation-mode">
                  <div className="annotation-header-bar">
                    <h2>📄 {resultsImages[resultIndex].fileName}</h2>
                    <div className="annotation-actions-top">
                      <button onClick={() => setResultIndex(i=>Math.max(0,i-1))} disabled={resultIndex===0} className="btn-nav">← 上一张</button>
                      <button onClick={() => setResultIndex(i=>Math.min(resultsImages.length-1,i+1))} disabled={resultIndex===resultsImages.length-1} className="btn-nav">下一张 →</button>
                    </div>
                  </div>
                  <div className="results-image-wrap" style={{display:'flex',justifyContent:'center'}}>
                    <img
                      src={resultsImages[resultIndex].url || getVisualUrl({}, resultsImages[resultIndex].fileName)}
                      alt={resultsImages[resultIndex].fileName}
                      style={{maxWidth:'100%', height:'auto', borderRadius:8}}
                    />
                  </div>
                </div>
              ) : (
                <div className="error-message"><p>未找到可显示的图片，请确认 uploads/visual 或 uploads/images 目录中已有文件。</p></div>
              )}
            </div>
          ) : null}
          {/* 文件上传区域 */}
          {uploadedImages.length === 0 && !showResults && (
            <>
              <div
                className={`upload-area ${selectedFiles.length > 0 ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                {selectedFiles.length === 0 ? (
                  <div className="upload-content">
                    <div className="upload-icon">📁</div>
                    <p className="upload-text">拖拽或选择多张图片（可批量）</p>
                    <p className="upload-hint">支持 JPG, PNG 格式</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      multiple
                      className="file-input"
                    />
                  </div>
                ) : (
                  <div className="preview-container">
                    <ul className="file-list">
                      {selectedFiles.map(f => (
                        <li key={f.name}>{f.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 使用服务器已有图片（弹窗选择） */}
              <div className="server-picker">
                <button className="btn-upload-batch" onClick={fetchServerImages}>📂 使用服务器图片</button>
              </div>

              {showServerPicker && (
                <div className="server-modal">
                  <div className="server-modal-backdrop" onClick={() => setShowServerPicker(false)}></div>
                  <div className="server-modal-content">
                    <div className="server-modal-header">
                      <div>
                        <h4>服务器图片（uploads/images）</h4>
                        <p className="server-meta-text">共 {serverImages.length} 张，勾选后与上传图片等价使用</p>
                      </div>
                      <div className="server-modal-actions">
                        <button className="btn-detect-all" onClick={useSelectedServerImages}>✅ 使用所选</button>
                        <button className="btn-clear" onClick={() => setShowServerPicker(false)}>关闭</button>
                      </div>
                    </div>
                    <div className="server-modal-body">
                      {serverImages.length === 0 ? (
                        <p className="server-empty">未找到服务器图片，可先上传。</p>
                      ) : (
                        <div className="server-grid">
                          {serverImages.map(item => {
                            const checked = !!selectedServerImages[item.filename]
                            return (
                              <label key={item.filename} className={`server-item ${checked ? 'selected' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleServerImage(item)}
                                />
                                <img src={`${backendBase}${item.url}`} alt={item.filename} />
                                <div className="server-meta">
                                  <span>{item.filename}</span>
                                  {item.visual_exists && <span className="tag">有可视化</span>}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              {selectedFiles.length > 0 && (
                <div className="action-buttons">
                  <button onClick={uploadSelected} className="btn-upload-batch" disabled={detecting}>⬆️ 上传并顺序命名</button>
                  {hasDetected && (
                    <button onClick={openResultsViewer} className="btn-detect-all" disabled={detecting}>👀 查看检测结果</button>
                  )}
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
          {uploadedImages.length > 0 && !showAnnotation && !showResults && (
            <div className="detection-results">
              <div className="results-header">
                <h3>✨ 检测结果（已上传 {uploadedImages.length} 张）</h3>
                <button onClick={clearResults} className="btn-new-detection">
                  🔄 新检测
                </button>
              </div>
              <div className="results-gallery">
                {uploadedImages.map(img => {
                  const res = batchResults[img.saved]
                  return (
                    <div key={img.saved} className="gallery-item">
                      <div className="gallery-thumb">
                        <img
                          src={res?.unique_visual_file ? getVisualUrl(res, img.saved) : getImageUrl(img.saved)}
                          alt={img.saved}
                          onClick={() => { setCurrentIndex(uploadedImages.findIndex(i => i.saved === img.saved)); setShowAnnotation(true); }}
                        />
                      </div>
                      <div className="gallery-meta">
                        <span>{img.saved}</span>
                        {res && <span className="det-count">🎯 {res.detection_count}</span>}
                        <button onClick={() => { setCurrentIndex(uploadedImages.findIndex(i => i.saved === img.saved)); setShowAnnotation(true); }} className="btn-edit">标注/查看</button>
                        {hasDetected && (
                          <button onClick={openResultsViewer} className="btn-edit">👀 查看结果</button>
                        )}
                      </div>
                    </div>
                  )
                })}
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
