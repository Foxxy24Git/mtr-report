import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolusi alias "@/..." (selaras tsconfig paths) agar modul lib yang memakai
// import alias dapat diuji unit tanpa harus diubah ke path relatif.
export default defineConfig({
  // Next.js menyimpan JSX saat type-check; Vitest perlu mentransformasikannya
  // agar komponen React dapat diuji di lingkungan Node.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
