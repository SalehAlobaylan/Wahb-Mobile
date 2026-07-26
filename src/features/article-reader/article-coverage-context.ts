import type { NewsFeedResponse } from '@/core/api';

type CoverageMember =
  NewsFeedResponse['slides'][number]['featured']['members'][number];

export type ArticleCoverageContext = {
  storyId: string;
  members: readonly CoverageMember[];
};

// This is intentionally ephemeral. The reader remains independently usable
// from History, links, and offline cache; coverage is only extra context when
// a person arrives from a News slide in this app session.
let currentCoverage: {
  articleId: string;
  value: ArticleCoverageContext;
} | null = null;

export function setArticleCoverageContext(
  articleId: string,
  value: ArticleCoverageContext,
): void {
  currentCoverage = { articleId, value };
}

export function getArticleCoverageContext(
  articleId?: string,
): ArticleCoverageContext | null {
  const coverage = currentCoverage;
  if (!coverage || coverage.articleId !== articleId) return null;
  return coverage.value;
}
