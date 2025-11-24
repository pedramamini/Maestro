import React from 'react';
import ReactDOM from 'react-dom/client';
import MaestroConsole from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MaestroConsole />
    </ErrorBoundary>
  </React.StrictMode>
);
