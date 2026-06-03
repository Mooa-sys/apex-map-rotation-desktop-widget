export type RankTierStat = {
  label: string;
  value: number;
};

export type RankedStatsData = {
  masterPlayers: number;
  predatorPlayers: number;
  predatorCutoffRp: number;
  fetchedAt: string;
  isPlaceholder: boolean;
};

export type RankedStatsResponse = {
  data: RankedStatsData | null;
  error: string | null;
  isStale: boolean;
};

export function getPlaceholderRankedStats(now = new Date()): RankedStatsData {
  return {
    masterPlayers: 13_798,
    predatorPlayers: 750,
    predatorCutoffRp: 27_480,
    fetchedAt: now.toISOString(),
    isPlaceholder: true
  };
}

export function getRankTierStats(data: RankedStatsData): RankTierStat[] {
  return [
    { label: 'Master', value: data.masterPlayers },
    { label: 'Predator', value: data.predatorPlayers }
  ];
}
