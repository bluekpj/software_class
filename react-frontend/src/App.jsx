import { useState, useEffect } from 'react'
import axios from 'axios'
import ImageDetection from './components/ImageDetection'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [items, setItems] = useState([])
  const [activeTab, setActiveTab] = useState('detection')

  // 获取根路径的消息
  const fetchMessage = async () => {
    try {
      const response = await axios.get('/api/items')
      setItems(response.data)
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  useEffect(() => {
    fetchMessage()
  }, [])

  return (
    <div className="App">
      <header className="app-header">
        <h1>🔍 AI图像检测系统</h1>
        <nav className="app-nav">
          <button
            className={`nav-button ${activeTab === 'detection' ? 'active' : ''}`}
            onClick={() => setActiveTab('detection')}
          >
            图像检测
          </button>
          <button
            className={`nav-button ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            API测试
          </button>
        </nav>
      </header>

      <main className="app-main">
        {activeTab === 'detection' && <ImageDetection />}

        {activeTab === 'api' && (
          <div className="api-test">
            <h2>后端API测试</h2>
            <div>
              <h3>Items from Backend:</h3>
              <ul>
                {items.map(item => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
