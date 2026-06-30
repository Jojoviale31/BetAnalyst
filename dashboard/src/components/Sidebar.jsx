import { Trophy, TrendingUp, BarChart3, Newspaper, Calculator, Wallet } from "lucide-react";

const NAV = [
  { id: "worldcup", label: "World Cup", icon: Trophy },
  { id: "predictions", label: "Prédictions", icon: Calculator },
  { id: "odds", label: "Cotes", icon: TrendingUp },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "news", label: "Actualités", icon: Newspaper },
  { id: "bankroll", label: "Bankroll", icon: Wallet },
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="w-[220px] h-screen bg-surface-1 border-r border-surface-3 flex flex-col fixed left-0 top-0 z-10">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-surface-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <span className="text-[15px] font-bold tracking-tight text-zinc-100">
              Bet<span className="text-brand-light">Analytics</span>
            </span>
            <div className="text-[10px] text-zinc-600 -mt-0.5">v2.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-brand/10 text-brand-light"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-surface-3">
        <div className="text-[10px] text-zinc-700">
          Poisson V1 Model
        </div>
        <div className="text-[10px] text-zinc-700">
          The Odds API + BallDontLie
        </div>
      </div>
    </aside>
  );
}
