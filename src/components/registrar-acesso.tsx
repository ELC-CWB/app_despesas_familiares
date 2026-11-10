"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registrarAcesso, type AppAcesso } from "@/lib/acessos";

const INTERVALO_MS = 5 * 60 * 1000;

function appDoCaminho(caminho: string): AppAcesso | null {
  if (caminho.startsWith("/investments")) return "investimentos";
  if (["/dashboard", "/expenses", "/settings"].some((p) => caminho.startsWith(p))) return "despesas";
  return null;
}

// Avisa o servidor que o usuário está usando Despesas ou Investimentos,
// no máximo uma vez a cada 5 minutos por app neste navegador
export function RegistrarAcesso() {
  const caminho = usePathname();

  useEffect(() => {
    const app = appDoCaminho(caminho);
    if (!app) return;
    const chave = `acesso-registrado-${app}`;
    try {
      const ultimo = Number(sessionStorage.getItem(chave) ?? 0);
      if (Date.now() - ultimo < INTERVALO_MS) return;
      sessionStorage.setItem(chave, String(Date.now()));
    } catch {
      // sem sessionStorage: registra mesmo assim
    }
    registrarAcesso(app).catch(() => {});
  }, [caminho]);

  return null;
}
