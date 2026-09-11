import type { Metadata } from "next";
import "./globals.css";
import AuthSelector from "./AuthSelector";
import ExperienceLayer from "./ExperienceLayer";
import ImmersiveFX from "./ImmersiveFX";
import SocialHUD from "./SocialHUD";
import LobbyDock from "./LobbyDock";

export const metadata: Metadata = {
  title: "Col'inCall — Parle. Rencontre. Passe un bon moment.",
  description: "Col'inCall, une expérience sociale audio et vidéo moderne.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <ExperienceLayer />
        <ImmersiveFX />
        <SocialHUD />
        <LobbyDock />
        {children}
        <AuthSelector />
      </body>
    </html>
  );
}
