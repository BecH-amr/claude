import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Override next-pwa's default runtime caching: never cache /api/* responses.
  // The default rules cache same-origin /api/* in a shared `apis` cache keyed
  // by URL only, which would leak one user's /api/queues/mine response to the
  // next person on a shared device and serve stale owner data after a 401.
  runtimeCaching: [
    {
      urlPattern: /\.(?:png|jpe?g|svg|gif|webp|ico|woff2?)$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "static-assets" },
    },
    {
      urlPattern: /\/_next\/static\/.+/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "next-static" },
    },
    {
      urlPattern: ({ request, url }) =>
        request.mode === "navigate" && url.origin === self.location.origin,
      handler: "NetworkFirst",
      options: { cacheName: "documents", networkTimeoutSeconds: 5 },
    },
    {
      // Never cache the API surface — owner endpoints carry per-user data.
      urlPattern: ({ url }) =>
        url.origin === self.location.origin && url.pathname.startsWith("/api/"),
      handler: "NetworkOnly",
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default withPWA(nextConfig);
