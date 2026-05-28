import { describe, expect, it } from 'vitest';
import { getMapRotation } from '../src/main/mapService';
import { rankedRotationConfig } from '../src/shared/mapConfig';

describe('map service', () => {
  it('returns local rotation data without a remote request', async () => {
    const response = await getMapRotation(true);

    expect(response.error).toBeNull();
    expect(response.isStale).toBe(false);
    expect(rankedRotationConfig.rankedMapNames).toContain(response.data?.current.map);
    expect(response.data?.upcoming).toHaveLength(5);
  });
});
