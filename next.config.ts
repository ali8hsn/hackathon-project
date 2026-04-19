import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin workspace root when another lockfile exists higher in the tree (e.g. $HOME/package-lock.json).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
