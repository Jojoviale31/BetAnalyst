import "./globals.css";

export const metadata = {
  title: "BetAnalytics",
  description: "Plateforme d'analyse sportive",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
