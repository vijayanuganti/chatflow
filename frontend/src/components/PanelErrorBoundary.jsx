import React from "react";
import { Button } from "@/components/ui/button";

/**
 * Catches render errors in panel screens (admin / chat) instead of a blank WebView.
 */
export default class PanelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[PanelErrorBoundary]", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = error?.message || String(error);

    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center dark:bg-gray-950"
        data-testid="panel-error-boundary"
      >
        <h1 className="font-display text-xl font-semibold text-gray-900 dark:text-gray-100">
          Something went wrong
        </h1>
        <p className="max-w-md text-sm text-gray-600 dark:text-gray-400">{message}</p>
        <Button
          type="button"
          className="rounded-full bg-emerald-900 hover:bg-emerald-950"
          onClick={() => {
            this.setState({ error: null });
            window.location.assign(this.props.fallbackPath || "/login");
          }}
        >
          Back to sign in
        </Button>
      </div>
    );
  }
}
