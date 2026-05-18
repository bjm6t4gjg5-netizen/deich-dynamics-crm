import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProvider } from './context/AppContext.jsx';
import { LangProvider } from './context/LangContext.jsx';
import { BRAND } from './brand.js';
import App from './App.jsx';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{padding:40,fontFamily:'system-ui',maxWidth:640,margin:'60px auto'}}>
        <div style={{background:'#fde8e8',border:'2px solid #dc2626',borderRadius:12,padding:28}}>
          <h2 style={{color:'#dc2626',marginBottom:12}}>⚠️ {BRAND.product} — Fehler beim Laden</h2>
          <p style={{fontSize:13,marginBottom:12}}>Stellen Sie sicher dass beide Server laufen:</p>
          <code style={{display:'block',background:'#1e293b',color:'#7ec8e3',padding:14,borderRadius:8,fontSize:12,marginBottom:16,lineHeight:1.8,whiteSpace:'pre'}}>
            {'cd server && npm install && node db/init.js && npm run dev\ncd client && npm install && npm run dev'}
          </code>
          <pre style={{background:'#fff',border:'1px solid #fca5a5',padding:12,borderRadius:8,fontSize:11,overflow:'auto',marginBottom:14,color:'#dc2626'}}>
            {this.state.error.message}
          </pre>
          <button onClick={()=>window.location.reload()}
            style={{padding:'8px 18px',background:'#dc2626',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'}}>
            Reload / Neu laden
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <AppProvider>
        <ErrorBoundary>
          <App/>
        </ErrorBoundary>
      </AppProvider>
    </LangProvider>
  </React.StrictMode>
);
