import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server (HMR websocket, _next assets) be reached through an
  // ngrok tunnel for testing the mobile share target on a real phone — ngrok
  // free URLs get a new random subdomain each restart, hence the wildcard.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app"],
};

export default nextConfig;
