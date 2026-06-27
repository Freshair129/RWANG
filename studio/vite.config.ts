import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Studio dev server proxies /api -> the engine's existing REST server (server.mjs on :4577),
// so the v2 client reuses the proven snapshot/command contract with no CORS.
// Run the engine sidecar with the G-Orchestra backlog:
//   GORCH_BACKLOG=gks/backlog.gorch.json node server.mjs
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5599,
    proxy: { "/api": "http://localhost:4577" },
  },
});
