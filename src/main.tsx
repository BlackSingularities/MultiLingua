import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import './styles/app.css';
import { App } from './App.tsx';
import { registerServiceWorker } from './platform/pwa.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
