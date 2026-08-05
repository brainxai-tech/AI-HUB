import { describe, expect, it } from 'vitest';
import { resolveAssetUrl } from '../src/game/assets';

describe('runtime asset URLs', () => {
  it('keeps public assets inside the configured Vite base path', () => {
    expect(resolveAssetUrl('/', '/assets/birds/scarlet.png')).toBe('/assets/birds/scarlet.png');
    expect(resolveAssetUrl('./', '/assets/birds/scarlet.png')).toBe('./assets/birds/scarlet.png');
    expect(resolveAssetUrl('/fury-flock/', 'assets/birds/scarlet.png'))
      .toBe('/fury-flock/assets/birds/scarlet.png');
  });
});
