"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#0B0D0F", color: "#fff", fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#A0A6AD", fontSize: 14 }}>Your data is safe. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 16, background: "#B7F34A", color: "#0B0D0F", border: 0, borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
