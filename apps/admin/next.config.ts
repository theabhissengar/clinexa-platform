import type { NextConfig } from "next";

import { LEGACY_PATH_REDIRECTS } from "./src/lib/legacy-redirects";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      ...LEGACY_PATH_REDIRECTS.map(({ source, destination }) => ({
        source,
        destination,
        permanent: true,
      })),
      // CRM user sections use ?section= (Turbopack nested [id]/[section] 404s)
      {
        source:
          "/crm/users/:id/:section(profile|medical|payments|addresses|documents)",
        destination: "/crm/users/:id?section=:section",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
