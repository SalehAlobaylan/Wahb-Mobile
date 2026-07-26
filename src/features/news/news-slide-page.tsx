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
            <Image
              contentFit="cover"
              source={slide.featured.thumbnail_url}
              style={styles.hero}
            />
          ) : slide.featured.source_image_url ? (
            <View
              style={[
                styles.sourceStrip,
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
                  { color: theme.mutedForeground, fontFamily: font('bold') },
                ]}
              >
                {slide.featured.source_name}
              </Text>
            </View>
          ) : null}
          <View style={styles.storyBadges}>
            {!!slide.featured.category && (
              <View style={[styles.storyBadge, { borderColor: theme.border }]}>
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
            {lifecycle ? (
              <View
                style={[
                  styles.storyBadge,
                  {
                    backgroundColor: `${theme.accent}1A`,
                    borderColor: theme.accent,
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
          <Text
            numberOfLines={2}
            style={[
              styles.headline,
              {
                color: theme.foreground,
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
                <View key={point} style={styles.digestRow}>
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
                  fontFamily: fontForText(slide.featured.excerpt, 'body'),
                },
              ]}
            >
              {slide.featured.excerpt}
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.featuredFooter}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenCoverage(slide.featured)}
            style={[styles.coverageButton, { borderColor: theme.border }]}
          >
            <Layers3 color={theme.accent} size={15} />
            <Text
              style={[
                styles.coverageButtonText,
                { color: theme.foreground, fontFamily: font('bold') },
              ]}
            >
              {t('news.coveredBy', {
                count:
                  slide.featured.source_count || slide.featured.member_count,
              })}
            </Text>
          </Pressable>
          <View style={styles.sourceMeta}>
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
                { color: theme.mutedForeground, fontFamily: font('body') },
              ]}
            >
              {slide.featured.source_name}
            </Text>
            <Clock3 color={theme.mutedForeground} size={11} />
            <Text
              style={[
                styles.storyTime,
                { color: theme.mutedForeground, fontFamily: font('mono') },
              ]}
            >
              {storyTime}
            </Text>
          </View>
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
              color={featuredBookmarked ? theme.accent : theme.mutedForeground}
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
            return (
              <View
                key={story.story_id}
                style={[
                  styles.related,
                  isRTL && styles.relatedRtl,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
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
                          { color: theme.accent, fontFamily: font('bold') },
                        ]}
                      >
                        {story.format || story.source || t('news.feedLabel')}
                      </Text>
                      <View style={styles.relatedTime}>
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
                          {relativeStoryTime(story.published_at, i18n.language)}
                        </Text>
                      </View>
                    </View>
                    <Text
                      numberOfLines={expanded ? 4 : 2}
                      style={[
                        styles.relatedTitle,
                        {
                          color: theme.foreground,
                          fontFamily: fontForText(title, 'editorial'),
                          textAlign: isRTL ? 'right' : 'left',
                        },
                      ]}
                    >
                      {title}
                    </Text>
                    {expanded ? (
                      <Text
                        numberOfLines={4}
                        style={[
                          styles.relatedExpansion,
                          {
                            color: theme.mutedForeground,
                            fontFamily: fontForText(expansion, 'body'),
                            textAlign: isRTL ? 'right' : 'left',
                          },
                        ]}
                      >
                        {expansion}
                      </Text>
                    ) : null}
                    <Text
                      style={[
                        styles.relatedMeta,
                        {
                          color: theme.mutedForeground,
                          fontFamily: font('mono'),
                          textAlign: isRTL ? 'right' : 'left',
                        },
                      ]}
                    >
                      {story.source_name
                        ? `${story.source_name} · ${story.member_count} ${t('news.members')}`
                        : `${story.member_count} ${t('news.members')}`}
                    </Text>
                  </View>
                  {story.thumbnail_url ? (
                    <Image
                      contentFit="cover"
                      source={story.thumbnail_url}
                      style={styles.relatedImage}
                    />
                  ) : null}
                </Pressable>
                <View style={styles.relatedActions}>
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
                      color={bookmarked ? theme.accent : theme.mutedForeground}
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
                    style={styles.readerButton}
                  >
                    <ReaderArrow color={theme.mutedForeground} size={18} />
                  </Pressable>
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
    borderBottomWidth: 1,
    paddingBottom: spacing.sm,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radii.compact,
    height: 178,
    width: '100%',
  },
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
    marginTop: spacing.xs,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    minHeight: componentMetrics.compactControl,
  },
  featuredActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: 0,
  },
  rowRtl: { flexDirection: 'row-reverse' },
  featuredAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: componentMetrics.compactControl,
    justifyContent: 'center',
  },
  featuredActionCount: { ...typeScale.label },
  coverageButton: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  coverageButtonText: { ...typeScale.label },
  storyTime: { ...typeScale.micro },
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
    height: 18,
    width: 18,
  },
  sourceName: { ...typeScale.meta, flexShrink: 1, maxWidth: 74 },
  relatedLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
    letterSpacing: 1.2,
    marginTop: spacing.sm,
  },
  related: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    // LTR: image at left, reader arrow at right. RTL flips those physical
    // endpoints: image at right, reader arrow at left.
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.xs,
    minHeight: 54,
    padding: 6,
  },
  relatedRtl: { flexDirection: 'row-reverse' },
  relatedMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row-reverse',
    gap: 6,
  },
  relatedMainRtl: { flexDirection: 'row' },
  relatedCopy: { flex: 1 },
  relatedKicker: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  relatedFormat: { ...typeScale.micro, flex: 1, letterSpacing: 0.6 },
  relatedTime: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  relatedTimeText: { ...typeScale.micro },
  relatedTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    ...typeScale.cardTitle,
  },
  relatedMeta: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.mono,
    ...typeScale.label,
    marginTop: 3,
  },
  relatedExpansion: {
    ...typeScale.body,
    lineHeight: 19,
    marginTop: 4,
  },
  relatedImage: {
    backgroundColor: colors.card,
    height: 44,
    width: 60,
  },
  readerButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: componentMetrics.compactControl,
  },
  relatedActions: { gap: 2 },
  relatedAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 22,
  },
  relatedActionCount: { ...typeScale.micro },
  noRelated: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    marginTop: spacing.sm,
  },
});
