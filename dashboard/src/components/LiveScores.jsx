import { useState, useEffect } from "react";
import { Radio, Clock } from "lucide-react";

export default function LiveScores({ onNavigate }) {
  const [matches, setMatches] = useState([]);

  const fetchScores = () => {
    fetch("/api/worldcup/scores")
      .then(r => r.json())
      .then(data => setMatches(data.matches || []))
      .catch(() => {});
  };

  const hasLive = matches.some(m => m.is_live);

  useEffect(() => {
    fetchScores();
    const delay = hasLive ? 20000 : 60000;
    const interval = setInterval(fetchScores, delay);
    return () => clearInterval(interval);
  }, [hasLive]);

  const live = matches.filter(m => m.is_live);
  const finished = matches.filter(m => m.is_finished).slice(0, 12);
  const upcoming = matches.filter(m => !m.is_live && !m.is_finished).slice(0, 6);

  if (matches.length === 0) return null;

  return (
    <div className="border-b border-surface-3 bg-surface-0">
      <div
        className="flex items-center gap-0 overflow-x-auto scrollbar-hide cursor-pointer"
        onClick={() => onNavigate?.("worldcup")}
      >
        {/* Label WC */}
        <div className="flex items-center gap-1.5 px-3 py-2 shrink-0 border-r border-surface-3">
          {hasLive
            ? <Radio size={10} className="text-danger animate-pulse" />
            : <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          }
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">WC</span>
        </div>

        {/* Live matches en premier */}
        {live.map(m => (
          <div key={m.id} className="flex items-center gap-2 px-3 py-2 shrink-0 border-r border-danger/20 bg-danger/5">
            <span className="text-[11px] font-semibold text-zinc-200">{m.home_tla || m.home}</span>
            <span className="font-mono text-sm font-black text-danger">{m.home_score}</span>
            <span className="text-zinc-700 text-xs">–</span>
            <span className="font-mono text-sm font-black text-danger">{m.away_score}</span>
            <span className="text-[11px] font-semibold text-zinc-200">{m.away_tla || m.away}</span>
            <span className="text-[9px] text-danger font-bold bg-danger/10 px-1 rounded">{m.status}</span>
          </div>
        ))}

        {/* Résultats terminés */}
        {finished.map(m => (
          <div key={m.id} className="flex items-center gap-1.5 px-3 py-2 shrink-0 border-r border-surface-3/40">
            <span className="text-[11px] text-zinc-400">{m.home_tla || m.home}</span>
            <span className="font-mono text-xs font-bold text-zinc-200">{m.home_score}–{m.away_score}</span>
            <span className="text-[11px] text-zinc-400">{m.away_tla || m.away}</span>
          </div>
        ))}

        {/* Matchs à venir */}
        {upcoming.map(m => {
          const d = m.date ? new Date(m.date) : null;
          return (
            <div key={m.id} className="flex items-center gap-1.5 px-3 py-2 shrink-0 border-r border-surface-3/40">
              <span className="text-[11px] text-zinc-500">{m.home_tla || m.home}</span>
              <span className="text-zinc-700 text-xs">vs</span>
              <span className="text-[11px] text-zinc-500">{m.away_tla || m.away}</span>
              {d && <span className="text-[10px] text-zinc-700 font-mono ml-1">{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
