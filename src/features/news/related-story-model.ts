import type { NewsFeedResponse } from '@/core/api';

export type RelatedStory = NewsFeedResponse['slides'][number]['related'][number];

function normalize(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function meaningfulCharacters(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

function sameText(left: string, right: string): boolean {
  return (
    normalize(left)
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .toLocaleLowerCase() ===
    normalize(right)
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .toLocaleLowerCase()
  );
}

/** A compact card headline, with summary text as a useful fallback. */
export function relatedStoryTitle(story: RelatedStory): string {
  return normalize(story.title || story.label || story.excerpt || story.summary || '');
}

/** The extra prose that a card can reveal without navigating away. */
export function relatedStoryExpansion(story: RelatedStory): string {
  const title = relatedStoryTitle(story);
  const candidates = [
    story.excerpt,
    story.summary,
    story.bullets?.filter(Boolean).join('\n'),
  ];
  return (
    candidates.find((candidate) => {
      if (!candidate?.trim()) return false;
      return (
        !sameText(candidate, title) &&
        meaningfulCharacters(candidate) - meaningfulCharacters(title) > 30
      );
    }) ?? ''
  ).trim();
}

export function canExpandRelatedStory(story: RelatedStory): boolean {
  const expansion = relatedStoryExpansion(story);
  const lineCount = expansion.split('\n').filter((line) => line.trim()).length;
  return meaningfulCharacters(expansion) > 40 && lineCount > 0;
}

/** Only article-format leads promise the complete reader experience. */
export function hasRelatedStoryReader(story: RelatedStory): boolean {
  return story.format?.toUpperCase() === 'ARTICLE';
}
