import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the app root to web/. A lockfile in the user home directory can make
  // Turbopack resolve PostCSS/Tailwind from the wrong tree, so /jobs ships
  // without generated utility CSS.
  turbopack: {
    root: webRoot,
  },
};

export default nextConfig;
