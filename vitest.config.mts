import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes das funções puras (regras financeiras da Carteira, docs/carteira/REGRAS.md)
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
