import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createRequire } from "module";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const agenticApiTarget = supabaseUrl
    ? `${supabaseUrl}/functions/v1/agentic-machine-api`
    : undefined;

  const require = createRequire(import.meta.url);
  let taggerPlugin: any = undefined;
  if (mode === "development") {
    try {
      const { componentTagger } = require("lovable-tagger");
      taggerPlugin = componentTagger();
    } catch {
      taggerPlugin = undefined;
    }
  }

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: agenticApiTarget
        ? {
            "/api/ai": {
              target: agenticApiTarget,
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path.replace(/^\/api\/ai/, "") || "/",
            },
          }
        : undefined,
    },
    plugins: [react(), taggerPlugin].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
