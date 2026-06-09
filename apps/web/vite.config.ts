import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Ports are chosen by scripts/dev.mjs and passed in via env (falls back to the
// defaults when Vite runs on its own). Only the API port must be exact — that's
// what the proxy targets. The web port is a starting hint; strictPort:false lets
// Vite bump to the next free port if this one gets taken after the orchestrator
// checked it (Vite prints the actual URL it binds).
const apiPort = Number(process.env.API_PORT) || 4000;
const webPort = Number(process.env.WEB_PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: false,
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
});
