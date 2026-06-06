export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel – brand/illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar-bg flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-10 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-blue-500/5 blur-2xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-lg">$</span>
            </div>
            <span
              className="text-white font-display font-semibold text-xl"
              style={{ fontFamily: "Sora, sans-serif" }}
            >
              Despesas Familiares
            </span>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h2
            className="text-white font-display text-4xl font-bold leading-tight"
            style={{ fontFamily: "Sora, sans-serif" }}
          >
            Controle financeiro
            <br />
            <span className="text-primary">em família.</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed max-w-sm">
            Registre, visualize e analise as despesas do seu grupo familiar de forma simples e colaborativa.
          </p>

          <div className="grid grid-cols-2 gap-4 max-w-sm">
            {[
              { label: "Multi-usuário", icon: "👨‍👩‍👧‍👦" },
              { label: "Gráficos e relatórios", icon: "📊" },
              { label: "Categorias", icon: "🏷️" },
              { label: "Filtros avançados", icon: "🔍" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2.5">
                <span className="text-lg">{f.icon}</span>
                <span className="text-slate-300 text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-slate-500 text-sm">
          © {new Date().getFullYear()} Despesas Familiares
        </div>
      </div>

      {/* Right panel – form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold">$</span>
            </div>
            <span className="font-semibold text-lg">Despesas Familiares</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
