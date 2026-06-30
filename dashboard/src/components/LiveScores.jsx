import { useState, useEffect } from "react";
import { Radio, Clock, CheckCircle2 } from "lucide-react";

export default function LiveScores() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchScores = () => {
    fetch("/api/worldcup/scores")
      .then((r) => r.json())
      .then((data) => {
        setMatches(data.matches || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 30000); // Refresh toutes les 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) return null;

  const live = matches.filter((m) => m.is_live);
  const finished = matches.filter((m) => m.is_finished).slice(0, 8);
  const upcoming = matches.filter((m) => !m.is_live && !m.is_finished).slice(0, 8);

  return (
    <div className="border-b border-surface-3 bg-surface-1">
      {/* Live matches banner */}
      {live.length > 0 && (
        <div className="px-4 py-3 bg-danger/5 border-b border-danger/10">
          <div className="flex items-center gap-2 mb-2">
            <Radio size={12} className="text-danger animate-pulse" />
            <span className="text-xs font-semibold text-danger">EN DIRECT</span>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            {live.map((m) => (
              <div key={m.id} className="flex-shrink-0 bg-surface-2 rounded-lg px-4 py-2.5 min-w-[200px] border border-danger/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-zinc-200">{m.home}</span>
                  <span className="text-lg font-bold text-white">{m.home_score}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-200">{m.away}</span>
                  <span className="text-lg font-bold text-white">{m.away_score}</span>
                </div>
                {m.period && (
                  <div className="text-[10px] text-danger mt-1 text-center">{m.status}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scores ticker */}
      <div className="px-4 py-2.5 flex gap-3 overflow-x-auto scrollbar-hide">
        {finished.map((m) => (
          <div key={m.id} className="flex-shrink-0 flex items-center gap-2 text-xs bg-surface-2 rounded-md px-3 py-1.5">
            <CheckCircle2 size={10} className="text-zinc-600" />
            <span className="text-zinc-400">{m.home}</span>
            <span className="font-mono font-bold text-zinc-200">{m.home_score}-{m.away_score}</span>
            <span className="text-zinc-400">{m.away}</span>
          </div>
        ))}
        {upcoming.slice(0, 4).map((m) => {
          const d = m.date ? new Date(m.date) : null;
          return (
            <div key={m.id} className="flex-shrink-0 flex items-center gap-2 text-xs bg-surface-2 rounded-md px-3 py-1.5">
              <Clock size={10} className="text-zinc-600" />
              <span className="text-zinc-400">{m.home}</span>
              <span className="text-zinc-500">vs</span>
              <span className="text-zinc-400">{m.away}</span>
              {d && <span className="text-zinc-600">{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
