import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  // Vide en local et pour l'APK Capacitor (servi à la racine) ; la CI le définit
  // (ex. '/mia') pour GitHub Pages, qui sert le site sous /<nom-du-dépôt>/.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
