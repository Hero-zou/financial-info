import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme-provider'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('root 容器缺失')

createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
