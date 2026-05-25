import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  getLocalMapRotation,
  minutesUntilRangeEnd,
  parseClockRange
} from '../src/shared/mapRotation';

describe('local map rotation', () => {
  it('uses 2026-05-25 16:00 as Broken Moon anchor time', () => {
    const data = getLocalMapRotation(new Date(2026, 4, 25, 16, 0, 0));

    expect(data.title).toBe('本地排位地图轮换');
    expect(data.current.map).toBe('Broken Moon');
    expect(data.current.mapZh).toBe('残月');
    expect(data.current.start).toBe('16:00');
    expect(data.current.end).toBe('20:30');
    expect(data.upcoming.map((entry) => entry.map).slice(0, 3)).toEqual([
      'Kings Canyon',
      'Olympus',
      'Broken Moon'
    ]);
  });

  it('rotates every 4.5 hours in the configured order', () => {
    expect(getLocalMapRotation(new Date(2026, 4, 25, 20, 29)).current.map).toBe('Broken Moon');
    expect(getLocalMapRotation(new Date(2026, 4, 25, 20, 30)).current.map).toBe('Kings Canyon');
    expect(getLocalMapRotation(new Date(2026, 4, 26, 1, 0)).current.map).toBe('Olympus');
    expect(getLocalMapRotation(new Date(2026, 4, 26, 5, 30)).current.map).toBe('Broken Moon');
  });

  it('handles times before the anchor without breaking the cycle', () => {
    const data = getLocalMapRotation(new Date(2026, 4, 25, 15, 59));

    expect(data.current.map).toBe('Olympus');
    expect(data.current.start).toBe('11:30');
    expect(data.current.end).toBe('16:00');
    expect(data.upcoming[0].map).toBe('Broken Moon');
  });

  it('parses both From/to and compact clock ranges', () => {
    expect(parseClockRange('From 05:00 to 09:30, ends in 2 hours')).toEqual({
      start: '05:00',
      end: '09:30'
    });
    expect(parseClockRange('9:30-14:00')).toEqual({
      start: '09:30',
      end: '14:00'
    });
  });
});

describe('countdown helpers', () => {
  it('counts down within a same-day range', () => {
    const now = new Date(2026, 4, 19, 8, 15);
    expect(minutesUntilRangeEnd(now, '05:00', '09:30')).toBe(75);
    expect(formatCountdown(75)).toBe('1小时15分后切换');
  });

  it('counts down across midnight', () => {
    const beforeMidnight = new Date(2026, 4, 19, 23, 45);
    const afterMidnight = new Date(2026, 4, 20, 2, 15);

    expect(minutesUntilRangeEnd(beforeMidnight, '23:00', '03:30')).toBe(225);
    expect(minutesUntilRangeEnd(afterMidnight, '23:00', '03:30')).toBe(75);
  });
});
