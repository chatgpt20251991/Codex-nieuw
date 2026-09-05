/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the maintained server SDK's optional crypto imports native to Node.
  serverExternalPackages: ['@auth0/nextjs-auth0'],
  async rewrites() {
    return {
      beforeFiles: [{
        source: '/:path((?!_next/|favicon\\.ico$|internal-invalid-prefetch$).*)',
        // Next 15 hides Flight headers from middleware, then restores them
        // before these rules run. Validate their pairing before HTML rendering.
        has: [{ type: 'header', key: 'next-router-prefetch' }],
        missing: [{ type: 'header', key: 'rsc', value: '1' }],
        destination: '/internal-invalid-prefetch',
      }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
