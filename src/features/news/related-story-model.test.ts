import { describe, expect, it } from '@jest/globals';

import {
  canExpandRelatedStory,
  hasRelatedStoryReader,
  relatedStoryExpansion,
  relatedStoryTitle,
  type RelatedStory,
} from './related-story-model';

const story = (overrides: Partial<RelatedStory> = {}): RelatedStory =>
  ({
    story_id: '11111111-1111-4111-8111-111111111111',
    lead_id: '22222222-2222-4222-8222-222222222222',
    label: 'Short label',
    last_member_at: '2026-07-26T12:00:00.000Z',
    lifecycle: 'active',
    published_at: '2026-07-26T12:00:00.000Z',
    member_count: 1,
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    view_count: 0,
    ...overrides,
  }) as RelatedStory;

describe('related story presentation', () => {
  it('uses an excerpt when a related story has no title', () => {
    expect(
      relatedStoryTitle(
        story({ label: '', excerpt: 'A useful related update.' }),
      ),
    ).toBe('A useful related update.');
  });

  it('reveals only prose that adds meaningful information', () => {
    const expandable = story({
      title: 'Brief headline',
      excerpt:
        'Brief headline with enough additional context to explain why this related story matters to a reader.',
    });
    expect(canExpandRelatedStory(expandable)).toBe(true);
    expect(relatedStoryExpansion(expandable)).toContain('additional context');
    expect(canExpandRelatedStory(story({ excerpt: 'Short label' }))).toBe(false);
  });

  it('shows a reader affordance only for article-format leads', () => {
    expect(hasRelatedStoryReader(story({ format: 'ARTICLE' }))).toBe(true);
    expect(hasRelatedStoryReader(story({ format: 'TWEET' }))).toBe(false);
  });
});
