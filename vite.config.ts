import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "src/ui",
  plugins: [tailwindcss(), react()],
  build: {
    outDir: resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
