"use client";

import { useState, useEffect } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { fetchTeams, fetchTeamHistory, fetchWCTeams, fetchWCTeamHistory } from "@/lib/api";

const COMPETITIONS = [
  { code: "WC", name: "World Cup 2026" },
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "SA", name: "Serie A" },
  { code: "BL1", name: "Bundesliga" },
  { code: "FL1", name: "Ligue 1" },
  { code: "CL", name: "Champions League" },
];

function ResultBadge({ result }) {
  if (!result) return <span className="text-xs text-zinc-600">–</span>;
  const styles = {
    W: "bg-success/10 text-success border-success/20",
    D: "bg-warning/10 text-warning border-warning/20",
    L: "bg-danger/10 text-danger border-danger/20",
  };
  return (
    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${styles[result]}`}>
      {result}
    </span>
  );
}

function VenueBadge({ venue }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
      venue === "H" ? "bg-brand/10 text-brand-light" : "bg-surface-3 text-zinc-500"
    }`}>
      {venue}
    </span>
  );
}

export default function StatsSection() {
  const [competition, setCompetition] = useState("PL");
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Load teams when competition changes
  useEffect(() => {
    setLoadingTeams(true);
    setTeams([]);
    setSelectedTeam(null);
    setMatches([]);
    const loader = competition === "WC"
      ? fetchWCTeams().then(d => setTeams(d.teams || []))
      : fetchTeams(competition).then(d => setTeams(d.teams || []));
    loader.catch(() => setTeams([])).finally(() => setLoadingTeams(false));
  }, [competition]);

  // Load matches when team is selected
  useEffect(() => {
    if (!selectedTeam) return;
    setLoadingMatches(true);
    setMatches([]);

    if (competition === "WC") {
      fetchWCTeamHistory(selectedTeam.id)
        .then(d => {
          // Normaliser le format WC vers le format club
          const normalized = (d.matches || []).map(m => ({
            id: m.id,
            date: m.date,
            matchday: null,
            status: m.score ? "FINISHED" : "SCHEDULED",
            venue: m.venue,
            opponent: m.opponent,
            score: m.score,
            result: m.result,
          }));
          setMatches(normalized);
        })
        .catch(() => setMatches([]))
        .finally(() => setLoadingMatches(false));
    } else {
      fetchTeamHistory(competition, selectedTeam.id)
        .then((d) => setMatches(d.matches || []))
        .catch(() => setMatches([]))
        .finally(() => setLoadingMatches(false));
    }
  }, [selectedTeam, competition]);

  const finished = matches.filter((m) => m.status === "FINISHED");
  const wins = finished.filter((m) => m.result === "W").length;
  const draws = finished.filter((m) => m.result === "D").length;
  const losses = finished.filter((m) => m.result === "L").length;
  const gf = finished.reduce((acc, m) => acc + (parseInt(m.score) >= 0 ? (m.venue === "H" ? (m.home_score || 0) : (m.away_score || 0)) : 0), 0);

  return (
    <div className="flex h-[calc(100vh-96px)]">
      {/* Left panel */}
      <div className="w-[260px] border-r border-surface-3 flex flex-col">
        {/* Competition tabs */}
        <div className="p-3 border-b border-surface-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Compétition</p>
          <div className="flex flex-col gap-1">
            {COMPETITIONS.map((c) => (
              <button
                key={c.code}
                onClick={() => setCompetition(c.code)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                  competition === c.code
                    ? "bg-brand/10 text-brand-light font-medium"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Teams list */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Équipes</p>
            {loadingTeams ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="text-zinc-600 animate-spin" />
              </div>
            ) : teams.length === 0 ? (
              <p className="text-xs text-zinc-600 py-4 text-center">Aucune équipe en base</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTeam(t)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                      selectedTeam?.id === t.id
                        ? "bg-surface-3 text-zinc-100 font-medium"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-surface-2"
                    }`}
                  >
                    <span className="truncate">{t.name}</span>
                    {selectedTeam?.id === t.id && <ChevronRight size={12} className="text-zinc-500 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        {!selectedTeam ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <p className="text-sm text-zinc-500">Sélectionne une équipe</p>
              <p className="text-xs text-zinc-700 mt-1">pour voir son historique de matchs</p>
            </div>
          </div>
        ) : loadingMatches ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="text-zinc-600 animate-spin" />
          </div>
        ) : (
          <div className="p-6">
            {/* Header */}
            <div className="mb-5">
              <h2 className="text-lg font-bold text-zinc-100">{selectedTeam.name}</h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                {COMPETITIONS.find((c) => c.code === competition)?.name} · {matches.length} matchs
              </p>
            </div>

            {/* Season summary */}
            {finished.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Joués", value: finished.length },
                  { label: "Victoires", value: wins, color: "text-success" },
                  { label: "Nuls", value: draws, color: "text-warning" },
                  { label: "Défaites", value: losses, color: "text-danger" },
                ].map((s) => (
                  <div key={s.label} className="bg-surface-2 rounded-xl p-3 border border-surface-3">
                    <p className={`text-2xl font-bold font-mono ${s.color || "text-zinc-100"}`}>{s.value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Matches table */}
            {matches.length === 0 ? (
              <p className="text-sm text-zinc-600">Aucun match trouvé</p>
            ) : (
              <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-3">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Date</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">J.</th>
                      <th className="px-2 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lieu</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Adversaire</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Score</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m, i) => {
                      const date = m.date ? new Date(m.date) : null;
                      return (
                        <tr
                          key={m.id}
                          className={`border-b border-surface-3/50 hover:bg-surface-3/30 transition-colors ${
                            i === matches.length - 1 ? "border-b-0" : ""
                          }`}
                        >
                          <td className="px-4 py-2.5 text-xs text-zinc-400 font-mono whitespace-nowrap">
                            {date
                              ? date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })
                              : "–"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-zinc-600">
                            {m.matchday ?? "–"}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <VenueBadge venue={m.venue} />
                          </td>
                          <td className="px-4 py-2.5 text-zinc-300">{m.opponent}</td>
                          <td className="px-4 py-2.5 text-center font-mono font-bold text-zinc-100">
                            {m.score ?? <span className="text-zinc-600 font-normal text-xs">{m.status === "SCHEDULED" ? "À venir" : "–"}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <ResultBadge result={m.result} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
