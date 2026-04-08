"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 bg-white/80 backdrop-blur-sm rounded-2xl border border-red-100 shadow-sm">
          <AlertTriangle size={32} className="text-red-400 mb-3" />
          <p className="text-[14px] font-semibold text-slate-700 mb-1">
            {this.props.fallbackTitle || "Erreur d'affichage"}
          </p>
          <p className="text-[12px] text-slate-400 mb-4 text-center max-w-xs">
            {this.state.error?.message || "Le graphique n'a pas pu s'afficher correctement."}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
            Réessayer
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
