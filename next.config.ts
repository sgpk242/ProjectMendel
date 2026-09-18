import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server (HMR websocket, _next assets) be reached through a
  // tunnel for testing the mobile share target on a real phone — free tiers
  // hand out a new random subdomain each run, hence the wildcards.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.trycloudflare.com"],
};

export default nextConfig;
