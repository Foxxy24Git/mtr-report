import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolusi alias "@/..." (selaras tsconfig paths) agar modul lib yang memakai
// import alias dapat diuji unit tanpa harus diubah ke path relatif.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
