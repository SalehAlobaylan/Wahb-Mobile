import { describe, expect, it } from '@jest/globals';

import { searchFixtures } from './search-fixtures';

describe('development search fixtures', () => {
  it('contains stable renderable fixture data without a transport dependency', () => {
    expect(searchFixtures).toHaveLength(3);
    expect(
      searchFixtures.every(
        (item) => item.title.length > 0 && item.source.length > 0,
      ),
    ).toBe(true);
    expect(new Set(searchFixtures.map((item) => item.id)).size).toBe(
      searchFixtures.length,
    );
  });
});
