const BASE = "/api";

export async function fetchWorldCup() {
  const res = await fetch(`${BASE}/worldcup/matches`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchUpcomingAll() {
  const res = await fetch(`${BASE}/upcoming-all`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchUpcoming(sportKey) {
  const res = await fetch(`${BASE}/upcoming/${sportKey}`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchSports() {
  const res = await fetch(`${BASE}/sports`);
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

export async function fetchWCTeams() {
  const res = await fetch(`${BASE}/worldcup/teams`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchWCTeamHistory(teamId) {
  const res = await fetch(`${BASE}/worldcup/team/${teamId}`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export async function fetchWCPlayer(playerId) {
  const res = await fetch(`${BASE}/worldcup/player/${playerId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchFixturePlayers(matchDate, home, away) {
  const params = new URLSearchParams({ match_date: matchDate, home, away });
  const res = await fetch(`/api/worldcup/fixture-players?${params}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchFixtureDetails(matchDate, home, away) {
  const params = new URLSearchParams({ match_date: matchDate, home, away });
  const res = await fetch(`${BASE}/worldcup/fixture-details?${params}`);
  if (!res.ok) return null;
  return res.json();
}
