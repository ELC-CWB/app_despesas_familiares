import { redirect } from "next/navigation";

// Os acessos e o grupo de investimentos agora ficam no menu Grupos
export default function ConfiguracoesAcessosPage() {
  redirect("/grupos");
}
