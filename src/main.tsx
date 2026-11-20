import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({ immediate: true });
  } catch {
    // Graceful fallback on browsers where service workers are blocked
  }
}

createRoot(document.getElementById('root')!).render(<App />);
