import { Newspaper, Wallet, Construction, TrendingUp } from "lucide-react";

function ComingSoon({ icon: Icon, title, description }) {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-57px)]">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
          <Icon size={24} className="text-zinc-600" />
        </div>
        <h2 className="text-lg font-bold text-zinc-300 mb-2">{title}</h2>
        <p className="text-sm text-zinc-600 mb-4">{description}</p>
        <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-700">
          <Construction size={12} /> En développement
        </div>
      </div>
    </div>
  );
}

export function NewsSection() {
  return (
    <ComingSoon
      icon={Newspaper}
      title="Actualités sportives"
      description="Articles en direct, analyses, compositions d'équipe et infos transferts — tout en un seul endroit."
    />
  );
}

export function OddsSection() {
  return (
    <ComingSoon
      icon={TrendingUp}
      title="Comparateur de cotes"
      description="Compare les cotes de tous les bookmakers en temps réel sur tous les marchés : 1X2, over/under, BTTS, handicap."
    />
  );
}

export function BankrollSection() {
  return (
    <ComingSoon
      icon={Wallet}
      title="Bankroll tracker"
      description="Suis tes paris, ta bankroll, ton ROI. Historique complet avec graphiques de performance."
    />
  );
}
