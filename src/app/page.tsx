import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReceiptText, TrendingUp, Target, Mic } from "lucide-react";
import { HomeLogoutButton } from "@/components/home-logout-button";
import { hasInvestmentsAccess } from "@/lib/investments-access";
import { hasTalkieAccess } from "@/lib/talkie-access";

const CANDLES = [
  { x: 60,   o: 730, c: 700, h: 740, l: 695 },
  { x: 120,  o: 700, c: 660, h: 710, l: 655 },
  { x: 180,  o: 660, c: 690, h: 700, l: 655 },
  { x: 240,  o: 690, c: 640, h: 698, l: 632 },
  { x: 300,  o: 640, c: 600, h: 648, l: 592 },
  { x: 360,  o: 600, c: 650, h: 658, l: 595 },
  { x: 420,  o: 650, c: 590, h: 655, l: 582 },
  { x: 480,  o: 590, c: 540, h: 598, l: 534 },
  { x: 540,  o: 540, c: 575, h: 582, l: 535 },
  { x: 600,  o: 575, c: 510, h: 580, l: 504 },
  { x: 660,  o: 510, c: 470, h: 518, l: 464 },
  { x: 720,  o: 470, c: 430, h: 478, l: 424 },
  { x: 780,  o: 430, c: 480, h: 488, l: 425 },
  { x: 840,  o: 480, c: 410, h: 486, l: 405 },
  { x: 900,  o: 410, c: 370, h: 418, l: 364 },
  { x: 960,  o: 370, c: 400, h: 408, l: 365 },
  { x: 1020, o: 400, c: 330, h: 405, l: 325 },
  { x: 1080, o: 330, c: 290, h: 338, l: 284 },
  { x: 1140, o: 290, c: 320, h: 328, l: 285 },
  { x: 1200, o: 320, c: 260, h: 326, l: 254 },
  { x: 1260, o: 260, c: 220, h: 268, l: 214 },
  { x: 1320, o: 220, c: 185, h: 228, l: 180 },
  { x: 1380, o: 185, c: 150, h: 192, l: 144 },
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!await hasInvestmentsAccess(supabase, user.id)) redirect("/dashboard");

  const talkieOk = await hasTalkieAccess(supabase, user.id);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ backgroundColor: "hsl(222, 47%, 11%)" }}
    >
      {/* ── Background SVG ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        <svg width="100%" height="100%" viewBox="0 0 1440 800"
          preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.055)" />
            </pattern>
            <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
          {CANDLES.map((c, i) => {
            const bullish = c.c < c.o;
            const bodyTop = Math.min(c.o, c.c);
            const bodyH = Math.max(Math.abs(c.o - c.c), 3);
            return (
              <g key={i}>
                <line x1={c.x} y1={c.h} x2={c.x} y2={c.l}
                  stroke={bullish ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.05)"} strokeWidth="1" />
                <rect x={c.x - 9} y={bodyTop} width={18} height={bodyH}
                  fill={bullish ? "rgba(16,185,129,0.09)" : "rgba(239,68,68,0.06)"} rx="2" />
              </g>
            );
          })}
          <polyline points="0,780 180,700 360,610 540,520 720,420 900,320 1080,220 1260,130 1440,60"
            fill="none" stroke="rgba(16,185,129,0.22)" strokeWidth="2.5"
            strokeLinejoin="round" filter="url(#glow)" />
          <polygon points="0,780 180,700 360,610 540,520 720,420 900,320 1080,220 1260,130 1440,60 1440,800 0,800"
            fill="rgba(16,185,129,0.04)" />
          <polyline points="0,800 220,760 440,710 660,650 880,570 1100,470 1320,360 1440,310"
            fill="none" stroke="rgba(59,130,246,0.14)" strokeWidth="2"
            strokeLinejoin="round" filter="url(#glow)" />
          {([[180,700],[540,520],[900,320],[1260,130]] as [number,number][]).map(([x,y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="8" fill="rgba(16,185,129,0.08)" />
              <circle cx={x} cy={y} r="4" fill="rgba(16,185,129,0.28)" />
            </g>
          ))}
          <text x="90" y="200" fontSize="72" fontWeight="800" fill="rgba(255,255,255,0.022)" transform="rotate(-18,90,200)" style={{ fontFamily: "serif" }}>R$</text>
          <text x="1180" y="650" fontSize="90" fontWeight="800" fill="rgba(255,255,255,0.018)" transform="rotate(12,1180,650)">$</text>
          <text x="550" y="110" fontSize="56" fontWeight="800" fill="rgba(16,185,129,0.055)" transform="rotate(-6,550,110)">%</text>
          <text x="880" y="720" fontSize="68" fontWeight="800" fill="rgba(59,130,246,0.04)" transform="rotate(8,880,720)">∑</text>
          <text x="300" y="760" fontSize="50" fontWeight="700" fill="rgba(255,255,255,0.02)" transform="rotate(-4,300,760)">FII</text>
        </svg>
      </div>

      {/* ── Glow blobs ─────────────────────────────────────────────────────── */}
      <div className="absolute rounded-full blur-[120px] pointer-events-none"
        style={{ width: 640, height: 640, top: "-30%", left: "-20%", backgroundColor: "hsl(160,84%,39%)", opacity: 0.09 }} />
      <div className="absolute rounded-full blur-[100px] pointer-events-none"
        style={{ width: 520, height: 520, bottom: "-25%", right: "-18%", backgroundColor: "#3b82f6", opacity: 0.11 }} />
      <div className="absolute rounded-full blur-[90px] pointer-events-none"
        style={{ width: 360, height: 360, top: "30%", right: "22%", backgroundColor: "#8b5cf6", opacity: 0.06 }} />

      {/* ── Logout ─────────────────────────────────────────────────────────── */}
      <HomeLogoutButton />

      {/* ── Title ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 text-center mb-6 sm:mb-12">
        <h1 className="text-white font-bold text-2xl sm:text-4xl tracking-tight"
          style={{ fontFamily: "Sora, sans-serif" }}>
          Aplicativos Pessoais
        </h1>
      </div>

      {/* ── Module cards ────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col gap-3 sm:gap-4 w-full max-w-lg">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Link href="/dashboard"
            className="group rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-3 transition-all duration-300 hover:-translate-y-2"
            style={{ background: "linear-gradient(135deg, hsl(160,84%,39%) 0%, hsl(160,84%,28%) 100%)", boxShadow: "0 8px 40px rgba(16,185,129,0.28)" }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
              <ReceiptText className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white" style={{ fontFamily: "Sora, sans-serif" }}>Despesas</h2>
          </Link>

          <Link href="/investments"
            className="group rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-3 transition-all duration-300 hover:-translate-y-2"
            style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)", boxShadow: "0 8px 40px rgba(59,130,246,0.28)" }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white" style={{ fontFamily: "Sora, sans-serif" }}>Investimentos</h2>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Link href="/goals"
            className="group rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-3 transition-all duration-300 hover:-translate-y-2"
            style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)", boxShadow: "0 8px 40px rgba(139,92,246,0.28)" }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
              <Target className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white" style={{ fontFamily: "Sora, sans-serif" }}>Metas</h2>
          </Link>

          {talkieOk && (
            <Link href="/talkie"
              className="group rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-3 transition-all duration-300 hover:-translate-y-2"
              style={{ background: "linear-gradient(135deg, #e8a33d 0%, #b8721a 100%)", boxShadow: "0 8px 40px rgba(232,163,61,0.28)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
                <Mic className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white" style={{ fontFamily: "Sora, sans-serif" }}>Talkie</h2>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
