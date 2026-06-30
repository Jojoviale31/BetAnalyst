"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import LiveScores from "@/components/LiveScores";
import WorldCupSection from "@/components/WorldCupSection";
import PredictionsSection from "@/components/PredictionsSection";
import StatsSection from "@/components/StatsSection";
import { NewsSection, OddsSection, BankrollSection } from "@/components/PlaceholderSections";

const SECTIONS = {
  worldcup: WorldCupSection,
  predictions: PredictionsSection,
  odds: OddsSection,
  stats: StatsSection,
  news: NewsSection,
  bankroll: BankrollSection,
};

const SECTION_TITLES = {
  worldcup: "FIFA World Cup 2026",
  predictions: "Prédictions Poisson",
  odds: "Comparateur de cotes",
  stats: "Historique & Statistiques",
  news: "Actualités",
  bankroll: "Bankroll",
};

export default function App() {
  const [section, setSection] = useState("worldcup");
  const ActiveSection = SECTIONS[section];

  return (
    <div className="flex min-h-screen bg-surface-0">
      <Sidebar active={section} onChange={setSection} />
      <main className="flex-1 ml-[220px] min-w-0">
        {/* Live scores ticker */}
        <LiveScores />

        {/* Top bar */}
        <div className="h-11 border-b border-surface-3 px-5 flex items-center justify-between bg-surface-1">
          <h1 className="text-[13px] font-bold text-zinc-200 tracking-tight">{SECTION_TITLES[section] || section}</h1>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wide">Connecté</span>
          </div>
        </div>

        <ActiveSection />
      </main>
    </div>
  );
}
