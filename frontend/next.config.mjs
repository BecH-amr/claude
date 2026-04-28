import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // skipWaiting=false: a new SW must wait for the old one to release control
  // before activating. Pairs naturally with our "user refresh = new version"
  // flow and avoids serving mixed old-HTML / new-JS chunks across deploys.
  workboxOptions: {
    skipWaiting: false,
    clientsClaim: false,
    // Never cache the API surface — owner endpoints carry per-user data.
    // The default rules cache same-origin /api/* in a shared cache keyed by
    // URL only, which would leak one user's /api/queues/mine response to
    // the next person on a shared device.
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
        urlPattern: ({ url }) =>
          url.origin === self.location.origin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
    ],
  },
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
