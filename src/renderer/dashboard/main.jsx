import React from 'react';
import ReactDOM from 'react-dom/client';
import DashboardApp from './DashboardApp';
import '../../styles/design-tokens.css';
import '../../styles/main.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <DashboardApp />
    </React.StrictMode>
);
