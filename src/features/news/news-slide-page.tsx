import { Image } from 'expo-image';
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Clock3,
  Heart,
  Layers3,
  Share2,
  Tag,
  TrendingUp,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { NewsFeedResponse } from '@/core/api';
import { captureException } from '@/core/diagnostics/diagnostics';
import { hapticSuccess, hapticWarning } from '@/core/haptics/feedback';
import { useOutbox } from '@/core/outbox/outbox-provider';
import {
  colors,
  componentMetrics,
  fontFamilies,
  layoutMetrics,
  radii,
  spacing,
  typeScale,
} from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { fontForText, useWahbTypography } from '@/design/typography';

import {
  canExpandRelatedStory,
  hasRelatedStoryReader,
  relatedStoryExpansion,
  relatedStoryTitle,
} from './related-story-model';

type NewsSlide = NewsFeedResponse['slides'][number];

type Props = {
  slide: NewsSlide;
  index: number;
  pageHeight: number;
  contentTopPadding: number;
  contentBottomPadding: number;
  onOpenStory: (
    storyId: string,
    leadId: string,
    coverage?: NewsSlide['featured'],
  ) => void;
  onOpenCoverage: (story: NewsSlide['featured']) => void;
};

function relativeStoryTime(value: string, locale: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  const isArabic = locale.startsWith('ar');
  if (seconds < 60) return isArabic ? 'الآن' : 'now';

  const units = [
    { seconds: 31_536_000, en: 'y', ar: 'س' },
    { seconds: 2_592_000, en: 'mo', ar: 'ش' },
    { seconds: 604_800, en: 'w', ar: 'أ' },
    { seconds: 86_400, en: 'd', ar: 'ي' },
    { seconds: 3_600, en: 'h', ar: 'س' },
    { seconds: 60, en: 'm', ar: 'د' },
  ];
  const unit = units.find((candidate) => seconds >= candidate.seconds);
  if (!unit) return isArabic ? 'الآن' : 'now';
  const count = Math.floor(seconds / unit.seconds);
  return isArabic ? `منذ ${count}${unit.ar}` : `${count}${unit.en} ago`;
}

function lifecycleKey(
  lifecycle: string,
): 'breaking' | 'cooling' | 'historical' | null {
  if (lifecycle === 'breaking') return 'breaking';
  if (lifecycle === 'cooling') return 'cooling';
  if (lifecycle === 'historical') return 'historical';
  return null;
}

function contentTextDirection(value: string | undefined) {
  const isArabic = /[\u0600-\u06FF\u0750-\u077F]/u.test(value ?? '');
  return {
    textAlign: isArabic ? ('right' as const) : ('left' as const),
    writingDirection: isArabic ? ('rtl' as const) : ('ltr' as const),
  };
}

export function NewsSlidePage({
  slide,
  index,
  pageHeight,
  contentTopPadding,
  contentBottomPadding,
  onOpenStory,
  onOpenCoverage,
}: Props) {
  const { t, i18n } = useTranslation();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  const outbox = useOutbox();
  const [expandedRelatedId, setExpandedRelatedId] = useState<string | null>(
    null,
  );
  const [engagement, setEngagement] = useState<
    Record<string, { bookmarked?: boolean; liked?: boolean }>
  >({});
  const digest = slide.featured.bullets?.filter(Boolean).slice(0, 2) ?? [];
  const lifecycle = lifecycleKey(slide.featured.lifecycle);
  const storyTime = relativeStoryTime(
    slide.featured.published_at,
    i18n.language,
  );
  const engaged = (
    story: NewsSlide['featured'] | NewsSlide['related'][number],
    kind: 'like' | 'bookmark',
  ) =>
    kind === 'like'
      ? (engagement[story.lead_id]?.liked ?? story.is_liked)
      : (engagement[story.lead_id]?.bookmarked ?? story.is_bookmarked);
  const toggleEngagement = async (
    story: NewsSlide['featured'] | NewsSlide['related'][number],
    kind: 'like' | 'bookmark',
  ) => {
    const current = engaged(story, kind);
    const next = !current;
    setEngagement((existing) => ({
      ...existing,
      [story.lead_id]: {
        ...existing[story.lead_id],
        ...(kind === 'like' ? { liked: next } : { bookmarked: next }),
      },
    }));
    try {
      await outbox.enqueue({
        contentId: story.lead_id,
        type: kind,
        operation: next ? 'create' : 'delete',
      });
      hapticSuccess();
    } catch (error) {
      setEngagement((existing) => ({
        ...existing,
        [story.lead_id]: {
          ...existing[story.lead_id],
          ...(kind === 'like' ? { liked: current } : { bookmarked: current }),
        },
      }));
      captureException('news_engagement_queue_failed', error, { kind });
      hapticWarning();
    }
  };
  const shareStory = async (
    story: NewsSlide['featured'] | NewsSlide['related'][number],
  ) => {
    try {
      await Share.share({
        message: `https://wahb.salehspace.dev/content/${story.lead_id}`,
        title: story.title || story.label || 'Wahb',
      });
      hapticSuccess();
    } catch (error) {
      captureException('news_share_failed', error);
      hapticWarning();
    }
  };
  const featuredLiked = engaged(slide.featured, 'like');
  const featuredBookmarked = engaged(slide.featured, 'bookmark');
  return (
    <View
      accessibilityRole="summary"
      testID={`news-slide-${index}`}
      style={[styles.page, { height: pageHeight }]}
    >
      <View
        style={[
          styles.content,
          {
            height: pageHeight,
            paddingBottom: contentBottomPadding,
            paddingTop: contentTopPadding,
          },
        ]}
        testID={`news-slide-content-${index}`}
      >
        <Text
          style={[
            styles.eyebrow,
            { color: theme.accent, fontFamily: font('bold') },
          ]}
        >
          {t('news.feedLabel')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            onOpenStory(
              slide.featured.story_id,
              slide.featured.lead_id,
              slide.featured,
            )
          }
          style={[styles.featured, { borderBottomColor: theme.border }]}
        >
          {slide.featured.thumbnail_url ? (
            <View style={styles.heroFrame}>
              <Image
                contentFit="cover"
                source={slide.featured.thumbnail_url}
                style={styles.hero}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenCoverage(slide.featured)}
                style={styles.coverageOverlay}
              >
                <Layers3 color={colors.inkInverse} size={12} />
                <Text
                  style={[
                    styles.coverageOverlayText,
                    { fontFamily: font('bold') },
                  ]}
                >
                  {t('news.coveredBy', {
                    count:
                      slide.featured.source_count ||
                      slide.featured.member_count,
                  })}
                </Text>
              </Pressable>
            </View>
          ) : slide.featured.source_image_url ? (
            <View
              style={[
                styles.sourceStrip,
                isRTL && styles.rowRtl,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Image
                contentFit="cover"
                source={slide.featured.source_image_url}
                style={styles.sourceImage}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.sourceStripName,
                  {
                    color: theme.mutedForeground,
                    ...contentTextDirection(slide.featured.source_name),
                    fontFamily: font('bold'),
                  },
                ]}
              >
                {slide.featured.source_name}
              </Text>
            </View>
          ) : null}
          <Text
            numberOfLines={2}
            style={[
              styles.headline,
              {
                color: theme.foreground,
                ...contentTextDirection(
                  slide.featured.title || slide.featured.label,
                ),
                fontFamily: fontForText(
                  slide.featured.title || slide.featured.label,
                  'editorial',
                ),
              },
            ]}
          >
            {slide.featured.title || slide.featured.label}
          </Text>
          {digest.length ? (
            <View style={styles.digest}>
              {digest.map((point) => (
                <View
                  key={point}
                  style={[styles.digestRow, isRTL && styles.rowRtl]}
                >
                  <View
                    style={[
                      styles.digestDot,
                      { backgroundColor: theme.accent },
                    ]}
                  />
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.digestText,
                      {
                        color: theme.mutedForeground,
                        ...contentTextDirection(point),
                        fontFamily: fontForText(point, 'body'),
                      },
                    ]}
                  >
                    {point}
                  </Text>
                </View>
              ))}
            </View>
          ) : !!slide.featured.excerpt ? (
            <Text
              numberOfLines={2}
              style={[
                styles.excerpt,
                {
                  color: theme.mutedForeground,
                  ...contentTextDirection(slide.featured.excerpt),
                  fontFamily: fontForText(slide.featured.excerpt, 'body'),
                },
              ]}
            >
              {slide.featured.excerpt}
            </Text>
          ) : null}
          <View style={[styles.storyBadges, isRTL && styles.rowRtl]}>
            {!!slide.featured.category && (
              <View
                style={[
                  styles.storyBadge,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Tag color={theme.accent} size={12} />
                <Text
                  style={[
                    styles.storyBadgeText,
                    { color: theme.foreground, fontFamily: font('bold') },
                  ]}
                >
                  {slide.featured.category}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.storyBadge,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Clock3 color={theme.accent} size={12} />
              <Text
                style={[
                  styles.storyBadgeText,
                  { color: theme.mutedForeground, fontFamily: font('medium') },
                ]}
              >
                {t('news.updated', { time: storyTime })}
              </Text>
            </View>
            {lifecycle ? (
              <View
                style={[
                  styles.storyBadge,
                  {
                    backgroundColor: `${theme.accent}1A`,
                    borderColor: `${theme.accent}40`,
                  },
                ]}
              >
                <TrendingUp color={theme.accent} size={12} />
                <Text
                  style={[
                    styles.storyBadgeText,
                    { color: theme.accent, fontFamily: font('bold') },
                  ]}
                >
                  {t(`news.lifecycle.${lifecycle}`)}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
        <View
          style={[
            styles.featuredFooter,
            isRTL && styles.rowRtl,
            { borderBottomColor: theme.border },
          ]}
        >
          <View style={[styles.sourceMeta, isRTL && styles.rowRtl]}>
            {slide.featured.source_image_url ? (
              <Image
                contentFit="cover"
                source={slide.featured.source_image_url}
                style={[styles.sourceAvatar, { borderColor: theme.border }]}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                styles.sourceName,
                {
                  color: theme.mutedForeground,
                  ...contentTextDirection(slide.featured.source_name),
                  fontFamily: font('body'),
                },
              ]}
            >
              {slide.featured.source_name}
            </Text>
          </View>
          <View style={[styles.featuredActions, isRTL && styles.rowRtl]}>
            <Pressable
              accessibilityLabel={
                featuredLiked ? t('foryou.unlike') : t('foryou.like')
              }
              accessibilityRole="button"
              accessibilityState={{ selected: featuredLiked }}
              onPress={() => void toggleEngagement(slide.featured, 'like')}
              style={styles.featuredAction}
            >
              <Heart
                color={featuredLiked ? theme.accent : theme.mutedForeground}
                fill={featuredLiked ? theme.accent : 'transparent'}
                size={18}
              />
              <Text
                style={[
                  styles.featuredActionCount,
                  { color: theme.mutedForeground, fontFamily: font('mono') },
                ]}
              >
                {slide.featured.like_count +
                  Number(featuredLiked) -
                  Number(slide.featured.is_liked)}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={
                featuredBookmarked
                  ? t('foryou.removeBookmark')
                  : t('foryou.bookmark')
              }
              accessibilityRole="button"
              accessibilityState={{ selected: featuredBookmarked }}
              onPress={() => void toggleEngagement(slide.featured, 'bookmark')}
              style={styles.featuredAction}
            >
              <Bookmark
                color={
                  featuredBookmarked ? theme.accent : theme.mutedForeground
                }
                fill={featuredBookmarked ? theme.accent : 'transparent'}
                size={18}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={t('foryou.share')}
              accessibilityRole="button"
              onPress={() => void shareStory(slide.featured)}
              style={styles.featuredAction}
            >
              <Share2 color={theme.mutedForeground} size={18} />
            </Pressable>
          </View>
        </View>
        <Text
          style={[
            styles.relatedLabel,
            { color: theme.foreground, fontFamily: font('bold') },
          ]}
        >
          {t('news.related')}
        </Text>
        {slide.related.length ? (
          slide.related.slice(0, 3).map((story) => {
            const canExpand = canExpandRelatedStory(story);
            const expanded = expandedRelatedId === story.story_id;
            const canOpenReader = hasRelatedStoryReader(story);
            const title = relatedStoryTitle(story);
            const expansion = relatedStoryExpansion(story);
            const ReaderArrow = isRTL ? ChevronLeft : ChevronRight;
            const liked = engaged(story, 'like');
            const bookmarked = engaged(story, 'bookmark');
            const relatedImage = story.thumbnail_url ?? story.source_image_url;
            return (
              <View
                key={story.story_id}
                style={[
                  styles.related,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[styles.relatedHeader, isRTL && styles.relatedRtl]}
                >
                  <Pressable
                    accessibilityLabel={
                      canExpand ? t('news.expandRelated', { title }) : undefined
                    }
                    accessibilityRole={canExpand ? 'button' : undefined}
                    disabled={!canExpand}
                    onPress={() =>
                      setExpandedRelatedId((current) =>
                        current === story.story_id ? null : story.story_id,
                      )
                    }
                    style={[styles.relatedMain, isRTL && styles.relatedMainRtl]}
                  >
                    <View style={styles.relatedCopy}>
                      <View
                        style={[styles.relatedKicker, isRTL && styles.rowRtl]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.relatedFormat,
                            {
                              color: theme.accent,
                              fontFamily: font('bold'),
                              textAlign: isRTL ? 'right' : 'left',
                            },
                          ]}
                        >
                          {story.format || story.source || t('news.feedLabel')}
                        </Text>
                        <View
                          style={[
                            styles.relatedTime,
                            isRTL
                              ? styles.relatedTimeRtl
                              : styles.relatedTimeLtr,
                          ]}
                        >
                          <Clock3 color={theme.mutedForeground} size={10} />
                          <Text
                            style={[
                              styles.relatedTimeText,
                              {
                                color: theme.mutedForeground,
                                fontFamily: font('mono'),
                              },
                            ]}
                          >
                            {relativeStoryTime(
                              story.published_at,
                              i18n.language,
                            )}
                          </Text>
                        </View>
                      </View>
                      <Text
                        numberOfLines={expanded ? undefined : 2}
                        style={[
                          styles.relatedTitle,
                          {
                            color: theme.foreground,
                            fontFamily: fontForText(title, 'editorial'),
                            ...contentTextDirection(title),
                          },
                        ]}
                      >
                        {title}
                      </Text>
                    </View>
                    {relatedImage ? (
                      <Image
                        contentFit="cover"
                        source={relatedImage}
                        style={styles.relatedImage}
                      />
                    ) : (
                      <View
                        style={[
                          styles.relatedImage,
                          {
                            backgroundColor: theme.card,
                            borderColor: theme.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.relatedImageFallback,
                            { color: theme.accent, fontFamily: font('bold') },
                          ]}
                        >
                          {(story.source_name || story.source || 'W')
                            .trim()
                            .slice(0, 1)
                            .toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  <View
                    style={[
                      styles.relatedActions,
                      isRTL && styles.relatedActionsRtl,
                    ]}
                  >
                    <Pressable
                      accessibilityLabel={
                        liked ? t('foryou.unlike') : t('foryou.like')
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: liked }}
                      hitSlop={6}
                      onPress={() => void toggleEngagement(story, 'like')}
                      style={styles.relatedAction}
                    >
                      <Heart
                        color={liked ? theme.accent : theme.mutedForeground}
                        fill={liked ? theme.accent : 'transparent'}
                        size={15}
                      />
                      <Text
                        style={[
                          styles.relatedActionCount,
                          {
                            color: theme.mutedForeground,
                            fontFamily: font('mono'),
                          },
                        ]}
                      >
                        {story.like_count +
                          Number(liked) -
                          Number(story.is_liked)}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={
                        bookmarked
                          ? t('foryou.removeBookmark')
                          : t('foryou.bookmark')
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: bookmarked }}
                      hitSlop={6}
                      onPress={() => void toggleEngagement(story, 'bookmark')}
                      style={styles.relatedAction}
                    >
                      <Bookmark
                        color={
                          bookmarked ? theme.accent : theme.mutedForeground
                        }
                        fill={bookmarked ? theme.accent : 'transparent'}
                        size={15}
                      />
                    </Pressable>
                  </View>
                  {canOpenReader ? (
                    <Pressable
                      accessibilityLabel={t('news.openReader', { title })}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => onOpenStory(story.story_id, story.lead_id)}
                      style={[
                        styles.readerButton,
                        isRTL && styles.readerButtonRtl,
                      ]}
                    >
                      <ReaderArrow color={theme.mutedForeground} size={18} />
                    </Pressable>
                  ) : null}
                </View>
                {expanded ? (
                  <View
                    style={[
                      styles.relatedExpandedPanel,
                      { borderTopColor: theme.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.relatedExpansion,
                        {
                          color: theme.mutedForeground,
                          fontFamily: fontForText(expansion, 'body'),
                          ...contentTextDirection(expansion),
                        },
                      ]}
                    >
                      {expansion}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text
            style={[
              styles.noRelated,
              { color: theme.mutedForeground, fontFamily: font('body') },
            ]}
          >
            {t('news.noRelated')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { overflow: 'hidden', width: '100%' },
  content: {
    overflow: 'hidden',
    paddingHorizontal: layoutMetrics.pageGutter,
  },
  eyebrow: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  featured: {
    paddingBottom: 0,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radii.compact,
    height: 178,
    width: '100%',
  },
  heroFrame: { position: 'relative' },
  coverageOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(12,12,12,0.78)',
    borderColor: 'rgba(248,245,242,0.8)',
    borderRadius: radii.compact,
    borderWidth: 1,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    position: 'absolute',
    right: spacing.sm,
  },
  coverageOverlayText: { color: colors.inkInverse, ...typeScale.micro },
  sourceStrip: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 52,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  sourceImage: { borderRadius: radii.compact, height: 34, width: 34 },
  sourceStripName: { ...typeScale.meta, flex: 1 },
  storyBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: spacing.sm,
  },
  storyBadge: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    minHeight: 24,
    paddingHorizontal: 6,
  },
  storyBadgeText: { ...typeScale.micro },
  headline: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    ...typeScale.heading,
    marginTop: spacing.xs,
  },
  excerpt: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    ...typeScale.body,
    marginTop: spacing.sm,
  },
  digest: { gap: 2, marginTop: spacing.xs },
  digestRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 6 },
  digestDot: { borderRadius: radii.round, height: 4, marginTop: 8, width: 4 },
  digestText: { ...typeScale.body, flex: 1 },
  featuredFooter: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    minHeight: componentMetrics.compactControl,
    paddingBottom: spacing.xs,
  },
  featuredActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 0,
  },
  rowRtl: { flexDirection: 'row-reverse' },
  featuredAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 32,
    justifyContent: 'center',
  },
  featuredActionCount: { ...typeScale.label },
  coverageButton: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 24,
    paddingHorizontal: 6,
  },
  coverageButtonText: { ...typeScale.label },
  sourceMeta: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    minWidth: 0,
  },
  sourceAvatar: {
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 22,
    width: 22,
  },
  sourceName: { ...typeScale.meta, flexShrink: 1, maxWidth: 74 },
  relatedLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
    letterSpacing: 1.2,
    // The featured action rail already establishes the section boundary.
    // Adding another top gap makes "Related" look detached and wastes a
    // noticeable slice of the fixed-height news page.
    marginTop: 0,
  },
  related: {
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    marginTop: spacing.xs,
    padding: 10,
  },
  relatedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    position: 'relative',
  },
  relatedRtl: { flexDirection: 'row-reverse' },
  relatedMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row-reverse',
    gap: spacing.md,
  },
  relatedMainRtl: { flexDirection: 'row' },
  relatedCopy: {
    flex: 1,
    justifyContent: 'flex-start',
    minWidth: 0,
    paddingBottom: 26,
  },
  relatedKicker: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: 3,
    position: 'relative',
  },
  relatedFormat: {
    fontSize: 8,
    letterSpacing: 0.7,
    lineHeight: 11,
    maxWidth: '65%',
  },
  relatedTime: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    position: 'absolute',
  },
  relatedTimeLtr: { right: 0 },
  relatedTimeRtl: { left: 0, flexDirection: 'row-reverse' },
  relatedTimeText: { ...typeScale.micro },
  relatedTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 14,
    lineHeight: 20,
  },
  relatedExpansion: {
    ...typeScale.body,
    lineHeight: 19,
  },
  relatedExpandedPanel: {
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
  },
  relatedImage: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  relatedImageFallback: { fontSize: 20 },
  readerButton: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    position: 'absolute',
    right: 0,
  },
  readerButtonRtl: { left: 0, right: undefined },
  relatedActions: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    position: 'absolute',
    right: 28,
  },
  relatedActionsRtl: { left: 28, right: undefined },
  relatedAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 24,
  },
  relatedActionCount: { ...typeScale.micro },
  noRelated: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    marginTop: spacing.sm,
  },
});
