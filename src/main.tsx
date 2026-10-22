import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { markFirestoreQuotaExhausted } from './services/firebase';

// Suppress unhandled preview / websocket rejection notices and Firestore quota exhaustion in preview iframe environment
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event.reason || '');
    if (
      reasonStr.includes('resource-exhausted') ||
      reasonStr.includes('Quota exceeded') ||
      reasonStr.includes('overloading the backend')
    ) {
      markFirestoreQuotaExhausted();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
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
      msgStr.includes('resource-exhausted') ||
      msgStr.includes('Quota exceeded') ||
      msgStr.includes('overloading the backend')
    ) {
      markFirestoreQuotaExhausted();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
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

