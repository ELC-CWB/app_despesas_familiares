import Link from "next/link";
import { Button } from "@/components/ui/button";

// Usuário recém-cadastrado: ainda sem grupo (cria o seu ou aceita um convite)
export function SemGrupo() {
  return (
    <div className="p-6 flex justify-center">
      <div className="max-w-md w-full text-center space-y-3 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Bem-vindo!</h2>
        <p className="text-sm text-muted-foreground">
          Você ainda não está em um grupo. Crie o seu grupo familiar ou aguarde o convite de alguém que já usa o app: o convite aparece em Configurações.
        </p>
        <Link href="/settings"><Button className="w-full">Ir para Configurações</Button></Link>
      </div>
    </div>
  );
}
