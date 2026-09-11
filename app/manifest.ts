import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Col'inCall",
    short_name: 'ColinCall',
    description: 'Parle. Rencontre. Passe un bon moment.',
    start_url: '/',
    display: 'standalone',
    background_color: '#050509',
    theme_color: '#d946ef',
    orientation: 'portrait-primary',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
