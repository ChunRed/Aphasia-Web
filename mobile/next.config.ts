import type { NextConfig } from "next";
import path from "path";

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  ...(isVercel
    ? {}
    : {
        turbopack: {
          root: path.resolve(typeof __dirname !== "undefined" ? __dirname : "."),
        },
      }),
};

export default nextConfig;
