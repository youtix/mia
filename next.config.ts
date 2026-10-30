import type { NextConfig } from 'next';
import { version } from './package.json';

const nextConfig: NextConfig = {
  output: 'export',
  // Vide en local et pour l'APK Capacitor (servi à la racine) ; la CI le définit
  // (ex. '/mia') pour GitHub Pages, qui sert le site sous /<nom-du-dépôt>/.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  // Version affichée dans les Réglages (FEAT-20) : semantic-release met à jour `package.json` avant
  // le build de l'APK, et le déploiement de la PWA part du tag de release.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
