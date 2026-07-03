// Approximate rgb of hsl(222,47%,11%) — used as gradient stop colour
const BG = "rgb(9,15,30)";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">

      {/* ── Left panel ─────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col p-12 relative overflow-hidden"
        style={{ backgroundColor: "hsl(222, 47%, 11%)" }}
      >

        {/* ── Layer 0: full-bleed background photo ──────────────────────── */}
        <div className="absolute inset-0" style={{ zIndex: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/imagem familia_dinheiro.png"
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: "center 30%" }}
          />
          {/* Uniform dark tint so image reads as backdrop, not foreground */}
          <div className="absolute inset-0"
            style={{ background: "rgba(9,15,30,0.48)" }} />
          {/* Strong gradient from bottom — creates a dark "stage" for text */}
          <div className="absolute inset-x-0 bottom-0"
            style={{
              height: "62%",
              background: `linear-gradient(to bottom, transparent, ${BG} 68%)`,
            }} />
          {/* Top gradient to anchor the image to the panel */}
          <div className="absolute inset-x-0 top-0"
            style={{
              height: "22%",
              background: `linear-gradient(to bottom, ${BG}, transparent)`,
            }} />
          {/* Vignette on left/right edges */}
          <div className="absolute inset-0"
            style={{ boxShadow: "inset 60px 0 80px rgba(9,15,30,0.6), inset -60px 0 80px rgba(9,15,30,0.6)" }} />
        </div>

        {/* ── Layer 1: colour glow blobs ────────────────────────────────── */}
        <div className="absolute rounded-full blur-[110px] pointer-events-none"
          style={{ zIndex: 1, width: 500, height: 500, bottom: "-12%", left: "-18%",
            backgroundColor: "hsl(160,84%,39%)", opacity: 0.13 }} />
        <div className="absolute rounded-full blur-[90px] pointer-events-none"
          style={{ zIndex: 1, width: 320, height: 320, top: "3%", right: "4%",
            backgroundColor: "#3b82f6", opacity: 0.09 }} />

        {/* ── Content ────────────────────────────────────────────────────── */}

        {/* Flex spacer — lets the photo breathe above the text */}
        <div className="flex-1" />

        {/* Hero text + badges */}
        <div className="relative space-y-5" style={{ zIndex: 10 }}>
          <h2
            className="text-white font-bold leading-tight"
            style={{
              fontFamily: "Sora, sans-serif",
              fontSize: "clamp(2rem, 3.2vw, 2.75rem)",
              textShadow: "0 2px 24px rgba(0,0,0,0.55)",
            }}
          >
            Gestão financeira
            <br />
            <span style={{ color: "hsl(160,84%,48%)" }}>em família</span>
          </h2>

          <p
            className="text-base leading-relaxed max-w-sm"
            style={{ color: "rgba(255,255,255,0.62)", textShadow: "0 1px 10px rgba(0,0,0,0.7)" }}
          >
            Controle despesas, monitore investimentos e acompanhe o patrimônio do seu grupo familiar.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Multi-usuário",       icon: "👨‍👩‍👧‍👦" },
              { label: "Carteira de ações",   icon: "📈" },
              { label: "Despesas familiares", icon: "🏷️" },
              { label: "Dividendos",          icon: "💰" },
            ].map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{
                  backgroundColor: "rgba(255,255,255,0.09)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              >
                <span className="text-sm">{f.icon}</span>
                <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div className="relative mt-8 text-xs" style={{ zIndex: 10, color: "rgba(255,255,255,0.25)" }}>
          © {new Date().getFullYear()} Gestão Financeira Familiar
        </div>

      </div>

      {/* ── Right panel — form ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo — small screens only */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(160,84%,39%) 0%, hsl(160,84%,28%) 100%)" }}
            >
              <span className="text-white font-bold text-sm">$</span>
            </div>
            <span className="font-semibold text-lg" style={{ fontFamily: "Sora, sans-serif" }}>
              Gestão Financeira Familiar
            </span>
          </div>
          {children}
        </div>
      </div>

    </div>
  );
}
