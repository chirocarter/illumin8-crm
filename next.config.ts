import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@libsql/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // document uploads (files are capped at 8 MB in the action)
    },
  },
};

export default nextConfig;
