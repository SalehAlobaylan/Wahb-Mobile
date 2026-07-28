import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  Share2,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { HttpError, type ArticleContent } from '@/core/api';
import { captureException } from '@/core/diagnostics/diagnostics';
import { hapticSuccess } from '@/core/haptics/feedback';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { useReducedMotion } from '@/core/ui/use-reduced-motion';
import { getInstallationId } from '@/core/identity/installation-id';
import { identityScope as toIdentityScope } from '@/core/identity/identity-scope';
import { useAuth } from '@/features/auth/auth-provider';
import { NewsNowPlayingTile } from '@/features/news/news-now-playing-tile';
import { ReportSheet } from '@/features/moderation/report-sheet';
import {
  colors,
  fontFamilies,
  layoutMetrics,
  radii,
  spacing,
  typeScale,
} from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { fontForText, useWahbTypography } from '@/design/typography';
import { goBackOrReplace } from '@/core/navigation/go-back';
import {
  getArticleCoverageContext,
  setArticleCoverageContext,
} from './article-coverage-context';

import {
  loadArticleSnapshot,
  deleteArticleSnapshot,
  loadReaderPosition,
  saveArticleSnapshot,
  saveReaderPosition,
} from './article-reader-repository';

type ReaderDocument = {
  article: ArticleContent;
  readerPosition: number;
  source: 'network' | 'offline-cache';
};

type SourcePrompt = {
  domain: string;
  url: string;
  isUnsupportedFile: boolean;
} | null;

const unsupportedSourceExtensions =
  /\.(?:pdf|docx?|xlsx?|pptx?|zip)(?:$|[?#])/i;

function readingMinutes(article: ArticleContent): number {
  const text =
    article.translated_body_text || article.body_text || article.excerpt || '';
  return Math.max(
    1,
    Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 200),
  );
}

type ContentDirection = {
  textAlign: 'left' | 'right';
  writingDirection: 'ltr' | 'rtl';
};

function directionForText(value: string | null | undefined): ContentDirection {
  const isArabic = /[\u0600-\u06FF\u0750-\u077F]/u.test(value ?? '');
  return {
    textAlign: isArabic ? 'right' : 'left',
    writingDirection: isArabic ? 'rtl' : 'ltr',
  };
}

function formatPublishedAt(
  value: string | null | undefined,
  language: string,
): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(language.startsWith('ar') ? 'ar-SA' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

function sourcePromptFor(value: string): SourcePrompt {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      return null;
    }
    return {
      domain: url.hostname,
      url: url.toString(),
      isUnsupportedFile: unsupportedSourceExtensions.test(url.pathname),
    };
  } catch {
    return null;
  }
}

export function ArticleReaderScreen({ id }: { id?: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const db = useSQLiteContext();
  const outbox = useOutbox();
  const reducedMotion = useReducedMotion();
  const { clients, subject } = useAuth();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  const scrollRef = useRef<ScrollView>(null);
  const positionRef = useRef(0);
  const lastPersistAt = useRef(0);
  const [bookmarkOverride, setBookmarkOverride] = useState<{
    contentId: string;
    value: boolean;
  } | null>(null);
  const [sourcePrompt, setSourcePrompt] = useState<SourcePrompt>(null);
  const [isReportVisible, setIsReportVisible] = useState(false);
  const installationQuery = useQuery({
    queryKey: ['installation-identity'],
    queryFn: getInstallationId,
    staleTime: Infinity,
  });
  const scope = installationQuery.data
    ? toIdentityScope(installationQuery.data, subject?.id)
    : null;
  const query = useQuery<ReaderDocument>({
    queryKey: ['article', scope, id],
    enabled: Boolean(id && scope),
    queryFn: async () => {
      const cached = await loadArticleSnapshot(db, scope!, id!);
      const readerPosition = await loadReaderPosition(db, scope!, id!);
      try {
        const article = await clients.cms.getArticleContent(id!);
        await saveArticleSnapshot(db, scope!, article);
        return { article, readerPosition, source: 'network' };
      } catch (error) {
        if (error instanceof HttpError && error.context.status === 404) {
          await deleteArticleSnapshot(db, scope!, id!);
          throw error;
        }
        if (cached) {
          return {
            article: cached.article,
            readerPosition,
            source: 'offline-cache',
          };
        }
        throw error;
      }
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }
    positionRef.current = query.data.readerPosition;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        animated: false,
        y: query.data?.readerPosition ?? 0,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [query.data]);

  useEffect(
    () => () => {
      if (id && scope) {
        void saveReaderPosition(db, scope, id, positionRef.current);
      }
    },
    [db, id, scope],
  );

  const persistPosition = useCallback(
    (offsetY: number, force = false) => {
      if (!id || !scope) {
        return;
      }
      positionRef.current = Math.max(0, offsetY);
      const now = Date.now();
      if (force || now - lastPersistAt.current >= 2_000) {
        lastPersistAt.current = now;
        void saveReaderPosition(db, scope, id, positionRef.current).catch(
          (error) => captureException('article_reader_position_failed', error),
        );
      }
    },
    [db, id, scope],
  );

  const toggleBookmark = useCallback(async () => {
    if (!query.data) {
      return;
    }
    const current =
      bookmarkOverride?.contentId === query.data.article.id
        ? bookmarkOverride.value
        : (query.data.article.is_bookmarked ?? false);
    const next = !current;
    setBookmarkOverride({ contentId: query.data.article.id, value: next });
    try {
      await outbox.enqueue({
        contentId: query.data.article.id,
        type: 'bookmark',
        operation: next ? 'create' : 'delete',
      });
      hapticSuccess();
    } catch (error) {
      setBookmarkOverride({ contentId: query.data.article.id, value: current });
      captureException('article_bookmark_enqueue_failed', error);
    }
  }, [bookmarkOverride, outbox, query.data]);

  const shareArticle = useCallback(async () => {
    if (!query.data) {
      return;
    }
    try {
      await Share.share({
        message: `https://wahb.salehspace.dev/content/${query.data.article.id}`,
        title: query.data.article.title || query.data.article.excerpt || 'Wahb',
      });
    } catch (error) {
      captureException('article_share_failed', error);
    }
  }, [query.data]);

  const requestOriginalSource = () => {
    const url = query.data?.article.original_url;
    if (!url) {
      return;
    }
    const prompt = sourcePromptFor(url);
    if (!prompt) {
      // The runtime contract permits only HTTP(S), and this further requires
      // HTTPS before handing off to the OS browser. No credentials are ever
      // attached to this request.
      setSourcePrompt({ domain: '', url: '', isUnsupportedFile: true });
      return;
    }
    setSourcePrompt(prompt);
  };

  const openOriginalSource = async () => {
    if (!sourcePrompt?.url) {
      setSourcePrompt(null);
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(sourcePrompt.url, {
        enableBarCollapsing: true,
        showTitle: true,
      });
    } catch (error) {
      captureException('article_source_browser_failed', error);
    } finally {
      setSourcePrompt(null);
    }
  };

  if (query.isPending) {
    return (
      <SafeAreaView
        style={[styles.state, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator color={colors.pressRed} />
      </SafeAreaView>
    );
  }
  if (!query.data) {
    return (
      <SafeAreaView
        style={[styles.state, { backgroundColor: theme.background }]}
      >
        <Text
          style={[
            styles.unavailable,
            { color: theme.foreground, fontFamily: font('editorial') },
          ]}
        >
          {t('article.unavailable')}
        </Text>
      </SafeAreaView>
    );
  }

  const { article } = query.data;
  const isBookmarked =
    bookmarkOverride?.contentId === article.id
      ? bookmarkOverride.value
      : (article.is_bookmarked ?? false);
  const isTranslated = Boolean(
    article.translated_body_text || article.translated_title,
  );
  const title =
    article.translated_title ||
    article.title ||
    article.excerpt ||
    t('article.untitled');
  const body =
    article.translated_body_text || article.body_text || article.excerpt || '';
  const publishedAt = formatPublishedAt(article.published_at, i18n.language);
  const coverage = getArticleCoverageContext(id);
  const titleDirection = directionForText(title);
  const sourceName = article.author || article.source_name || 'Wahb';
  const sourceDirection = directionForText(sourceName);
  const heroImage = article.thumbnail_url || article.source_image_url;
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const CoverageChevron = isRTL ? ChevronLeft : ChevronRight;
  const metadata = [
    publishedAt,
    t('article.readTime', { count: readingMinutes(article) }),
  ].filter(Boolean);

  const openCoverageMember = (
    member: NonNullable<typeof coverage>['members'][number],
  ) => {
    if (!coverage) return;
    setArticleCoverageContext(member.id, coverage);
    router.push({ pathname: '/article/[id]', params: { id: member.id } });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.background,
            borderBottomColor: theme.border,
            flexDirection: isRTL ? 'row-reverse' : 'row',
          },
        ]}
      >
        <Pressable
          accessibilityLabel={t('article.back')}
          accessibilityRole="button"
          onPress={() => goBackOrReplace('/news')}
          style={[styles.headerButton, { borderColor: theme.border }]}
          testID="article-reader-back"
        >
          <BackIcon color={theme.foreground} size={21} />
        </Pressable>
        <Text
          numberOfLines={1}
          style={[
            styles.headerTitle,
            { color: theme.foreground, fontFamily: font('bold') },
          ]}
        >
          {article.source_name || 'WAHB'}
        </Text>
        <View
          style={[
            styles.headerActions,
            { flexDirection: isRTL ? 'row-reverse' : 'row' },
          ]}
        >
          <Pressable
            accessibilityLabel={
              isBookmarked ? t('pods.removeBookmark') : t('pods.bookmark')
            }
            accessibilityRole="button"
            onPress={() => void toggleBookmark()}
            style={styles.headerAction}
          >
            <Bookmark
              color={isBookmarked ? theme.accent : theme.foreground}
              fill={isBookmarked ? theme.accent : 'transparent'}
              size={20}
            />
          </Pressable>
          <Pressable
            accessibilityLabel={t('pods.share')}
            accessibilityRole="button"
            onPress={() => void shareArticle()}
            style={styles.headerAction}
          >
            <Share2 color={theme.foreground} size={20} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layoutMetrics.pageBottom + spacing.xl },
        ]}
        onMomentumScrollEnd={(event) =>
          persistPosition(event.nativeEvent.contentOffset.y, true)
        }
        onScroll={(event) => persistPosition(event.nativeEvent.contentOffset.y)}
        ref={scrollRef}
        scrollEventThrottle={250}
      >
        {query.data.source === 'offline-cache' ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.offline,
              {
                backgroundColor: theme.muted,
                borderColor: theme.border,
                color: theme.foreground,
                fontFamily: font('bold'),
              },
            ]}
          >
            {t('article.offlineCopy')}
          </Text>
        ) : null}
        {heroImage ? (
          <Image contentFit="cover" source={heroImage} style={styles.hero} />
        ) : null}
        <View style={styles.articleIntro}>
          {isTranslated ? (
            <Text
              style={[
                styles.translation,
                {
                  color: theme.accent,
                  fontFamily: font('bold'),
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              {t('article.translationLabel', {
                language:
                  article.translation_language ||
                  t('article.translationUnknown'),
              })}
            </Text>
          ) : null}
          <Text
            style={[
              styles.title,
              {
                color: theme.foreground,
                fontFamily: fontForText(title, 'editorial'),
                ...titleDirection,
              },
            ]}
          >
            {title}
          </Text>
          <View
            style={[
              styles.byline,
              {
                borderColor: theme.border,
                flexDirection: isRTL ? 'row-reverse' : 'row',
              },
            ]}
          >
            {article.source_image_url ? (
              <Image
                contentFit="cover"
                source={article.source_image_url}
                style={[styles.sourceAvatar, { borderColor: theme.border }]}
              />
            ) : (
              <View
                style={[
                  styles.sourceAvatar,
                  styles.sourceFallback,
                  { backgroundColor: theme.muted, borderColor: theme.border },
                ]}
              >
                <Text
                  style={[
                    styles.sourceInitial,
                    {
                      color: theme.accent,
                      fontFamily: fontForText(sourceName, 'bold'),
                    },
                  ]}
                >
                  {sourceName.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.bylineCopy}>
              <Text
                numberOfLines={1}
                style={[
                  styles.sourceName,
                  {
                    color: theme.foreground,
                    fontFamily: fontForText(sourceName, 'bold'),
                    ...sourceDirection,
                  },
                ]}
              >
                {sourceName}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.meta,
                  {
                    color: theme.mutedForeground,
                    fontFamily: font('mono'),
                    textAlign: isRTL ? 'right' : 'left',
                    writingDirection: isRTL ? 'rtl' : 'ltr',
                  },
                ]}
              >
                {metadata.join(' · ')}
              </Text>
            </View>
          </View>
        </View>
        {article.original_url ? (
          <Pressable
            accessibilityRole="button"
            onPress={requestOriginalSource}
            style={[
              styles.sourceButton,
              {
                borderColor: theme.border,
                flexDirection: isRTL ? 'row-reverse' : 'row',
              },
            ]}
          >
            <ExternalLink color={theme.accent} size={17} />
            <Text
              style={[
                styles.sourceButtonLabel,
                {
                  color: theme.foreground,
                  fontFamily: font('bold'),
                  writingDirection: isRTL ? 'rtl' : 'ltr',
                },
              ]}
            >
              {t('article.originalSource')}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.bodySection}>
          {body
            .split(/\n\s*\n|\n+/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <Text
                key={`${index}-${paragraph.slice(0, 16)}`}
                style={[
                  styles.body,
                  {
                    color: theme.foreground,
                    fontFamily: fontForText(paragraph, 'body'),
                    ...directionForText(paragraph),
                  },
                ]}
              >
                {paragraph}
              </Text>
            ))}
        </View>
        {coverage?.members.length ? (
          <View style={[styles.coverage, { borderTopColor: theme.border }]}>
            <Text
              style={[
                styles.coverageLabel,
                { color: theme.accent, fontFamily: font('bold') },
              ]}
            >
              {t('news.coveredBy', { count: coverage.members.length })}
            </Text>
            {coverage.members
              .filter((member) => member.id !== article.id)
              .slice(0, 3)
              .map((member) => (
                <Pressable
                  accessibilityRole="button"
                  key={member.id}
                  onPress={() => openCoverageMember(member)}
                  style={[
                    styles.coverageCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                    },
                  ]}
                >
                  <View style={styles.coverageCopy}>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.coverageTitle,
                        {
                          color: theme.foreground,
                          fontFamily: fontForText(
                            member.title || member.source_name,
                            'editorial',
                          ),
                          ...directionForText(
                            member.title || member.source_name,
                          ),
                        },
                      ]}
                    >
                      {member.title || member.source_name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.coverageSource,
                        {
                          color: theme.mutedForeground,
                          fontFamily: fontForText(member.source_name, 'mono'),
                          ...directionForText(member.source_name),
                        },
                      ]}
                    >
                      {member.source_name}
                    </Text>
                  </View>
                  <CoverageChevron color={theme.mutedForeground} size={18} />
                </Pressable>
              ))}
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={t('moderation.report')}
          accessibilityRole="button"
          onPress={() => setIsReportVisible(true)}
          style={[
            styles.reportAction,
            {
              borderColor: theme.border,
              flexDirection: isRTL ? 'row-reverse' : 'row',
            },
          ]}
        >
          <Flag color={theme.mutedForeground} size={17} />
          <Text
            style={[
              styles.reportLabel,
              {
                color: theme.mutedForeground,
                fontFamily: font('medium'),
                writingDirection: isRTL ? 'rtl' : 'ltr',
              },
            ]}
          >
            {t('moderation.report')}
          </Text>
        </Pressable>
      </ScrollView>
      <View
        pointerEvents="box-none"
        style={[
          styles.nowPlaying,
          { alignItems: isRTL ? 'flex-start' : 'flex-end' },
        ]}
      >
        <NewsNowPlayingTile />
      </View>
      <Modal
        animationType={reducedMotion ? 'none' : 'fade'}
        onRequestClose={() => setSourcePrompt(null)}
        transparent
        visible={Boolean(sourcePrompt)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            onPress={() => setSourcePrompt(null)}
            style={styles.scrim}
          />
          <View style={styles.dialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>
                {t('article.originalSource')}
              </Text>
              <Pressable
                accessibilityLabel={t('article.close')}
                accessibilityRole="button"
                onPress={() => setSourcePrompt(null)}
                style={styles.close}
              >
                <X color={colors.ink} size={20} />
              </Pressable>
            </View>
            <Text style={styles.dialogCopy}>
              {sourcePrompt?.url
                ? sourcePrompt.isUnsupportedFile
                  ? t('article.unsupportedSource', {
                      domain: sourcePrompt.domain,
                    })
                  : t('article.openSourceCopy', { domain: sourcePrompt.domain })
                : t('article.unsafeSource')}
            </Text>
            {sourcePrompt?.url ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void openOriginalSource()}
                style={styles.openSource}
              >
                <Text style={styles.openSourceText}>
                  {t('article.openSource')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
      <ReportSheet
        onClose={() => setIsReportVisible(false)}
        onReported={() => {
          setIsReportVisible(false);
          // Reporting removes this article from the active reader immediately;
          // its independent History record remains intact.
          goBackOrReplace('/news');
        }}
        target={isReportVisible ? { id: article.id, type: 'content' } : null}
        visible={isReportVisible}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 },
  state: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  unavailable: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    ...typeScale.featureTitle,
    textAlign: 'center',
  },
  content: {
    paddingBottom: layoutMetrics.pageBottom,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-between',
    paddingHorizontal: layoutMetrics.pageGutter,
  },
  headerButton: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: { ...typeScale.label, letterSpacing: 0.8, maxWidth: '42%' },
  headerActions: { alignItems: 'center', gap: spacing.xs, minWidth: 80 },
  headerAction: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  offline: {
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
    marginHorizontal: layoutMetrics.pageGutter,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  hero: {
    backgroundColor: colors.card,
    height: 220,
    marginTop: spacing.sm,
    width: '100%',
  },
  articleIntro: {
    paddingBottom: spacing.sm,
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingTop: spacing.lg,
  },
  translation: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    ...typeScale.readerTitle,
    marginTop: spacing.xs,
  },
  byline: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  sourceAvatar: {
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 40,
    overflow: 'hidden',
    width: 40,
  },
  sourceFallback: { alignItems: 'center', justifyContent: 'center' },
  sourceInitial: { ...typeScale.heading },
  bylineCopy: { flex: 1, minWidth: 0 },
  sourceName: { ...typeScale.body, fontWeight: '700' },
  meta: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.mono,
    ...typeScale.meta,
    marginTop: 2,
  },
  sourceButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  sourceButtonLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
  },
  body: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 17,
    lineHeight: 30,
    marginBottom: spacing.md,
  },
  bodySection: {
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingTop: spacing.lg,
  },
  coverage: {
    borderTopWidth: 1,
    marginHorizontal: layoutMetrics.pageGutter,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  coverageLabel: {
    ...typeScale.meta,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  coverageCard: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 72,
    padding: spacing.sm,
  },
  coverageCopy: { flex: 1, minWidth: 0 },
  coverageTitle: { ...typeScale.cardTitle },
  coverageSource: { ...typeScale.label, marginTop: 4 },
  reportAction: {
    alignItems: 'center',
    alignSelf: 'center',
    borderBottomWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.xl,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  reportLabel: { ...typeScale.meta },
  nowPlaying: {
    bottom: spacing.md,
    left: layoutMetrics.pageGutter,
    pointerEvents: 'box-none',
    position: 'absolute',
    right: layoutMetrics.pageGutter,
  },
  modalRoot: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(26,26,26,0.48)' },
  dialog: {
    backgroundColor: colors.paper,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    padding: spacing.md,
  },
  dialogHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dialogTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    ...typeScale.heading,
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  dialogCopy: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    ...typeScale.bodyLarge,
    marginTop: spacing.sm,
  },
  openSource: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.compact,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  openSourceText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.body,
  },
});
