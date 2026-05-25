import { getLocalMapRotation, type RotationResponse } from '../shared/mapRotation';

export async function getMapRotation(_force = false): Promise<RotationResponse> {
  return {
    data: getLocalMapRotation(new Date()),
    error: null,
    isStale: false
  };
}
