import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/700.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/error-boundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
