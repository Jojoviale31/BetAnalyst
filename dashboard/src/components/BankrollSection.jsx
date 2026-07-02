"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, Upload, Zap, AlertTriangle, ScanLine, RotateCcw } from "lucide-react";

async function apiFetch(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error();
  return r.json();
}

const BET_TYPES = [
  { value: "home", label: "Victoire domicile (1)" },
  { value: "draw", label: "Match nul (X)" },
  { value: "away", label: "Victoire extérieur (2)" },
  { value: "over_25", label: "Plus de 2.5 buts" },
  { value: "under_25", label: "Moins de 2.5 buts" },
  { value: "btts", label: "Les deux équipes marquent" },
  { value: "other", label: "Autre" },
];

const SPORTS = ["football", "basketball", "tennis", "autre"];

// ─── MINI LINE CHART ──────────────────────────────────────

function BankrollChart({ curve, start }) {
  if (!curve || curve.length < 2) return (
    <div className="flex items-center justify-center h-full text-xs text-zinc-600">
      Pas encore de données
    </div>
  );

  const values = [start, ...curve.map(p => p.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 600, H = 120, PAD = 8;

  const points = values.map((v, i) => ({
    x: PAD + (i / (values.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((v - min) / range) * (H - PAD * 2),
  }));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const fill = `${path} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`;
  const isPositive = values[values.length - 1] >= start;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="bankroll-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#bankroll-grad)" />
      <path d={path} fill="none" stroke={isPositive ? "#22c55e" : "#ef4444"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Start line */}
      <line
        x1={PAD} x2={W - PAD}
        y1={H - PAD - ((start - min) / range) * (H - PAD * 2)}
        y2={H - PAD - ((start - min) / range) * (H - PAD * 2)}
        stroke="#3f3f46" strokeWidth="1" strokeDasharray="4 4"
      />
    </svg>
  );
}

// ─── ADD BET FORM ─────────────────────────────────────────

function AddBetForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({
    home: "", away: "", sport: "football", type: "home",
    odds: "", stake: "", match_date: new Date().toISOString().slice(0, 10), notes: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.home || !form.away || !form.odds || !form.stake) return;
    setSaving(true);
    try {
      await apiFetch("/api/bankroll/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      onAdd();
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className="bg-surface-2 rounded-2xl border border-surface-3 p-5">
      <h3 className="text-sm font-bold text-zinc-200 mb-4">Nouveau pari</h3>

      {/* Match */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 mb-3 items-center">
        <input value={form.home} onChange={e => set("home", e.target.value)}
          placeholder="Équipe domicile"
          className="bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand" />
        <span className="text-xs text-zinc-600 text-center">vs</span>
        <input value={form.away} onChange={e => set("away", e.target.value)}
          placeholder="Équipe extérieur"
          className="bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand" />
      </div>

      {/* Date + Sport */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <input type="date" value={form.match_date} onChange={e => set("match_date", e.target.value)}
          className="bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-brand" />
        <select value={form.sport} onChange={e => set("sport", e.target.value)}
          className="bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-brand">
          {SPORTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {/* Bet type */}
      <select value={form.type} onChange={e => set("type", e.target.value)}
        className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-brand mb-3">
        {BET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {/* Odds + Stake */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[10px] text-zinc-600 block mb-1">Cote</label>
          <input type="number" step="0.01" min="1" value={form.odds} onChange={e => set("odds", e.target.value)}
            placeholder="ex: 1.85"
            className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-brand" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-600 block mb-1">Mise (€)</label>
          <input type="number" step="0.5" min="0.5" value={form.stake} onChange={e => set("stake", e.target.value)}
            placeholder="ex: 10"
            className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-brand" />
        </div>
      </div>

      {/* Gain potentiel */}
      {form.odds && form.stake && (
        <div className="bg-surface-3 rounded-lg px-3 py-2 mb-3 flex justify-between text-xs">
          <span className="text-zinc-500">Gain potentiel</span>
          <span className="font-mono font-bold text-success">
            +{(parseFloat(form.stake) * (parseFloat(form.odds) - 1)).toFixed(2)} €
          </span>
        </div>
      )}

      {/* Notes */}
      <input value={form.notes} onChange={e => set("notes", e.target.value)}
        placeholder="Notes (optionnel)"
        className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand mb-4" />

      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={saving || !form.home || !form.away || !form.odds || !form.stake}
          className="flex-1 bg-brand hover:bg-brand-dark disabled:bg-surface-3 disabled:text-zinc-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Enregistrer le pari"}
        </button>
        <button onClick={onCancel}
          className="px-4 bg-surface-3 hover:bg-surface-4 text-zinc-400 rounded-lg text-sm transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── BET ROW ──────────────────────────────────────────────

function BetRow({ bet, onResult, onReset, onDelete }) {
  const isPending = !bet.result;
  const isWin = bet.result === "win";
  const isLoss = bet.result === "loss";
  const d = bet.match_date ? new Date(bet.match_date) : null;
  const typeLabel = BET_TYPES.find(t => t.value === bet.type)?.label || bet.type;

  return (
    <div className={`border-b border-surface-3/40 px-4 py-3 hover:bg-surface-2/30 transition-colors ${isPending ? "" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="shrink-0 mt-0.5">
          {isPending && <Clock size={14} className="text-zinc-600" />}
          {isWin && <CheckCircle size={14} className="text-success" />}
          {isLoss && <XCircle size={14} className="text-danger" />}
        </div>

        {/* Match info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-200 truncate">
            {bet.type === "combine" ? `${bet.home} · ${bet.away}` : `${bet.home} vs ${bet.away}`}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-zinc-500">{typeLabel}</span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono text-[11px] text-zinc-400">cote {bet.odds}</span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono text-[11px] text-zinc-400">{bet.stake} €</span>
            {d && <><span className="text-zinc-700">·</span>
              <span className="text-[11px] text-zinc-600">{d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span></>}
          </div>
          {bet.notes && bet.type === "combine" ? (
            <div className="mt-1.5 max-h-[80px] overflow-y-auto space-y-0.5 pr-1">
              {bet.notes.split(" | ").map((leg, i) => (
                <p key={i} className="text-[10px] text-zinc-600 flex gap-1">
                  <span className="text-zinc-700 shrink-0">·</span>
                  <span>{leg.trim()}</span>
                </p>
              ))}
            </div>
          ) : bet.notes ? (
            <p className="text-[10px] text-zinc-600 mt-0.5">{bet.notes}</p>
          ) : null}
        </div>

        {/* Result + P&L */}
        <div className="shrink-0 text-right">
          {!isPending && (
            <p className={`font-mono text-sm font-bold ${isWin ? "text-success" : "text-danger"}`}>
              {isWin ? "+" : ""}{bet.profit?.toFixed(2)} €
            </p>
          )}
          {isPending && (
            <p className="text-[11px] text-zinc-600 font-mono">
              Potentiel +{(bet.stake * (bet.odds - 1)).toFixed(2)} €
            </p>
          )}
        </div>
      </div>

      {/* Boutons résultat */}
      <div className="flex gap-1.5 mt-2 ml-5">
        {isPending ? (
          <>
            <button onClick={() => onResult(bet.id, "win")}
              className="flex-1 text-[11px] font-semibold py-1 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors">
              Gagné
            </button>
            <button onClick={() => onResult(bet.id, "loss")}
              className="flex-1 text-[11px] font-semibold py-1 rounded-md bg-danger/10 text-danger hover:bg-danger/20 transition-colors">
              Perdu
            </button>
            <button onClick={() => onResult(bet.id, "void")}
              className="flex-1 text-[11px] font-semibold py-1 rounded-md bg-surface-3 text-zinc-500 hover:bg-surface-4 transition-colors">
              Annulé
            </button>
          </>
        ) : (
          <button onClick={() => onReset(bet.id)}
            className="flex items-center gap-1 text-[11px] font-semibold py-1 px-3 rounded-md bg-surface-3 text-zinc-500 hover:text-zinc-200 hover:bg-surface-4 transition-colors">
            <RotateCcw size={10} /> Remettre en attente
          </button>
        )}
        <button onClick={() => onDelete(bet.id)}
          className="px-2 py-1 rounded-md bg-surface-3 text-zinc-600 hover:text-danger hover:bg-danger/10 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── IMAGE UPLOAD + ANALYSE ───────────────────────────────

function SlipUploader({ onParsed }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const process = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Fichier non supporté — envoie une image (JPG, PNG)");
      return;
    }
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(",")[1];
      try {
        const data = await apiFetch("/api/analyze/parse-slip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_b64: b64, media_type: file.type }),
        });
        // Auto-sauvegarde immédiate de tous les paris
        await autoSaveAll(data);
        onParsed(data);
      } catch (err) {
        setError("Erreur lors de l'extraction — réessaie avec une image plus nette");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const autoSaveAll = async (slip) => {
    if (!slip?.bets?.length) return;
    const isCombo = slip.ticket_type === "combine";

    if (isCombo) {
      // Un combiné = 1 seul pari en bankroll avec la cote totale
      // Les legs sont listés dans les notes pour traçabilité
      const legsStr = slip.bets.map(b => {
        const conds = (b.conditions || []).map(c => c.label).join(", ");
        return `${b.home} vs ${b.away}: ${conds}`;
      }).join(" | ");

      // Date du premier match à venir (ou aujourd'hui)
      const firstDate = slip.bets[0]?.match_date || new Date().toISOString().slice(0, 10);

      await apiFetch("/api/bankroll/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home: "Combiné",
          away: `${slip.bets.length} sélections`,
          sport: "football",
          match_date: firstDate,
          type: "combine",
          odds: slip.total_odds || 1,
          stake: slip.stake || 0,
          notes: legsStr,
        }),
      }).catch(() => {});
    } else {
      // Paris simples : un enregistrement par pari
      for (const bet of slip.bets) {
        await apiFetch("/api/bankroll/bet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            home: bet.home,
            away: bet.away,
            sport: bet.sport || "football",
            match_date: bet.match_date,
            type: bet.primary_type || "other",
            odds: bet.odds,
            stake: slip.stake || 0,
            notes: (bet.conditions || []).map(c => c.label).join(" · "),
          }),
        }).catch(() => {});
      }
    }
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); process(e.dataTransfer.files[0]); }}
      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
        dragging ? "border-brand bg-brand/5" : "border-surface-4 hover:border-zinc-600"
      }`}
      onClick={() => document.getElementById("slip-upload").click()}
    >
      <input id="slip-upload" type="file" accept="image/*" className="hidden"
        onChange={e => process(e.target.files[0])} />

      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-brand" />
          <p className="text-sm text-zinc-400">Claude analyse ton ticket...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-3 flex items-center justify-center">
            <ScanLine size={22} className="text-zinc-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-300">Glisse ton ticket Winamax ici</p>
            <p className="text-xs text-zinc-600 mt-0.5">ou clique pour choisir un fichier — JPG, PNG</p>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

function AnalysisPanel({ parsedSlip, onSave }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stake, setStake] = useState(parsedSlip?.stake || 10);

  const analyze = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/analyze/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bets: parsedSlip.bets,
          stake: parseFloat(stake) || 10,
          total_odds: parsedSlip.total_odds,
        }),
      });
      setAnalysis(data);
    } catch { } finally { setLoading(false); }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const bet of parsedSlip.bets) {
        await apiFetch("/api/bankroll/bet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            home: bet.home, away: bet.away, sport: bet.sport || "football",
            match_date: bet.match_date, type: bet.type,
            odds: parsedSlip.ticket_type === "combine" ? parsedSlip.total_odds : bet.odds,
            stake: parsedSlip.ticket_type === "combine" ? parseFloat(stake) : (parsedSlip.stake || 10),
            notes: `${parsedSlip.ticket_type === "combine" ? "Combiné" : "Simple"} · ${bet.type_label || bet.type}`,
          }),
        });
      }
      onSave();
    } catch { } finally { setSaving(false); }
  };

  const s = analysis?.summary;
  const verdictColor = s?.verdict === "value" ? "text-success" : s?.verdict === "risqué" ? "text-danger" : "text-warning";
  const verdictLabel = s?.verdict === "value" ? "Value bet" : s?.verdict === "risqué" ? "Risqué" : "Neutre";

  return (
    <div className="space-y-4">
      {/* Ticket summary */}
      <div className="bg-surface-2 rounded-xl border border-surface-3 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-zinc-200">
              {parsedSlip.ticket_type === "combine" ? `Combiné ${parsedSlip.bets?.length} sélections` : "Paris simples"}
            </p>
            {(() => {
              const won = parsedSlip.bets?.filter(b => b.settled_result === "won").length || 0;
              const lost = parsedSlip.bets?.filter(b => b.settled_result === "lost").length || 0;
              const settled = parsedSlip.bets?.filter(b => b.settled).length || 0;
              if (settled === 0) return null;
              return (
                <p className="text-[11px] mt-0.5">
                  <span className="text-success font-semibold">{won} validé{won > 1 ? "s" : ""}</span>
                  {lost > 0 && <span className="text-danger font-semibold ml-1.5">{lost} perdu{lost > 1 ? "s" : ""}</span>}
                  <span className="text-zinc-600 ml-1.5">{parsedSlip.bets?.length - settled} en attente</span>
                </p>
              );
            })()}
          </div>
          {parsedSlip.total_odds && (
            <span className="font-mono text-lg font-black text-zinc-100">×{parsedSlip.total_odds}</span>
          )}
        </div>

        {/* Legs list */}
        <div className="space-y-2 mb-4">
          {parsedSlip.bets?.map((bet, i) => {
            const leg = analysis?.legs?.[i];
            const isSettled = bet.settled;
            const result = bet.settled_result; // "won" | "lost" | "unknown" | null

            return (
              <div key={i} className={`px-3 py-2.5 rounded-xl border transition-all ${
                result === "won" ? "bg-success/8 border-success/30" :
                result === "lost" ? "bg-danger/8 border-danger/30" :
                result === "unknown" && isSettled ? "bg-zinc-800/50 border-zinc-700" :
                leg?.is_value ? "bg-brand/5 border-brand/20" :
                "bg-surface-3 border-surface-4"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Match title */}
                    <div className="flex items-center gap-2 mb-1">
                      {isSettled && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          result === "won" ? "bg-success/20 text-success" :
                          result === "lost" ? "bg-danger/20 text-danger" :
                          "bg-zinc-700 text-zinc-400"
                        }`}>
                          {result === "won" ? "✓ Validé" :
                           result === "lost" ? "✗ Perdu" :
                           `FT ${bet.actual_score}`}
                        </span>
                      )}
                      <p className="text-sm font-semibold text-zinc-200 truncate">{bet.home} vs {bet.away}</p>
                    </div>
                    {/* Conditions */}
                    <div className="space-y-0.5">
                      {(bet.conditions || []).map((c, j) => (
                        <p key={j} className={`text-[11px] flex items-center gap-1 ${result === "won" ? "text-success/80" : result === "lost" ? "text-danger/70" : "text-zinc-500"}`}>
                          <span className="w-1 h-1 rounded-full bg-current shrink-0 opacity-60" />
                          {c.label}
                        </p>
                      ))}
                      {!bet.conditions?.length && (
                        <p className="text-[11px] text-zinc-500">{bet.type_label || bet.primary_type || bet.type}</p>
                      )}
                      {bet.actual_score && result === "unknown" && (
                        <p className="text-[10px] text-zinc-600 mt-0.5">Score final : {bet.actual_score} · résultat auto non disponible</p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {bet.odds && <p className="font-mono text-sm font-bold text-zinc-200">×{bet.odds?.toFixed(2)}</p>}
                    {leg && leg.model_prob && (
                      <p className={`text-[10px] font-semibold mt-0.5 ${
                        leg.is_value ? "text-success" : leg.edge < -5 ? "text-danger" : "text-zinc-600"
                      }`}>
                        {leg.model_prob}% {leg.edge !== null ? `(${leg.edge > 0 ? "+" : ""}${leg.edge}%)` : ""}
                      </p>
                    )}
                    {leg && !leg.model_prob && (
                      <p className="text-[10px] text-zinc-700 mt-0.5">Non couvert</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stake */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-500 shrink-0">Mise (€)</label>
          <input type="number" value={stake} onChange={e => setStake(e.target.value)} min="0.5" step="0.5"
            className="w-24 bg-surface-3 border border-surface-4 rounded-lg px-3 py-1.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-brand" />
          {parsedSlip.total_odds && (
            <span className="text-xs text-zinc-500">
              → Gain potentiel : <span className="font-mono font-bold text-zinc-200">{(parseFloat(stake || 0) * parsedSlip.total_odds).toFixed(2)} €</span>
            </span>
          )}
        </div>
      </div>

      {/* Analyse CTA */}
      {!analysis && (
        <button onClick={analyze} disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded-xl text-sm transition-colors">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {loading ? "Analyse en cours..." : "Analyser avec le modèle Poisson WC"}
        </button>
      )}

      {/* Analysis results */}
      {analysis && s && (
        <div className="bg-surface-2 rounded-xl border border-surface-3 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-zinc-200">Verdict du modèle</p>
            <span className={`text-sm font-black ${verdictColor}`}>{verdictLabel}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Proba modèle", value: `${s.combined_model_prob}%`, color: "text-zinc-100" },
              { label: "Proba implicite", value: `${s.combined_implied_prob}%`, color: "text-zinc-400" },
              { label: "Edge combiné", value: `${s.combined_edge > 0 ? "+" : ""}${s.combined_edge}%`, color: s.combined_edge > 0 ? "text-success" : "text-danger" },
            ].map(item => (
              <div key={item.label} className="bg-surface-3 rounded-lg p-3">
                <p className={`text-xl font-black font-mono ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {s.risky_legs > 0 && (
            <div className="flex items-start gap-2 bg-danger/5 border border-danger/20 rounded-lg p-3">
              <AlertTriangle size={14} className="text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">
                {s.risky_legs} sélection{s.risky_legs > 1 ? "s" : ""} risquée{s.risky_legs > 1 ? "s" : ""} selon le modèle : {s.risky_selections.join(", ")}
              </p>
            </div>
          )}

          {s.covered_by_model < s.total_legs && (
            <p className="text-[11px] text-zinc-600">
              {s.total_legs - s.covered_by_model} sélection(s) non couvertes par le modèle WC (buteurs, type autre, etc.)
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 bg-success/5 border border-success/20 rounded-xl px-4 py-3">
        <CheckCircle size={14} className="text-success shrink-0" />
        <p className="text-xs text-success font-medium">
          Paris enregistrés automatiquement dans le tracker
        </p>
      </div>
    </div>
  );
}


// ─── MAIN ─────────────────────────────────────────────────

export default function BankrollSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [parsedSlip, setParsedSlip] = useState(null);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("bets"); // bets | perf

  const load = useCallback(() => {
    // Auto-settle d'abord, puis charge les données
    apiFetch("/api/bankroll/auto-settle", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        apiFetch("/api/bankroll")
          .then(d => { setData(d); setLoading(false); })
          .catch(() => setLoading(false));
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleResult = async (id, result) => {
    await apiFetch(`/api/bankroll/bet/${id}/result`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });
    load();
  };

  const handleReset = async (id) => {
    await apiFetch(`/api/bankroll/bet/${id}/reset`, { method: "PUT" });
    load();
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/bankroll/bet/${id}`, { method: "DELETE" });
    load();
  };

  const filteredBets = (data?.bets || []).filter(b => {
    if (filter === "pending") return !b.result;
    if (filter === "settled") return b.result && b.result !== "void";
    return true;
  });

  const isPositive = (data?.total_profit || 0) >= 0;

  return (
    <div className="h-[calc(100vh-96px)] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-5">

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 size={20} className="animate-spin text-zinc-600" />
          </div>
        )}

        {!loading && data && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                {
                  label: "P&L net",
                  value: data.settled === 0 ? "–" : `${data.total_profit >= 0 ? "+" : ""}${data.total_profit?.toFixed(2)} €`,
                  sub: data.settled === 0 ? "aucun pari réglé" : `sur ${data.settled} paris réglés`,
                  color: data.settled === 0 ? "text-zinc-500" : isPositive ? "text-success" : "text-danger",
                },
                {
                  label: "Misé total",
                  value: data.total_bets === 0 ? "–" : `${data.total_stake?.toFixed(2)} €`,
                  sub: `${data.total_bets} paris enregistrés`,
                  color: "text-zinc-200",
                },
                {
                  label: "ROI",
                  value: `${data.roi >= 0 ? "+" : ""}${data.roi?.toFixed(1)} %`,
                  sub: `misé ${data.total_stake?.toFixed(2)} €`,
                  color: data.roi >= 0 ? "text-success" : "text-danger",
                },
                {
                  label: "Win rate",
                  value: `${data.win_rate?.toFixed(1)} %`,
                  sub: `${data.wins}V / ${data.losses}D`,
                  color: data.win_rate >= 50 ? "text-success" : "text-warning",
                },
              ].map(s => (
                <div key={s.label} className="bg-surface-2 rounded-xl p-4 border border-surface-3">
                  <p className="text-[11px] text-zinc-500 mb-1">{s.label}</p>
                  <p className={`text-xl font-black font-mono ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            {data.bankroll_curve?.length > 1 && (
              <div className="bg-surface-2 rounded-xl border border-surface-3 p-4 mb-5 h-[140px]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Évolution bankroll</p>
                  <div className="flex items-center gap-1.5 text-xs">
                    {isPositive
                      ? <><TrendingUp size={14} className="text-success" /><span className="text-success font-semibold">{data.roi >= 0 ? "+" : ""}{data.roi?.toFixed(1)}%</span></>
                      : <><TrendingDown size={14} className="text-danger" /><span className="text-danger font-semibold">{data.roi?.toFixed(1)}%</span></>
                    }
                  </div>
                </div>
                <div className="h-[80px]">
                  <BankrollChart curve={data.bankroll_curve} start={data.start_bankroll} />
                </div>
              </div>
            )}

            {/* Vue toggle */}
            <div className="flex gap-1 mb-4">
              {[["bets", "Paris"], ["perf", "Performance"]].map(([val, label]) => (
                <button key={val} onClick={() => setView(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === val ? "bg-brand/10 text-brand-light" : "text-zinc-600 hover:text-zinc-300"}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Performance view */}
            {view === "perf" && data.settled > 0 && (() => {
              const settled = (data.bets || []).filter(b => b.result === "win" || b.result === "loss");
              const byType = settled.reduce((acc, b) => {
                const t = b.type || "other";
                if (!acc[t]) acc[t] = { wins: 0, losses: 0, profit: 0, stake: 0 };
                acc[t].stake += b.stake || 0;
                acc[t].profit += b.profit || 0;
                if (b.result === "win") acc[t].wins++;
                else acc[t].losses++;
                return acc;
              }, {});

              const typeLabels = { home: "Victoire dom.", away: "Victoire ext.", draw: "Match nul",
                over_25: "Over 2.5", under_25: "Under 2.5", btts: "BTTS", combine: "Combiné", other: "Autre" };

              return (
                <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden mb-5">
                  <div className="px-4 py-3 border-b border-surface-3">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Performance par type de pari</p>
                  </div>
                  <div className="divide-y divide-surface-3/40">
                    {Object.entries(byType).sort((a, b) => b[1].profit - a[1].profit).map(([type, stats]) => {
                      const roi = stats.stake > 0 ? (stats.profit / stats.stake * 100).toFixed(1) : 0;
                      const wr = ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(0);
                      return (
                        <div key={type} className="flex items-center justify-between px-4 py-3">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-zinc-200">{typeLabels[type] || type}</p>
                            <p className="text-[11px] text-zinc-500">{stats.wins}V / {stats.losses}D · Win rate {wr}%</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-mono font-bold text-sm ${stats.profit >= 0 ? "text-success" : "text-danger"}`}>
                              {stats.profit >= 0 ? "+" : ""}{stats.profit.toFixed(2)} €
                            </p>
                            <p className={`text-[10px] ${parseFloat(roi) >= 0 ? "text-success/70" : "text-danger/70"}`}>ROI {roi}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {view === "perf" && data.settled === 0 && (
              <p className="text-center text-sm text-zinc-600 py-8">Aucun pari réglé pour afficher les stats</p>
            )}

            {/* Scanner + liste paris */}
            {view === "bets" && showScanner && !parsedSlip && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-zinc-200">Scanner un ticket</p>
                  <button onClick={() => setShowScanner(false)} className="text-xs text-zinc-600 hover:text-zinc-400">Annuler</button>
                </div>
                <SlipUploader onParsed={(data) => setParsedSlip(data)} />
              </div>
            )}

            {view === "bets" && showScanner && parsedSlip && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-zinc-200">Ticket extrait</p>
                  <button onClick={() => { setParsedSlip(null); setShowScanner(false); }} className="text-xs text-zinc-600 hover:text-zinc-400">Fermer</button>
                </div>
                <AnalysisPanel parsedSlip={parsedSlip} onSave={() => { setParsedSlip(null); setShowScanner(false); load(); }} />
              </div>
            )}

            {view === "bets" && showForm && (
              <div className="mb-5">
                <AddBetForm onAdd={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
              </div>
            )}

            {/* Bets list */}
            {view === "bets" && <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-3 flex items-center justify-between">
                <div className="flex gap-1">
                  {[["all", `Tous (${data.total_bets})`], ["pending", `En attente (${data.pending})`], ["settled", `Réglés (${data.settled})`]].map(([val, label]) => (
                    <button key={val} onClick={() => setFilter(val)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ${filter === val ? "bg-brand/10 text-brand-light" : "text-zinc-600 hover:text-zinc-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {!showForm && !showScanner && (
                  <div className="flex gap-2">
                    <button onClick={() => { setShowScanner(true); setParsedSlip(null); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-surface-3 px-3 py-1.5 rounded-lg transition-colors border border-surface-4">
                      <ScanLine size={13} /> Scanner
                    </button>
                    <button onClick={() => setShowForm(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-brand-light hover:text-brand bg-brand/10 px-3 py-1.5 rounded-lg transition-colors">
                      <Plus size={13} /> Ajouter
                    </button>
                  </div>
                )}
              </div>

              {filteredBets.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-zinc-500">Aucun pari</p>
                  <p className="text-xs text-zinc-700 mt-1">Clique sur "Ajouter un pari" pour commencer</p>
                </div>
              ) : (
                <div>
                  {filteredBets.map(b => (
                    <BetRow key={b.id} bet={b} onResult={handleResult} onReset={handleReset} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </div>}
          </>
        )}
      </div>
    </div>
  );
}
