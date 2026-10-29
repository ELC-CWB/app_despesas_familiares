import Link from "next/link";
import { Button } from "@/components/ui/button";

// Usuário sem grupo de Despesas: precisa criar o grupo ou aceitar um convite no menu Grupos
export function SemGrupo() {
  return (
    <div className="p-6 flex justify-center">
      <div className="max-w-md w-full text-center space-y-3 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Falta escolher um grupo</h2>
        <p className="text-sm text-muted-foreground">
          Para usar as Despesas, você precisa fazer parte de um grupo. Volte à tela inicial e abra o menu <strong>Grupos</strong> para criar o seu grupo ou aceitar um convite. Depois, é só voltar para Despesas.
        </p>
        <Link href="/"><Button className="w-full">Voltar à tela inicial</Button></Link>
        <Link href="/grupos"><Button variant="outline" className="w-full">Ir direto para Grupos</Button></Link>
      </div>
    </div>
  );
}
