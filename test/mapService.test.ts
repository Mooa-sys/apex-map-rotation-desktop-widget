import { describe, expect, it } from 'vitest';
import { getMapRotation } from '../src/main/mapService';

describe('map service', () => {
  it('returns local rotation data without a remote request', async () => {
    const response = await getMapRotation(true);

    expect(response.error).toBeNull();
    expect(response.isStale).toBe(false);
    expect(response.data?.current.map).toMatch(/Broken Moon|Kings Canyon|Olympus/);
    expect(response.data?.upcoming).toHaveLength(5);
  });
});
