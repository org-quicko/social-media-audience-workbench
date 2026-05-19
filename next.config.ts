import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Static HTML export — required for Electron.
   * `next build` writes pre-rendered pages + assets to `out/`.
   * The Electron main process then serves `out/` via electron-serve.
   *
   * Implications:
   *   - No server-side rendering / API routes (this app has none, so no change)
   *   - `next start` is no longer meaningful; run the Electron app instead
   *   - `npm run dev` still works normally for browser-based development
   */
  output: 'export',

  /**
   * Append a trailing slash to every page path so that Next.js writes
   * `out/page/index.html` instead of `out/page.html`.
   * electron-serve expects this layout for sub-route navigation to work.
   */
  trailingSlash: true,

  /**
   * next/image's default loader is not compatible with static export.
   * This app uses plain <img> tags, but set this as a safeguard.
   */
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
