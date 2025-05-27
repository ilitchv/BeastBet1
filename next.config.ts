import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Removed rewrites to simplify, as page.tsx is still active.
  // async rewrites() {
  //   return [
  //     {
  //       source: '/',
  //       destination: '/index.html',
  //     },
  //   ];
  // },
};

export default nextConfig;
