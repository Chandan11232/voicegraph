import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In dev, serve /api/command from the same handler Vercel runs in production.
function localApi() {
  return {
    name: "saydiagram-local-api",
    configureServer(server) {
      server.middlewares.use("/api/command", async (req, res) => {
        const { default: handler } = await server.ssrLoadModule("/api/command.js");
        handler(req, res);
      });
      // Mirror Vercel's cleanUrls so /app works locally too.
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/app" || req.url.startsWith("/app?") || req.url.startsWith("/app#")) req.url = req.url.replace("/app", "/app.html");
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [react(), localApi()],
    server: { port: 3000 },
    build: {
      rollupOptions: { input: { main: "index.html", app: "app.html" } },
    },
  };
});
