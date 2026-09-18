self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Dev-only: when this app is reached through an ngrok tunnel (for mobile PWA
// testing), ngrok's free-tier browser-warning interstitial intercepts
// sub-resource fetches — like the manifest link — unless the request carries
// this header. Chrome's built-in manifest fetch doesn't let us attach custom
// headers, so the service worker does it instead. No-ops on any other host.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!/\.ngrok-free\.(app|dev)$/.test(url.hostname)) return;

  const headers = new Headers(event.request.headers);
  headers.set("ngrok-skip-browser-warning", "true");
  event.respondWith(fetch(new Request(event.request, { headers })));
});
