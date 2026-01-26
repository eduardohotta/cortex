import React from 'react';
import ReactDOM from 'react-dom/client';
import DashboardApp from './DashboardApp';
import '../../styles/design-tokens.css';
import '../../styles/main.css';


window.onerror = function (msg, url, line) {
    console.error('Global Error', msg, url, line);
    // document.body.innerHTML = `<div style="color:red; p:20px">Error: ${msg}</div>`;
};

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-10 text-red-500 bg-black h-screen overflow-auto">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
                    <pre className="bg-red-900/20 p-4 rounded text-xs font-mono whitespace-pre-wrap">
                        {this.state.error && this.state.error.toString()}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}

try {
    console.log('Mounting Dashboard...');
    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <ErrorBoundary>
                <DashboardApp />
            </ErrorBoundary>
        </React.StrictMode>
    );
} catch (e) {
    console.error('Mount Error', e);
    document.body.innerHTML = `<div style="color:red">Mount Error: ${e.message}</div>`;
}
