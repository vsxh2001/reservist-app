import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error caught by boundary:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100%', height: '100%',
          display: 'grid', placeItems: 'center',
          background: 'var(--paper)', color: 'var(--ink)',
          padding: 32, textAlign: 'center',
        }}>
          <div style={{ maxWidth: 420 }}>
            <h2 style={{
              fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 400,
              letterSpacing: '-.01em', margin: '0 0 8px',
            }}>Something broke</h2>
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBlockEnd: 18 }}>
              {this.state.error.message || 'Unknown error.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={this.reset} style={{
                appearance: 'none', font: 'inherit', fontSize: 13.5, fontWeight: 500,
                padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--card)',
                border: '1px solid var(--accent-deep)',
              }}>Try again</button>
              <button onClick={() => window.location.reload()} style={{
                appearance: 'none', font: 'inherit', fontSize: 13.5, fontWeight: 500,
                padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', color: 'var(--ink-2)',
                border: '1px solid var(--line-strong)',
              }}>Reload app</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
