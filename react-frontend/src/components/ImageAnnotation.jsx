import { useState, useRef, useEffect } from 'react'
import './ImageAnnotation.css'

const ImageAnnotation = ({ imageUrl, onAnnotationsChange, initialAnnotations = [], fallbackUrls = [], detectionOverlays = [] }) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [annotations, setAnnotations] = useState(initialAnnotations)
  const [selectedPointIndex, setSelectedPointIndex] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [currentCategory, setCurrentCategory] = useState('ship')
  const [showCategoryPopup, setShowCategoryPopup] = useState(true)

  // 加载图片并初始化画布
  useEffect(() => {
    const tryUrls = [imageUrl, ...fallbackUrls].filter(Boolean)
    if (tryUrls.length === 0) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    let idx = 0
    const tryLoad = () => {
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height })
        resizeCanvas(img.width, img.height)
      }
      img.onerror = () => {
        if (idx < tryUrls.length - 1) {
          idx += 1
          img.src = tryUrls[idx]
        }
      }
      img.src = tryUrls[idx]
    }
    tryLoad()
  }, [imageUrl, fallbackUrls])

  // 当图片切换或初始标注变更时，重置标注状态，避免沿用上一张图片的点
  useEffect(() => {
    setAnnotations(Array.isArray(initialAnnotations) ? initialAnnotations : [])
    setSelectedPointIndex(null)
    setIsDragging(false)
  }, [imageUrl, initialAnnotations])

  // 调整画布大小以适应容器
  const resizeCanvas = (imgWidth, imgHeight) => {
    if (!containerRef.current) return

    const container = containerRef.current
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    const scaleX = containerWidth / imgWidth
    const scaleY = containerHeight / imgHeight
    const newScale = Math.min(scaleX, scaleY, 1) // 不放大，只缩小

    const newWidth = imgWidth * newScale
    const newHeight = imgHeight * newScale

    setScale(newScale)
    setCanvasSize({ width: newWidth, height: newHeight })
    setOffset({
      x: (containerWidth - newWidth) / 2,
      y: (containerHeight - newHeight) / 2
    })
  }

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (imageSize.width > 0) {
        resizeCanvas(imageSize.width, imageSize.height)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [imageSize])

  // 绘制画布
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imageUrl) return

    const ctx = canvas.getContext('2d')
    const urls = [imageUrl, ...fallbackUrls].filter(Boolean)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let idx = 0
    const render = () => {
      // 清空画布
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // 绘制图片
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      // 绘制所有标注点
      annotations.forEach((point, index) => {
        drawPoint(ctx, point, index === selectedPointIndex)
      })
      // 绘制检测覆盖（矩形或多边形）
      if (Array.isArray(detectionOverlays) && detectionOverlays.length > 0) {
        detectionOverlays.forEach(det => {
          try {
            const label = det.label || det.category_name || 'obj'
            const score = det.score ?? det.confidence
            const text = score != null ? `${label} ${(score*100).toFixed(1)}%` : `${label}`
            ctx.lineWidth = 2
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)'
            ctx.fillStyle = 'rgba(255, 215, 0, 0.15)'

            if (det.segmentation && det.segmentation.length > 0) {
              const seg = det.segmentation[0]
              if (Array.isArray(seg) && seg.length >= 8) {
                ctx.beginPath()
                ctx.moveTo(seg[0]*scale, seg[1]*scale)
                for (let i=2; i<seg.length; i+=2) {
                  ctx.lineTo(seg[i]*scale, seg[i+1]*scale)
                }
                ctx.closePath()
                ctx.fill()
                ctx.stroke()
                // 文本标签
                const tx = Math.min(seg[0], seg[2], seg[4], seg[6]) * scale
                const ty = Math.min(seg[1], seg[3], seg[5], seg[7]) * scale
                drawDetLabel(ctx, text, tx, ty)
              }
            } else if (det.true_rbox && det.true_rbox.length >= 8) {
              const seg = det.true_rbox
              ctx.beginPath()
              ctx.moveTo(seg[0]*scale, seg[1]*scale)
              for (let i=2; i<8; i+=2) {
                ctx.lineTo(seg[i]*scale, seg[i+1]*scale)
              }
              ctx.closePath()
              ctx.fill()
              ctx.stroke()
              const tx = Math.min(seg[0], seg[2], seg[4], seg[6]) * scale
              const ty = Math.min(seg[1], seg[3], seg[5], seg[7]) * scale
              drawDetLabel(ctx, text, tx, ty)
            } else if (det.bbox && det.bbox.length >= 4) {
              const [x,y,w,h] = det.bbox
              ctx.strokeRect(x*scale, y*scale, w*scale, h*scale)
              ctx.fillRect(x*scale, y*scale, w*scale, h*scale)
              drawDetLabel(ctx, text, x*scale, y*scale)
            }
          } catch {}
        })
      }
    }
    const loadNext = () => {
      img.onload = render
      img.onerror = () => {
        if (idx < urls.length - 1) {
          idx += 1
          img.src = urls[idx]
        }
      }
      img.src = urls[idx]
    }
    loadNext()
  }, [imageUrl, fallbackUrls, annotations, selectedPointIndex, canvasSize, detectionOverlays, scale])

  const drawDetLabel = (ctx, text, x, y) => {
    ctx.save()
    ctx.font = '12px Arial'
    const padding = 4
    const textWidth = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(x, y-14, textWidth + padding*2, 14)
    ctx.fillStyle = '#fff'
    ctx.fillText(text, x + padding, y - 3)
    ctx.restore()
  }

  // 绘制单个标注点
  const drawPoint = (ctx, point, isSelected) => {
    const x = point.x * scale
    const y = point.y * scale

    // 绘制外圈
    ctx.beginPath()
    ctx.arc(x, y, 10, 0, 2 * Math.PI)
    ctx.fillStyle = isSelected ? 'rgba(255, 107, 107, 0.8)' : 'rgba(78, 205, 196, 0.8)'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    // 绘制中心点
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, 2 * Math.PI)
    ctx.fillStyle = '#fff'
    ctx.fill()

    // 绘制标签
    if (point.label) {
      ctx.font = '12px Arial'
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.strokeText(point.label, x + 15, y - 10)
      ctx.fillText(point.label, x + 15, y - 10)
    }
  }

  // 将屏幕坐标转换为图片坐标
  const screenToImageCoords = (clientX, clientY) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) / scale
    const y = (clientY - rect.top) / scale
    return { x, y }
  }

  // 查找点击的标注点
  const findPointAtPosition = (x, y) => {
    const threshold = 15 / scale // 点击阈值
    return annotations.findIndex(point => {
      const dx = point.x - x
      const dy = point.y - y
      return Math.sqrt(dx * dx + dy * dy) < threshold
    })
  }

  // 处理画布点击
  const handleCanvasClick = (e) => {
    if (isDragging) return

    const { x, y } = screenToImageCoords(e.clientX, e.clientY)
    const pointIndex = findPointAtPosition(x, y)

    if (pointIndex !== -1) {
      // 点击已存在的点，选中它
      setSelectedPointIndex(pointIndex)
    } else {
      // 点击空白处，添加新点
      const newPoint = {
        x: Math.round(x),
        y: Math.round(y),
        label: currentCategory,
        type: 'point'
      }
      const newAnnotations = [...annotations, newPoint]
      setAnnotations(newAnnotations)
      setSelectedPointIndex(newAnnotations.length - 1)
      onAnnotationsChange(newAnnotations)
    }
  }

  // 处理鼠标按下（拖拽开始）
  const handleMouseDown = (e) => {
    const { x, y } = screenToImageCoords(e.clientX, e.clientY)
    const pointIndex = findPointAtPosition(x, y)

    if (pointIndex !== -1) {
      setSelectedPointIndex(pointIndex)
      setIsDragging(true)
    }
  }

  // 处理鼠标移动（拖拽中）
  const handleMouseMove = (e) => {
    if (!isDragging || selectedPointIndex === null) return

    const { x, y } = screenToImageCoords(e.clientX, e.clientY)

    // 限制在图片范围内
    const clampedX = Math.max(0, Math.min(imageSize.width, Math.round(x)))
    const clampedY = Math.max(0, Math.min(imageSize.height, Math.round(y)))

    const newAnnotations = [...annotations]
    newAnnotations[selectedPointIndex] = {
      ...newAnnotations[selectedPointIndex],
      x: clampedX,
      y: clampedY
    }
    setAnnotations(newAnnotations)
    onAnnotationsChange(newAnnotations)
  }

  // 处理鼠标释放（拖拽结束）
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleChooseCategory = (cat) => {
    setCurrentCategory(cat)
    if (selectedPointIndex !== null) {
      const newAnnotations = [...annotations]
      newAnnotations[selectedPointIndex] = { ...newAnnotations[selectedPointIndex], label: cat }
      setAnnotations(newAnnotations)
      onAnnotationsChange(newAnnotations)
    }
  }

  // 删除选中的点
  const handleDeletePoint = () => {
    if (selectedPointIndex === null) return

    const newAnnotations = annotations.filter((_, index) => index !== selectedPointIndex)
    setAnnotations(newAnnotations)
    setSelectedPointIndex(null)
    onAnnotationsChange(newAnnotations)
  }

  // 清除所有标注
  const handleClearAll = () => {
    setAnnotations([])
    setSelectedPointIndex(null)
    onAnnotationsChange([])
  }

  // 修改标签名称
  const handleLabelChange = (index, newLabel) => {
    const newAnnotations = [...annotations]
    newAnnotations[index] = { ...newAnnotations[index], label: newLabel }
    setAnnotations(newAnnotations)
    onAnnotationsChange(newAnnotations)
  }

  return (
    <div className="annotation-container">
      <div className="annotation-canvas-area" ref={containerRef}>
        <div className="category-popup">
          <div className="category-header">
            <span>类别</span>
            <button className="category-toggle" onClick={() => setShowCategoryPopup(v=>!v)}>{showCategoryPopup ? '－' : '＋'}</button>
          </div>
          {showCategoryPopup && (
            <div className="category-body">
              {['ship','door','chair'].map(cat => (
                <button
                  key={cat}
                  className={`category-btn ${currentCategory===cat ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleChooseCategory(cat) }}
                  title={`选择 ${cat}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            cursor: isDragging ? 'grabbing' : 'crosshair'
          }}
        />
      </div>

      <div className="annotation-sidebar">
        <div className="annotation-header">
          <h3>标注点列表</h3>
          <span className="annotation-count">{annotations.length} 个点</span>
        </div>

        <div className="annotation-actions" style={{gap: 8}}>
          <button
            onClick={handleClearAll}
            className="btn-clear-all"
            disabled={annotations.length === 0}
          >
            🗑️ 清除全部
          </button>
          <button
            onClick={handleDeletePoint}
            className="btn-delete"
            disabled={selectedPointIndex === null}
          >
            ❌ 删除选中
          </button>
        </div>

        <div className="annotation-list">
          {annotations.length === 0 ? (
            <div className="empty-state">
              <p>📍 点击图片添加标注点</p>
              <p className="hint">拖拽标注点可调整位置</p>
            </div>
          ) : (
            annotations.map((point, index) => (
              <div
                key={index}
                className={`annotation-item ${index === selectedPointIndex ? 'selected' : ''}`}
                onClick={() => setSelectedPointIndex(index)}
              >
                <div className="annotation-item-header" style={{display:'flex', alignItems:'center', gap:8}}>
                  <span className="label-chip">{point.label}</span>
                </div>
                <div className="annotation-coords">
                  <span>X: {point.x}</span>
                  <span>Y: {point.y}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="annotation-help">
          <h4>💡 操作提示</h4>
          <ul>
            <li>点击图片添加标注点</li>
            <li>拖拽标注点调整位置</li>
            <li>点击列表项选中标注点</li>
            <li>双击标签可修改名称</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ImageAnnotation
