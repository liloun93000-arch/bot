/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "argon2", "pino", "@arbi/core"],
  experimental: {
    serverActions: {
      // Next applique sa limite par défaut de 1 Mo au corps des Server Actions
      // AVANT que l'action ne s'exécute : un fichier valide plante alors en 500
      // au lieu d'afficher le message d'erreur métier. La plus grosse limite
      // métier est un envoi groupé (10 fichiers, 45 Mo cumulés au plus,
      // cf. OUTBOUND_MEDIA_MAX_BYTES dans packages/core/src/media.ts). Marge
      // au-delà de 45 Mo pour l'overhead multipart.
      bodySizeLimit: "50mb",
    },
  },
  // Le back-office a déménagé sous /admin (la racine est le site public).
  // Redirections permanentes des anciennes URLs — notamment le bouton
  // « Reprendre la conversation » du template d'alerte Meta, qui pointe vers
  // <dashboard_url>/conversations/<waId>.
  async redirects() {
    const legacy = [
      "/login",
      "/conversations",
      "/conversations/:path*",
      "/leads",
      "/questions",
      "/catalogue",
      "/facturation",
      "/reglages",
    ];
    // Anciennes pages de la vitrine → sections de la nouvelle page unique.
    const vitrine = [
      ["/apercu", "/"],
      ["/apercu/conditions", "/conditions"],
      ["/apercu/confidentialite", "/confidentialite"],
      ["/preview-v2", "/"],
      ["/preview-v2/:path*", "/:path*"],
      ["/creation-llc-ltd", "/societe"],
      ["/comptes-snapchat", "/snapchat"],
      ["/graphisme-digital", "/ghost-studio"],
      ["/qui-suis-je", "/a-propos"],
      ["/contact", "/#rdv"],
    ].map(([source, destination]) => ({ source, destination, permanent: false }));
    return [
      ...legacy.map((source) => ({
        source,
        destination: `/admin${source}`,
        permanent: true,
      })),
      ...vitrine,
    ];
  },
};

export default nextConfig;
