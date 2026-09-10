import type { Metadata } from "next";
import "./globals.css";
import AuthSelector from "./AuthSelector";

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
      <body>
        {children}
        <AuthSelector />
      </body>
    </html>
  );
}
