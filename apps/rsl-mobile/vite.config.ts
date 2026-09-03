import { defineConfig } from "vite";

/**
 * Der Build landet in `dist` und wird von der Android-Huelle als lokale
 * Website ausgeliefert. Relative Pfade, damit es egal ist, unter welcher
 * Adresse die Huelle die Dateien anbietet.
 */
export default defineConfig({
  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    // Android System WebView ist modern genug - kein Legacy-Ballast im Bundle.
    target: "chrome110",
    minify: "esbuild",
    sourcemap: false,
    reportCompressedSize: false,
    assetsInlineLimit: 0,
  },
});
