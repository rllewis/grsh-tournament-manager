import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,

    rollupOptions: {
      input: resolve(__dirname, "src/main.jsx"),

      external: [
        "react",
        "react-dom",
        "react-dom/client",
      ],

      output: {
        format: "iife",
        entryFileNames: "grsh-admin.js",
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith(".css") ? "grsh-admin.css" : assetInfo.name,
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react-dom/client": "ReactDOM",
        },
        name: "GRSHApp",
      },
    },

    target: ["chrome90", "firefox88", "safari14"],
    chunkSizeWarningLimit: 600,
  },

  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});