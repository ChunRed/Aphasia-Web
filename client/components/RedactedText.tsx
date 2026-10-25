"use client";

import React from "react";
import { motion } from "framer-motion";

interface RedactedTextProps {
  children: React.ReactNode;
  trigger?: boolean;
  delay?: number;
  duration?: number;
  className?: string;
}

export default function RedactedText({
  children,
  trigger = false,
  delay = 0,
  duration = 0.85,
  className = "",
}: RedactedTextProps) {
  return (
    <span className={`relative inline-block align-baseline m-0 p-0 select-none ${className}`}>
      {/* Underlying text - static layout, absolutely identical to natural text flow */}
      <span className="relative z-0 text-stone-600 m-0 p-0">
        {children}
      </span>

      {/* Solid censorship bar expanding from left to right strictly within bounding box */}
      <motion.span
        className="absolute inset-0 bg-stone-900 z-10 pointer-events-none rounded-[1px]"
        style={{ transformOrigin: "left center" }}
        initial={{ scaleX: 0 }}
        animate={trigger ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{
          duration,
          delay,
          ease: [0.22, 1, 0.36, 1], // Slower, elegant cubic ease-out
        }}
      />
    </span>
  );
}
