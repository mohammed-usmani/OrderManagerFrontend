"use client";

import React from "react";

/**
 * Error boundary — React 19 still requires a class component for this (there is
 * no hook equivalent). Used to wrap the voice Canvas so a single malformed
 * ui_event payload can't blank the whole screen and strand the mic.
 */
interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Reset the boundary when this value changes (e.g. the canvas kind). */
  resetKey?: unknown;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[ErrorBoundary] render failed:", error);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant text-3xl">error</span>
            <p className="text-on-surface-variant text-sm">
              Couldn&rsquo;t display that — but you can keep talking.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
