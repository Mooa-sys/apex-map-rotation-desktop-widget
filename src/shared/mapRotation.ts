import {
  allMaps,
  getRankedRotationMaps,
  rankedRotationConfig
} from './mapConfig';

export type RotationEntry = {
  map: string;
  mapZh: string;
  start: string;
  end: string;
  status: 'current' | 'upcoming';
  relativeText: string;
  startsAt?: string;
  endsAt?: string;
};

export type RotationData = {
  title: string;
  current: RotationEntry;
  upcoming: RotationEntry[];
  fetchedAt: string;
};

export type RotationResponse = {
  data: RotationData | null;
  error: string | null;
  isStale: boolean;
};

export const LOCAL_ROTATION_SLOT_MINUTES = rankedRotationConfig.slotMinutes;
const SLOT_MS = LOCAL_ROTATION_SLOT_MINUTES * 60 * 1000;
const UPCOMING_COUNT = rankedRotationConfig.upcomingCount;

export const LOCAL_ROTATION_TITLE = rankedRotationConfig.title;
export const LOCAL_ROTATION_ANCHOR = rankedRotationConfig.anchor;

const LOCAL_ROTATION_MAPS = getRankedRotationMaps();

const MAP_NAMES_ZH: Record<string, string> = Object.fromEntries(
  allMaps.map(({ map, mapZh }) => [map, mapZh])
);

export function getLocalizedMapName(map: string): string {
  return MAP_NAMES_ZH[map] ?? map;
}

export function formatMapName(map: string): string {
  const zh = getLocalizedMapName(map);
  return zh === map ? map : `${zh} / ${map}`;
}

export function getLocalMapRotation(now = new Date()): RotationData {
  const currentSlot = getSlotIndex(now);
  const current = createRotationEntry(currentSlot, now, 'current');
  const upcoming = Array.from({ length: UPCOMING_COUNT }, (_, index) =>
    createRotationEntry(currentSlot + index + 1, now, 'upcoming')
  );

  return {
    title: LOCAL_ROTATION_TITLE,
    current,
    upcoming,
    fetchedAt: now.toISOString()
  };
}

export function minutesUntilRangeEnd(now: Date, start: string, end: string): number {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = clockToMinutes(start);
  const endMinutes = clockToMinutes(end);
  const wrapsMidnight = endMinutes <= startMinutes;

  if (wrapsMidnight) {
    if (nowMinutes >= startMinutes) return 24 * 60 - nowMinutes + endMinutes;
    return endMinutes - nowMinutes;
  }

  if (nowMinutes <= endMinutes) return endMinutes - nowMinutes;
  return 24 * 60 - nowMinutes + endMinutes;
}

export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return '即将切换';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [
    days ? `${days}天` : '',
    hours ? `${hours}小时` : '',
    mins ? `${mins}分` : ''
  ].filter(Boolean);
  return `${parts.join('') || '不到1分'}后切换`;
}

export function parseClockRange(range: string): { start: string; end: string } | null {
  const match = range.match(/(\d{1,2}:\d{2})\s*(?:-|to)\s*(\d{1,2}:\d{2})/i);
  if (!match) return null;
  return {
    start: normalizeClock(match[1]),
    end: normalizeClock(match[2])
  };
}

export function clockToMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

function createRotationEntry(
  slot: number,
  now: Date,
  status: RotationEntry['status']
): RotationEntry {
  const map = LOCAL_ROTATION_MAPS[positiveModulo(slot, LOCAL_ROTATION_MAPS.length)];
  const startAt = new Date(LOCAL_ROTATION_ANCHOR.getTime() + slot * SLOT_MS);
  const endAt = new Date(startAt.getTime() + SLOT_MS);
  const start = formatClock(startAt);
  const end = formatClock(endAt);
  const relativeText =
    status === 'current'
      ? formatCountdown(Math.ceil((endAt.getTime() - now.getTime()) / 60_000))
      : '';

  return {
    map: map.map,
    mapZh: map.mapZh,
    start,
    end,
    status,
    relativeText,
    ...(status === 'current' ? { endsAt: end } : { startsAt: start })
  };
}

function getSlotIndex(now: Date): number {
  return Math.floor((now.getTime() - LOCAL_ROTATION_ANCHOR.getTime()) / SLOT_MS);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function formatClock(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function normalizeClock(clock: string): string {
  const [hours, minutes] = clock.split(':');
  return `${hours.padStart(2, '0')}:${minutes}`;
}
