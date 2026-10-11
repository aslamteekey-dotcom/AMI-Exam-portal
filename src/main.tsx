import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress unhandled preview / websocket rejection notices in preview iframe environment
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event.reason || '');
    if (
      reasonStr.includes('WebSocket') ||
      reasonStr.includes('ws://') ||
      reasonStr.includes('wss://') ||
      reasonStr.includes('vite') ||
      reasonStr.includes('failed to fetch')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msgStr = String(event.message || '');
    if (
      msgStr.includes('WebSocket') ||
      msgStr.includes('ws://') ||
      msgStr.includes('wss://') ||
      msgStr.includes('vite')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);

