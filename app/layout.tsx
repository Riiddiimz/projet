import type { Metadata } from "next";
import "./globals.css";
import AuthSelector from "./AuthSelector";
import ExperienceLayer from "./ExperienceLayer";

export const metadata: Metadata = {
  title: "Col'inCall — Parle. Rencontre. Passe un bon moment.",
  description: "Col'inCall, une expérience sociale audio et vidéo moderne.",
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
        {children}
        <AuthSelector />
      </body>
    </html>
  );
}
