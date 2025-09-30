import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [items, setItems] = useState([])

  // 获取根路径的消息
  const fetchMessage = async () => {
    try {
      // 注意：这里我们直接请求后端的根路径，代理只配置了 '/api'，所以这个请求不会被代理，会跨域。
      // 为了演示，我们通常只通过代理请求API接口。这个请求仅用于演示跨域问题。
      // const response = await axios.get('http://localhost:8000/') 
      // 更好的做法：在后端也为这个路由添加 '/api' 前缀，或者配置多个代理规则。

      // 我们使用代理后的地址（相对路径），Vite会帮我们处理
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
      <h1>React + Vite + FastAPI App</h1>
      <div>
        <h2>Items from Backend:</h2>
        <ul>
          {items.map(item => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default App
