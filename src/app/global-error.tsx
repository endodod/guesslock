"use client";
// Last resort when even the root layout fails: its own document, inline styles only (globals.css doesn't load here).
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0e0d0b", color: "#e8dcc4", fontFamily: "Georgia, serif" }}>
        <title>GUESSLOCK — something went wrong</title>
        <main style={{ maxWidth: 440, padding: 32, textAlign: "center", border: "1px solid rgba(201,164,92,0.4)", borderRadius: 4 }}>
          <h1 style={{ color: "#c9a45c", fontWeight: 400, letterSpacing: 2 }}>GUESSLOCK</h1>
          <p>The Vault won&apos;t open right now. Your progress is safe in this browser.</p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#8a8175" }}>Reference {error.digest}</p>}
          <button type="button" onClick={() => retry()} style={{ marginTop: 12, minHeight: 44, padding: "0 20px", background: "transparent", color: "#7fe3c2", border: "1px solid #7fe3c2", borderRadius: 3, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
