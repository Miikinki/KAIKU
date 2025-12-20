
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  // Explicitly declare props to avoid TS errors in some environments
  public props: Props;

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("KAIKU SYSTEM FAILURE:", error, errorInfo);
  }

  private handleReset = () => {
    try {
        localStorage.clear();
        sessionStorage.clear();
        // Attempt to clear specific Supabase or app cookies/tokens if possible
        document.cookie.split(";").forEach((c) => {
            document.cookie = c
                .replace(/^ +/, "")
                .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    } catch(e) {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-6 bg-[#0a0a12] text-white border border-red-500/30 rounded-lg m-2 relative overflow-hidden">
          {/* Background Glitch Effect */}
          <div className="absolute inset-0 bg-red-900/5 pointer-events-none" />
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
          
          <div className="z-10 flex flex-col items-center max-w-md w-full">
            <div className="p-4 bg-red-950/50 rounded-full border border-red-500/50 mb-6 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                <ShieldAlert size={48} className="text-red-500 animate-pulse" />
            </div>
            
            <h2 className="text-xl font-black tracking-widest text-red-500 mb-1 uppercase">
                CRITICAL FAILURE
            </h2>
            <p className="text-[10px] font-mono text-red-400 mb-6 uppercase tracking-wider">
                MODULE: {this.props.fallbackTitle || 'UNKNOWN'}
            </p>
            
            <div className="w-full bg-black/50 p-4 rounded border border-red-900/50 mb-6 font-mono text-[10px] text-red-300 overflow-auto max-h-32">
                <span className="opacity-50 select-none">{'> '}</span>
                {this.state.error?.message || "Unknown Error"}
            </div>

            <button
                onClick={this.handleReset}
                className="group relative w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black tracking-[0.2em] uppercase rounded-lg overflow-hidden transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)]"
            >
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                <div className="relative flex items-center justify-center gap-3">
                    <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-700" />
                    <span>SYSTEM RESET</span>
                </div>
            </button>
            
            <p className="mt-4 text-[9px] text-gray-600 font-mono text-center">
                This action will clear local cache and reload the interface.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
