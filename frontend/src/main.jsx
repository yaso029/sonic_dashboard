import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './AuthContext'
import { MessagesProvider } from './MessagesContext'
import { ThemeProvider } from './ThemeContext'
import App from './App.jsx'
import './index.css'

// Register the service worker so web-push notifications work for the installed PWA.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MessagesProvider>
            <App />
            <Toaster position="top-right" />
          </MessagesProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
