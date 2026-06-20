import Link from "next/link";
import { ReceiptText, TrendingUp, ArrowRight, Clock } from "lucide-react";

export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ backgroundColor: "hsl(222, 47%, 11%)" }}
    >
      {/* Decorative glow blobs */}
      <div
        className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: "hsl(160, 84%, 39%)", opacity: 0.12 }}
      />
      <div
        className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: "hsl(160, 84%, 39%)", opacity: 0.07 }}
      />

      {/* Logo + title */}
      <div className="relative z-10 text-center mb-12 animate-fade-in-up">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg"
          style={{
            backgroundColor: "hsl(160, 84%, 39%)",
            boxShadow: "0 8px 32px rgba(16,185,129,0.35)",
          }}
        >
          <span
            className="text-white font-bold text-2xl"
            style={{ fontFamily: "Sora, sans-serif" }}
          >
            $
          </span>
        </div>
        <h1
          className="text-white font-bold text-2xl tracking-tight"
          style={{ fontFamily: "Sora, sans-serif" }}
        >
          Despesas Familiares
        </h1>
        <p className="text-sm mt-1.5" style={{ color: "hsl(220, 9%, 50%)" }}>
          Selecione um módulo para continuar
        </p>
      </div>

      {/* Module cards */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl animate-fade-in-up-delay-2">

        {/* Despesas — active */}
        <Link
          href="/dashboard"
          className="group rounded-2xl p-7 flex flex-col gap-5 transition-all duration-300 hover:-translate-y-1.5"
          style={{
            background: "linear-gradient(135deg, hsl(160, 84%, 39%) 0%, hsl(160, 84%, 28%) 100%)",
            boxShadow: "0 8px 40px rgba(16,185,129,0.28)",
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
          >
            <ReceiptText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "Sora, sans-serif" }}
            >
              Despesas
            </h2>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>
              Controle de gastos familiares
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 text-sm mt-auto transition-colors duration-200"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <span className="group-hover:text-white transition-colors">Acessar</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 group-hover:text-white transition-all" />
          </div>
        </Link>

        {/* Investimentos — coming soon */}
        <a
          href="/investments"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-2xl p-7 flex flex-col gap-5 transition-all duration-300 hover:-translate-y-1.5"
          style={{
            backgroundColor: "hsl(222, 47%, 16%)",
            border: "1px solid hsl(220, 20%, 21%)",
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "hsl(222, 47%, 21%)" }}
          >
            <TrendingUp className="w-6 h-6" style={{ color: "hsl(220, 9%, 42%)" }} />
          </div>
          <div>
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: "Sora, sans-serif", color: "hsl(220, 9%, 52%)" }}
            >
              Investimentos
            </h2>
            <p className="text-sm mt-1" style={{ color: "hsl(220, 9%, 38%)" }}>
              Controle de investimentos
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 text-sm mt-auto"
            style={{ color: "hsl(220, 9%, 36%)" }}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Em breve</span>
          </div>
        </a>

      </div>
    </main>
  );
}
