import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('앱 표시 영역을 찾지 못했어요.');
createRoot(root).render(<StrictMode><App /></StrictMode>);
