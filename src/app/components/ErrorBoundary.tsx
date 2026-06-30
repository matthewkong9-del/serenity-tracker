"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="bg-red-400/5 border border-red-400/20 rounded-xl p-4">
            <p className="text-red-400 text-xs font-medium mb-1">
              Something went wrong
            </p>
            <p className="text-red-400/60 text-xs">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: "" })}
              className="text-accent text-xs mt-2 hover:underline"
            >
              Retry
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
