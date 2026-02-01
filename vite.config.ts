import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: "dist/public/stats.html",
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Code splitting configuration for optimal chunk sizes
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Keep heavy pages as separate lazy chunks
          if (id.includes("node_modules")) {
            if (
              id.includes("@radix-ui/react-dialog") ||
              id.includes("@radix-ui/react-select") ||
              id.includes("@radix-ui/react-popover")
            ) {
              return "vendor-ui";
            }
            if (id.includes("@radix-ui")) {
              return "vendor-ui";
            }
            if (id.includes("@hookform") || id.includes("react-hook-form")) {
              return "vendor-form";
            }
            if (id.includes("@tanstack/react-query")) {
              return "vendor-query";
            }
            if (
              id.includes("date-fns") ||
              id.includes("lucide-react") ||
              id.includes("clsx") ||
              id.includes("tailwind-merge")
            ) {
              return "vendor-utils";
            }
            if (
              id.includes("wouter") ||
              id.includes("framer-motion") ||
              id.includes("embla-carousel") ||
              id.includes("cmdk") ||
              id.includes("react-hook-form")
            ) {
              return "vendor-other";
            }
            if (id.includes("react") && !id.includes("@radix")) {
              return "vendor-react";
            }
          }
        },
      },
    },
    // Warn when chunks exceed 500KB
    chunkSizeWarningLimit: 500,
    // Use default minify (esbuild) which is faster and works without extra dependencies
    minify: "esbuild",
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
