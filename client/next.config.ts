import type { NextConfig } from "next";
import path from "path";

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  /* config options here */
  ...(isVercel
    ? {}
    : {
        turbopack: {
          root: path.resolve(typeof __dirname !== "undefined" ? __dirname : "."),
        },
      }),

  allowedDevOrigins: ["192.168.0.181", "192.168.0.181:3000"],
};
export default nextConfig;
