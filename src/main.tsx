import React from 'react';
import ReactDOOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import './index.css';


ReactDOOM.createRoot(document.getElementById('root')!).render(
<React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
</React.StrictMode>
);


