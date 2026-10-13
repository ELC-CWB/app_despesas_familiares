import { redirect } from "next/navigation";

// Configurações tem dois submenus: Carteira e Acessos
export default function InvestmentSettingsPage() {
  redirect("/investments/settings/carteira");
}
