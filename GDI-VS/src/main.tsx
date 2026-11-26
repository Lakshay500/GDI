import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LocaleProvider } from './i18n';
import './styles.css';

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean; message: string }> {
  state = { hasError: false, message: '' };
  static getDerivedStateFromError(error: Error) { return { hasError: true, message: error?.message || 'An unexpected interface error occurred.' }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('GDI-VS page rendering failure', error, info.componentStack); }
  render() {
    if (this.state.hasError) return <main style={{maxWidth:720,margin:'10vh auto',padding:24,fontFamily:'system-ui'}} role="alert">
      <p style={{letterSpacing:2,fontSize:12,fontWeight:700}}>GDI-VS · RECOVERABLE INTERFACE ERROR</p>
      <h1>This page could not be displayed.</h1>
      <p>The application encountered an unexpected rendering error. Your saved records have not been changed by this screen.</p>
      <p style={{color:'#8b2635',overflowWrap:'anywhere'}}>{this.state.message}</p>
      <button onClick={() => this.setState({hasError:false,message:''})}>Try this page again</button>{' '}
      <button onClick={() => { window.location.href = '/' }}>Return to workspace</button>
    </main>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AppErrorBoundary><LocaleProvider><App /></LocaleProvider></AppErrorBoundary></React.StrictMode>,
);
