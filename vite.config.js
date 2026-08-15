import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("lucide-react")) return "vendor-lucide";
            if (id.includes("react-dom") || id.includes("react-router-dom") || id.includes("react")) return "vendor-react";
            if (id.includes("zod") || id.includes("zustand")) return "vendor-ui";
            return "vendor";
          }
        }
      }
    }
  }
});
