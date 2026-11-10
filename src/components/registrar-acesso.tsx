"use client";

import { useEffect } from "react";
import { registrarAcesso } from "@/lib/acessos";

const CHAVE = "acesso-registrado-em";
const INTERVALO_MS = 5 * 60 * 1000;

// Avisa o servidor que o usuário está usando o app, no máximo uma vez a cada 5 minutos neste navegador
export function RegistrarAcesso() {
  useEffect(() => {
    try {
      const ultimo = Number(sessionStorage.getItem(CHAVE) ?? 0);
      if (Date.now() - ultimo < INTERVALO_MS) return;
      sessionStorage.setItem(CHAVE, String(Date.now()));
    } catch {
      // sem sessionStorage: registra mesmo assim
    }
    registrarAcesso().catch(() => {});
  }, []);

  return null;
}
