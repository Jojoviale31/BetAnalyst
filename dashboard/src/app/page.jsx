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

export default function App() {
  const [section, setSection] = useState("worldcup");
  const ActiveSection = SECTIONS[section];

  return (
    <div className="flex min-h-screen bg-surface-0">
      <Sidebar active={section} onChange={setSection} />
      <main className="flex-1 ml-[220px]">
        {/* Live scores ticker */}
        <LiveScores />
        
        {/* Top bar */}
        <div className="h-[48px] border-b border-surface-3 px-6 flex items-center justify-between bg-surface-1/80 backdrop-blur-sm sticky top-0 z-10">
          <h1 className="text-sm font-semibold text-zinc-300 capitalize">
            {section === "worldcup" ? "World Cup 2026" : section}
          </h1>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-zinc-600">Live</span>
          </div>
        </div>

        <ActiveSection />
      </main>
    </div>
  );
}
