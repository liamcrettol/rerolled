"use client";

import { useEffect } from "react";

// Last-resort boundary: catches throws in the root layout itself, where the
// normal error.tsx boundary (which renders *inside* the layout) cannot help.
// It replaces the whole document, so it must ship its own html/body and cannot
// rely on globals.css having loaded. Styles are inline on purpose.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          backgroundColor: "#101216",
          color: "#e5e7eb",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#9aa1a9",
            margin: 0,
          }}
        >
          Something broke
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f87171", margin: 0 }}>
          Rerolled failed to start
        </h1>
        <p style={{ color: "#9ca3af", maxWidth: "28rem", margin: 0 }}>
          The app hit an error it could not recover from. Reloading usually fixes it.
        </p>
        {error.digest && (
          <p style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace", margin: 0 }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            backgroundColor: "#00aeef",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "0.75rem 1.25rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
