import React from 'react';
import { isChunkLoadError, reloadForNewVersion } from '../../../../utils/chunkReload';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    if (isChunkLoadError(error)) reloadForNewVersion(); // an older tab after a deploy: load the new version
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: '24px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '400px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            border: '1px solid #f1f5f9'
          }}>
            <div style={{
              width: '56px', height: '56px', background: '#FEF2F2',
              borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 16px'
            }}>
              <svg width="28" height="28" fill="none" stroke="#EF4444" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
              Something Went Wrong
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
              This page encountered an error. Please go back and try again.
            </p>
            {this.state.error && (
              <p style={{
                fontSize: '11px', color: '#ef4444', background: '#fef2f2',
                padding: '8px 12px', borderRadius: '8px', marginBottom: '16px',
                fontFamily: 'monospace', textAlign: 'left', wordBreak: 'break-all'
              }}>
                {this.state.error.toString()}
              </p>
            )}
            <button
              onClick={() => { this.setState({ hasError: false, error: null, errorInfo: null }); window.history.back(); }}
              style={{
                background: '#00a6a6', color: 'white', border: 'none', borderRadius: '12px',
                padding: '12px 24px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', width: '100%'
              }}
            >
              ← Go Back
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '12px',
                padding: '10px 24px', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
                width: '100%', marginTop: '8px'
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
