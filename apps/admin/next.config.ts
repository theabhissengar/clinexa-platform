import type { NextConfig } from "next";

import { LEGACY_PATH_REDIRECTS } from "./src/lib/legacy-redirects";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return LEGACY_PATH_REDIRECTS.map(({ source, destination }) => ({
      source,
      destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
