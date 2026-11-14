import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The hosted site starts from a snapshot of real research (see lib/seed.ts).
  outputFileTracingIncludes: { "/api/**/*": ["./seed/**/*"] },
};

export default nextConfig;
