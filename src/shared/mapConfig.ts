export type ApexMap = {
  map: string;
  mapZh: string;
  backgroundClass?: string;
};

export type RankedRotationConfig = {
  title: string;
  anchor: Date;
  slotMinutes: number;
  upcomingCount: number;
  rankedMapNames: string[];
};

export const allMaps: ApexMap[] = [
  { map: 'Olympus', mapZh: '奥林匹斯', backgroundClass: 'map-bg-olympus' },
  { map: 'Broken Moon', mapZh: '残月', backgroundClass: 'map-bg-broken-moon' },
  { map: 'Kings Canyon', mapZh: '诸王峡谷', backgroundClass: 'map-bg-kings-canyon' },
  { map: 'Storm Point', mapZh: '风暴点', backgroundClass: 'map-bg-storm-point' },
  { map: "World's Edge", mapZh: '世界尽头', backgroundClass: 'map-bg-worlds-edge' },
  { map: 'E-District', mapZh: '电力区域', backgroundClass: 'map-bg-e-district' }
];

export const rankedRotationConfig: RankedRotationConfig = {
  title: '本地排位地图轮换',
  anchor: new Date(2026, 4, 25, 16, 0, 0, 0),
  slotMinutes: 270,
  upcomingCount: 5,
  // 维护入口：排位地图池变化时，只改这里的三张地图和顺序。
  rankedMapNames: ['Broken Moon', 'Storm Point', 'Olympus']
};

export function getApexMapByName(mapName: string): ApexMap | undefined {
  return allMaps.find((map) => map.map === mapName);
}

export function getRankedRotationMaps(): ApexMap[] {
  return rankedRotationConfig.rankedMapNames.map((mapName) => {
    const map = getApexMapByName(mapName);
    if (!map) {
      throw new Error(`Unknown Apex map in ranked rotation config: ${mapName}`);
    }
    return map;
  });
}
