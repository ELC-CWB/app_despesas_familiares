import Link from "next/link";
import { Button } from "@/components/ui/button";

// Só aparece se o app não conseguiu preparar o grupo pessoal de Despesas (normalmente é falha passageira)
export function SemGrupo() {
  return (
    <div className="p-6 flex justify-center">
      <div className="max-w-md w-full text-center space-y-3 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Não foi possível abrir suas despesas agora</h2>
        <p className="text-sm text-muted-foreground">
          Recarregue a página para tentar de novo. Se continuar, abra o menu <strong>Grupos</strong> na tela inicial para criar um grupo ou aceitar um convite.
        </p>
        <Link href="/grupos"><Button className="w-full">Ir para Grupos</Button></Link>
        <Link href="/"><Button variant="outline" className="w-full">Voltar à tela inicial</Button></Link>
      </div>
    </div>
  );
}
