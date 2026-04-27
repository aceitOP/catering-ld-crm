import React from 'react';
import { captureFrontendException } from '../sentry';

function resetLocalAppState() {
  try {
    window.localStorage.removeItem('token');
    window.localStorage.removeItem('theme');
    window.localStorage.removeItem('dashboard-widget-order');
  } catch {
    // ignore storage access issues
  }

  window.location.href = '/login';
}

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AppErrorBoundary caught a render error:', error, errorInfo);
    captureFrontendException(error, {
      componentStack: errorInfo?.componentStack || null,
      boundary: 'AppErrorBoundary',
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-stone-200 rounded-3xl shadow-card p-7 text-center">
            <div className="text-lg font-bold text-stone-900">Aplikaci se nepodarilo nacist</div>
            <p className="text-sm text-stone-500 mt-2">
              Zkuste obnovit stranku. Pokud problem pretrvava, muzete resetovat lokalni data
              prohlizece pro tuto aplikaci a prihlasit se znovu.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Obnovit stranku
              </button>
              <button
                type="button"
                onClick={resetLocalAppState}
                className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
              >
                Resetovat lokalni data
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
