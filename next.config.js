/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['googleapis'] },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}
module.exports = nextConfig
