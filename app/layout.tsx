import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Col'inCall",
  description: "Parle. Rencontre. Passe un bon moment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
