"use client";

import { useState, useEffect } from "react";
import { Radio, Clock } from "lucide-react";

function TickerItem({ m }) {
  const live = m.is_live;
  const finished = m.is_finished;
  const d = m.date ? new Date(m.date) : null;

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 border-r border-surface-3 h-full">
      {live ? (
        <Radio size={9} className="text-danger animate-pulse shrink-0" />
      ) : finished ? (
        <span className="text-[9px] font-bold text-zinc-700 uppercase shrink-0">FT</span>
      ) : (
        <Clock size={9} className="text-zinc-600 shrink-0" />
      )}
      <span className={`text-[11px] truncate max-w-[80px] ${live ? "text-zinc-200" : "text-zinc-500"}`}>{m.home}</span>
      {finished || live ? (
        <span className={`text-[11px] font-mono font-bold tabular-nums ${live ? "text-zinc-100" : "text-zinc-300"}`}>
          {m.home_score}-{m.away_score}
        </span>
      ) : (
        <span className="text-[10px] text-zinc-600 font-mono">{d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "vs"}</span>
      )}
      <span className={`text-[11px] truncate max-w-[80px] ${live ? "text-zinc-200" : "text-zinc-500"}`}>{m.away}</span>
      {live && m.status && <span className="text-[9px] text-danger font-mono shrink-0">{m.status}</span>}
    </div>
  );
}

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
    const interval = setInterval(fetchScores, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return null;

  const live = matches.filter((m) => m.is_live);
  const finished = matches.filter((m) => m.is_finished).slice(0, 10);
  const upcoming = matches.filter((m) => !m.is_live && !m.is_finished).slice(0, 10);
  const ordered = [...live, ...finished, ...upcoming];

  if (ordered.length === 0) return null;

  return (
    <div className="h-10 border-b border-surface-3 bg-surface-1 flex items-stretch overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 border-r border-surface-3 bg-surface-2 shrink-0">
        <Radio size={11} className="text-danger" />
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Scores</span>
      </div>
      <div className="flex items-stretch overflow-x-auto scrollbar-hide">
        {ordered.map((m) => (
          <TickerItem key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}
