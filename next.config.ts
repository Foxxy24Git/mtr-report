import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next.js standalone hanya menyajikan file yang ada di public/ saat build
  // time — file hasil upload runtime (logo/foto/ttd, ditulis ke volume bind
  // mount) tidak pernah "terlihat" oleh static file server-nya dan selalu
  // 404. Rewrite ke route API yang baca file dari disk langsung tiap request.
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: "/api/uploads/:path*" }];
  },
};

export default nextConfig;
