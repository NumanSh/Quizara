import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any throw during render leaves the user staring at a blank white
 * page with nothing to report back — indistinguishable from the site being down.
 * Kept dependency-free and inline-styled so it still renders if the stylesheet or
 * an i18n provider is what failed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Quizara crashed during render:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "#080d14",
          color: "#eef2fb",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ color: "rgba(238,242,251,0.6)", maxWidth: "32rem", margin: 0 }}>
          Quizara could not start. Reloading usually fixes it — if it keeps
          happening, your browser may be blocking storage for this site.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: "0.5rem",
            padding: "0.7rem 1.4rem",
            borderRadius: "0.75rem",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            color: "#fff",
            background: "linear-gradient(135deg, #6366f1, #06b6d4)",
          }}
        >
          Reload
        </button>
        <code
          style={{
            marginTop: "1rem",
            fontSize: "0.75rem",
            color: "rgba(238,242,251,0.35)",
            wordBreak: "break-word",
            maxWidth: "32rem",
          }}
        >
          {error.message}
        </code>
      </div>
    );
  }
}
