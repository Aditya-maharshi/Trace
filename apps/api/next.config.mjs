/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@sih/shared-types'],
  allowedDevOrigins: process.env.BASE44_PUBLIC_HOST_SUFFIX
    ? ['3000-' + process.env.BASE44_PUBLIC_HOST_SUFFIX, '8000-' + process.env.BASE44_PUBLIC_HOST_SUFFIX]
    : [],
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
