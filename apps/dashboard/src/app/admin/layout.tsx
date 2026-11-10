import type { Metadata, Viewport } from "next";
import "../globals.css";

// Layout du back-office : Tailwind + metadata Dashboard. Le <html>/<body>
// reste dans le layout racine.
export const metadata: Metadata = {
  title: "ARBI JACOB — Dashboard",
  description: "Back-office de l'agent commercial WhatsApp",
};

// Barre d'état du téléphone assortie au fond noir, zones sûres (encoche, barre du bas) exploitables.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Empêche le zoom automatique (iPhone) quand on touche un champ de saisie : l'écran reste ajusté à l'appareil.
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Police du back-office (chargée par le navigateur ; repli sur la police système si indisponible). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700;1,800&display=swap"
      />
      {children}
    </>
  );
}
