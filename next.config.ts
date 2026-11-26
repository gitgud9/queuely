import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Old per-booth staff links and the demo page now live in the Staff Portal.
      { source: "/staff/:booth", destination: "/staff?booth=:booth", permanent: false },
      { source: "/demo/:booth", destination: "/staff?booth=:booth", permanent: false },
    ];
  },
};

export default nextConfig;
