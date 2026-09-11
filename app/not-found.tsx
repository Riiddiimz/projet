export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#050509", color: "#fafafa", fontFamily: "system-ui, sans-serif" }}>
      <section style={{ maxWidth: 520, width: "100%", padding: 32, borderRadius: 28, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: ".2em", color: "#e879f9", fontWeight: 800 }}>COL'INCALL · 404</div>
        <h1 style={{ fontSize: 32, margin: "14px 0 10px" }}>Cette page n'existe pas.</h1>
        <p style={{ color: "#a1a1aa", lineHeight: 1.6 }}>Le lien est peut-être ancien ou la page a été déplacée.</p>
        <a href="/" style={{ display: "inline-block", marginTop: 18, padding: "12px 18px", borderRadius: 14, background: "#e879f9", color: "#09090b", fontWeight: 800, textDecoration: "none" }}>Retour à Col'inCall</a>
      </section>
    </main>
  );
}
