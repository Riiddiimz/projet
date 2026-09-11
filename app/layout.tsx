import type { Metadata } from "next";
import "./globals.css";
import "./galaxy.css";
import PwaRegister from "./PwaRegister";
import PwaInstall from "./PwaInstall";

export const metadata: Metadata = {
  title: "Col'inCall — Parle. Rencontre. Passe un bon moment.",
  description: "Col'inCall, une expérience sociale audio et vidéo moderne.",
  manifest: "/manifest.webmanifest",
  themeColor: "#07070f",
  icons: { icon: "/logogcol.png", shortcut: "/logogcol.png", apple: "/logogcol.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <PwaRegister />
        <PwaInstall />
        {children}
      </body>
    </html>
  );
}
