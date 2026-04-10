import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from './theme/theme'
import './index.css'

initTheme()
import './styles/app.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
