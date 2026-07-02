"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import LiveScores from "@/components/LiveScores";
import HomeSection from "@/components/HomeSection";
import WorldCupSection from "@/components/WorldCupSection";
import CompetitionSection from "@/components/CompetitionSection";
import PredictionsSection from "@/components/PredictionsSection";
import StatsSection from "@/components/StatsSection";
import OddsSection from "@/components/OddsSection";
import NewsSection from "@/components/NewsSection";
import BankrollSection from "@/components/BankrollSection";

const SECTION_TITLES = {
  home: "Accueil",
  worldcup: "World Cup 2026",
  competition: "Compétition WC 2026",
  predictions: "Prédictions",
  odds: "Cotes",
  stats: "Statistiques",
  news: "Actualités",
  bankroll: "Bankroll",
};

export default function App() {
  const [section, setSection] = useState("home");

  const navigate = (to) => setSection(to);

  const renderSection = () => {
    switch (section) {
      case "home": return <HomeSection onNavigate={navigate} />;
      case "worldcup": return <WorldCupSection />;
      case "competition": return <CompetitionSection />;
      case "predictions": return <PredictionsSection />;
      case "odds": return <OddsSection />;
      case "stats": return <StatsSection />;
      case "news": return <NewsSection />;
      case "bankroll": return <BankrollSection />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar active={section} onChange={setSection} />
      <main className="ml-[220px]">
        <LiveScores onNavigate={navigate} />
        <div className="h-[48px] border-b border-surface-3 px-6 flex items-center justify-between bg-surface-1/80 backdrop-blur-sm sticky top-0 z-10">
          <h1 className="text-sm font-semibold text-zinc-300">{SECTION_TITLES[section] || section}</h1>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-zinc-600">Live</span>
          </div>
        </div>
        {renderSection()}
      </main>
    </div>
  );
}
