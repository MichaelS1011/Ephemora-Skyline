import ReactDOM from 'react-dom/client';
import App from './App';
import './design/globals.css';

// Boot diagnostics — surfaces module/runtime errors on the page itself
window.addEventListener('error', (e) => {
  const el = document.createElement('pre');
  el.id = 'boot-error';
  el.style.cssText = 'color:#ff6688;font:11px monospace;padding:12px;white-space:pre-wrap;z-index:9999;position:relative';
  const stack = (e as ErrorEvent).error?.stack ? '\n' + String((e as ErrorEvent).error.stack).slice(0, 1200) : '';
  el.textContent = 'BOOT ERROR: ' + e.message + '\n' + (e.filename ?? '') + ':' + (e.lineno ?? '') + stack;
  document.body.appendChild(el);
});
window.addEventListener('unhandledrejection', (e) => {
  const el = document.createElement('pre');
  el.id = 'boot-error';
  el.style.cssText = 'color:#ff6688;font:11px monospace;padding:12px;white-space:pre-wrap;z-index:9999;position:relative';
  el.textContent = 'REJECTION: ' + String((e.reason as Error)?.stack || e.reason);
  document.body.appendChild(el);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  // No StrictMode: its double-mount leaves a frozen duplicate <canvas> in
  // dev (react-three-fiber v8), which blocks the live scene underneath.
  <App />,
);
