import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: path.resolve(__dirname || "."),
  },

  allowedDevOrigins: ["192.168.0.181", "192.168.0.181:3000"],

};
export default nextConfig;
