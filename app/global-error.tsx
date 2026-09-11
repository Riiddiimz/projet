"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Col'inCall fatal UI error", error); }, [error]);
  return (
    <html lang="fr">
      <body style={{ margin: 0, minHeight: "100vh", background: "#050509", color: "#fafafa", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ maxWidth: 520, width: "100%", padding: 32, borderRadius: 28, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", textAlign: "center" }}>
            <div style={{ fontSize: 12, letterSpacing: ".2em", color: "#e879f9", fontWeight: 800 }}>COL'INCALL · RECOVERY</div>
            <h1 style={{ fontSize: 30, margin: "14px 0 10px" }}>L'expérience a rencontré un problème.</h1>
            <p style={{ color: "#a1a1aa", lineHeight: 1.6 }}>Recharge l'expérience pour reprendre la connexion.</p>
            <button onClick={() => reset()} style={{ marginTop: 18, padding: "12px 18px", border: 0, borderRadius: 14, background: "#e879f9", color: "#09090b", fontWeight: 800, cursor: "pointer" }}>Réessayer</button>
          </section>
        </main>
      </body>
    </html>
  );
}
