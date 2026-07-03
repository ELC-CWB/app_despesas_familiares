"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const DEFAULT_FATOR = "8";

interface FiltersCtx {
  fatorInput: string;         setFatorInput: (v: string) => void;
  dlEbitdaFilter: string;     setDlEbitdaFilter: (v: string) => void;
  payoutFilter: string;       setPayoutFilter: (v: string) => void;
  analysesSearch: string;     setAnalysesSearch: (v: string) => void;
  selectedSectors: Set<string>; setSelectedSectors: (v: Set<string>) => void;
  chartsPeriodRange: string;  setChartsPeriodRange: (v: string) => void;
  chartsSymbol: string;       setChartsSymbol: (v: string) => void;
  recentChartSymbols: string[]; addRecentChartSymbol: (s: string) => void;
}

const FiltersContext = createContext<FiltersCtx | null>(null);

export function InvestmentFiltersProvider({ children }: { children: ReactNode }) {
  const [fatorInput, setFatorInput] = useState(DEFAULT_FATOR);
  const [dlEbitdaFilter, setDlEbitdaFilter] = useState("");
  const [payoutFilter, setPayoutFilter] = useState("");
  const [analysesSearch, setAnalysesSearch] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set());
  const [chartsPeriodRange, setChartsPeriodRange] = useState("1mo");
  const [chartsSymbol, setChartsSymbol] = useState("");
  const [recentChartSymbols, setRecentChartSymbols] = useState<string[]>([]);

  const addRecentChartSymbol = (s: string) => {
    setRecentChartSymbols(prev => [s, ...prev.filter(x => x !== s)].slice(0, 10));
  };

  return (
    <FiltersContext.Provider value={{
      fatorInput, setFatorInput,
      dlEbitdaFilter, setDlEbitdaFilter,
      payoutFilter, setPayoutFilter,
      analysesSearch, setAnalysesSearch,
      selectedSectors, setSelectedSectors,
      chartsPeriodRange, setChartsPeriodRange,
      chartsSymbol, setChartsSymbol,
      recentChartSymbols, addRecentChartSymbol,
    }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useInvestmentFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useInvestmentFilters must be within InvestmentFiltersProvider");
  return ctx;
}
