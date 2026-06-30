const BASE = "/api";

export async function fetchWorldCup() {
  const res = await fetch(`${BASE}/worldcup/matches`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchPredictions(competition) {
  const res = await fetch(`${BASE}/football/predict/${competition}`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchNBA() {
  const res = await fetch(`${BASE}/nba/predictions`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchBankroll() {
  const res = await fetch(`${BASE}/bankroll`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchTeams(competition) {
  const res = await fetch(`${BASE}/football/teams?competition=${competition}`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchTeamHistory(competition, teamId) {
  const res = await fetch(`${BASE}/football/team-history?competition=${competition}&team_id=${teamId}`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchFixtureDetails(matchDate, home, away) {
  const params = new URLSearchParams({ match_date: matchDate, home, away });
  const res = await fetch(`${BASE}/worldcup/fixture-details?${params}`);
  if (!res.ok) return null;
  return res.json();
}
