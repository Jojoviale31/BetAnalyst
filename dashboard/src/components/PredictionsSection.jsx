import { useState } from "react";
import { Calculator, ArrowRight, Target, TrendingUp, Shield } from "lucide-react";

// Poisson PMF calculation in-browser
function poissonPmf(k, lambda) {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    result *= lambda / i;
  }
  return result;
}

function runPoisson(lambdaHome, lambdaAway) {
  const maxGoals = 7;
  let hw = 0, dr = 0, aw = 0;
  const scores = {};

  for (let hg = 0; hg < maxGoals; hg++) {
    for (let ag = 0; ag < maxGoals; ag++) {
      const p = poissonPmf(hg, lambdaHome) * poissonPmf(ag, lambdaAway);
      scores[`${hg}-${ag}`] = p;
      if (hg > ag) hw += p;
      else if (hg === ag) dr += p;
      else aw += p;
    }
  }

  const topScores = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([score, prob]) => ({ score, prob: (prob * 100).toFixed(1) }));

  const over25 = Object.entries(scores)
    .filter(([s]) => s.split("-").reduce((a, b) => +a + +b, 0) > 2)
    .reduce((sum, [, p]) => sum + p, 0);

  const btts = Object.entries(scores)
    .filter(([s]) => s.split("-").every((g) => +g > 0))
    .reduce((sum, [, p]) => sum + p, 0);

  return {
    homeWin: (hw * 100).toFixed(1),
    draw: (dr * 100).toFixed(1),
    awayWin: (aw * 100).toFixed(1),
    topScores,
    over25: (over25 * 100).toFixed(1),
    btts: (btts * 100).toFixed(1),
  };
}

function PredictionResult({ result, homeTeam, awayTeam, lambdaH, lambdaA }) {
  return (
    <div className="space-y-5 animate-in fade-in">
      {/* Probabilities */}
      <div className="bg-surface-2 rounded-xl p-5">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Target size={14} /> Probabilités 1X2
        </div>
        <div className="flex h-8 rounded-lg overflow-hidden mb-3">
          <div style={{ width: `${result.homeWin}%` }} className="bg-brand flex items-center justify-center text-xs font-bold text-white">
            {parseFloat(result.homeWin) > 12 && `${result.homeWin}%`}
          </div>
          <div style={{ width: `${result.draw}%` }} className="bg-zinc-600 flex items-center justify-center text-xs font-bold text-white">
            {parseFloat(result.draw) > 12 && `${result.draw}%`}
          </div>
          <div style={{ width: `${result.awayWin}%` }} className="bg-danger flex items-center justify-center text-xs font-bold text-white">
            {parseFloat(result.awayWin) > 12 && `${result.awayWin}%`}
          </div>
        </div>
        <div className="grid grid-cols-3 text-center">
          <div>
            <div className="text-xl font-bold text-zinc-100">{result.homeWin}%</div>
            <div className="text-xs text-zinc-500">{homeTeam}</div>
            <div className="font-mono text-[11px] text-zinc-600 mt-0.5">
              cote fair: {(100 / parseFloat(result.homeWin)).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-zinc-100">{result.draw}%</div>
            <div className="text-xs text-zinc-500">Nul</div>
            <div className="font-mono text-[11px] text-zinc-600 mt-0.5">
              cote fair: {(100 / parseFloat(result.draw)).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-zinc-100">{result.awayWin}%</div>
            <div className="text-xs text-zinc-500">{awayTeam}</div>
            <div className="font-mono text-[11px] text-zinc-600 mt-0.5">
              cote fair: {(100 / parseFloat(result.awayWin)).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* xG */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 mb-1">xG {homeTeam}</div>
          <div className="text-3xl font-bold text-brand-light">{lambdaH}</div>
        </div>
        <div className="bg-surface-2 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 mb-1">xG {awayTeam}</div>
          <div className="text-3xl font-bold text-danger">{lambdaA}</div>
        </div>
      </div>

      {/* Top scores */}
      <div className="bg-surface-2 rounded-xl p-5">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Scores exacts les plus probables
        </div>
        <div className="grid grid-cols-3 gap-2">
          {result.topScores.map((s, i) => (
            <div key={i} className={`rounded-lg p-3 text-center ${i === 0 ? "bg-brand/10 border border-brand/20" : "bg-surface-3"}`}>
              <div className={`text-lg font-bold ${i === 0 ? "text-brand-light" : "text-zinc-200"}`}>{s.score}</div>
              <div className="text-[11px] text-zinc-500">{s.prob}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Over/Under + BTTS */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-500">Over 2.5</div>
              <div className={`text-2xl font-bold ${parseFloat(result.over25) > 55 ? "text-success" : "text-zinc-200"}`}>
                {result.over25}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">Under 2.5</div>
              <div className="text-lg font-semibold text-zinc-400">
                {(100 - parseFloat(result.over25)).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
        <div className="bg-surface-2 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-500">BTTS Oui</div>
              <div className={`text-2xl font-bold ${parseFloat(result.btts) > 55 ? "text-success" : "text-zinc-200"}`}>
                {result.btts}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">BTTS Non</div>
              <div className="text-lg font-semibold text-zinc-400">
                {(100 - parseFloat(result.btts)).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PredictionsSection() {
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [lambdaH, setLambdaH] = useState("1.5");
  const [lambdaA, setLambdaA] = useState("1.2");
  const [result, setResult] = useState(null);

  const handlePredict = () => {
    if (!homeTeam || !awayTeam) return;
    const lh = parseFloat(lambdaH) || 1.5;
    const la = parseFloat(lambdaA) || 1.2;
    setResult(runPoisson(lh, la));
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          <Calculator size={20} className="text-brand" />
          Prédiction Poisson V1
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Entre les deux équipes et les xG attendus pour obtenir les probabilités de chaque résultat.
        </p>
      </div>

      {/* Input form */}
      <div className="bg-surface-2 rounded-xl p-5 mb-6">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-end mb-4">
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Domicile</label>
            <input
              type="text"
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
              placeholder="ex: France"
              className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand"
            />
          </div>
          <ArrowRight size={16} className="text-zinc-600 mb-2" />
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Extérieur</label>
            <input
              type="text"
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
              placeholder="ex: Suède"
              className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block flex items-center gap-1">
              <Shield size={12} /> xG Domicile (lambda)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="5"
              value={lambdaH}
              onChange={(e) => setLambdaH(e.target.value)}
              className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-brand"
            />
            <div className="text-[10px] text-zinc-600 mt-1">Moy PL: 1.53 · Liga: 1.57 · L1: 1.59</div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block flex items-center gap-1">
              <Shield size={12} /> xG Extérieur (lambda)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="5"
              value={lambdaA}
              onChange={(e) => setLambdaA(e.target.value)}
              className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-brand"
            />
            <div className="text-[10px] text-zinc-600 mt-1">Moy PL: 1.22 · Liga: 1.12 · L1: 1.24</div>
          </div>
        </div>

        <button
          onClick={handlePredict}
          disabled={!homeTeam || !awayTeam}
          className="w-full bg-brand hover:bg-brand-dark disabled:bg-surface-3 disabled:text-zinc-600 text-white font-semibold py-3 rounded-lg transition-colors text-sm"
        >
          Calculer la prédiction
        </button>
      </div>

      {/* Results */}
      {result && (
        <PredictionResult
          result={result}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          lambdaH={lambdaH}
          lambdaA={lambdaA}
        />
      )}
    </div>
  );
}
