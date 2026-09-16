/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@sih/shared-types'],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "/api/:path*",
      },
    ];
  },
};

export default nextConfig;
