export const metadata = {
  title: "Confidentialité — Col'inCall",
  description: "Informations de confidentialité de Col'inCall.",
};

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", padding: "48px 20px", background: "#050509", color: "#fafafa", fontFamily: "system-ui, sans-serif" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", lineHeight: 1.7 }}>
        <a href="/" style={{ color: "#e879f9", textDecoration: "none" }}>← Retour à Col'inCall</a>
        <h1 style={{ fontSize: 40, marginBottom: 8 }}>Confidentialité</h1>
        <p style={{ color: "#a1a1aa" }}>Version de lancement · septembre 2026</p>
        <h2>Données utilisées</h2>
        <p>Col'inCall utilise les informations nécessaires au fonctionnement de l'expérience : nom d'utilisateur, profil, description, état de présence et informations techniques liées à la session.</p>
        <h2>Audio et vidéo</h2>
        <p>Lorsque vous rejoignez un salon, votre navigateur demande l'accès au microphone et à la caméra. Les flux média sont établis entre participants via WebRTC. Vous pouvez refuser ces permissions ou couper le microphone et la caméra.</p>
        <h2>Messages</h2>
        <p>Les messages sont transmis au service temps réel pour être distribués aux participants connectés. L'architecture actuelle ne met pas en place de stockage permanent des conversations.</p>
        <h2>Session</h2>
        <p>Une session de connexion est conservée dans le stockage local du navigateur afin de permettre une reconnexion. Vous pouvez supprimer cette session en vous déconnectant.</p>
        <h2>Contact</h2>
        <p>Pour toute question relative à la confidentialité ou à la sécurité, utilisez les mécanismes de contact et de signalement disponibles sur le dépôt GitHub du projet.</p>
        <p style={{ marginTop: 36, color: "#71717a", fontSize: 13 }}>Cette page décrit le fonctionnement technique actuel et ne constitue pas un avis juridique.</p>
      </article>
    </main>
  );
}
