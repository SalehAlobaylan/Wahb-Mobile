import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Share2,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { createServiceClients, type ArticleContent } from '@/core/api';
import { captureException } from '@/core/diagnostics/diagnostics';
import { hapticSuccess } from '@/core/haptics/feedback';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

import {
  loadArticleSnapshot,
  loadReaderPosition,
  saveArticleSnapshot,
  saveReaderPosition,
} from './article-reader-repository';

const { cms } = createServiceClients();

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

function formatPublishedAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
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
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const outbox = useOutbox();
  const scrollRef = useRef<ScrollView>(null);
  const positionRef = useRef(0);
  const lastPersistAt = useRef(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [sourcePrompt, setSourcePrompt] = useState<SourcePrompt>(null);
  const query = useQuery<ReaderDocument>({
    queryKey: ['article', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const cached = await loadArticleSnapshot(db, id!);
      const readerPosition = await loadReaderPosition(db, id!);
      try {
        const article = await cms.getArticleContent(id!);
        await saveArticleSnapshot(db, article);
        return { article, readerPosition, source: 'network' };
      } catch (error) {
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

  useEffect(() => {
    setIsBookmarked(query.data?.article.is_bookmarked ?? false);
  }, [query.data?.article.id, query.data?.article.is_bookmarked]);

  useEffect(
    () => () => {
      if (id) {
        void saveReaderPosition(db, id, positionRef.current);
      }
    },
    [db, id],
  );

  const persistPosition = useCallback(
    (offsetY: number, force = false) => {
      if (!id) {
        return;
      }
      positionRef.current = Math.max(0, offsetY);
      const now = Date.now();
      if (force || now - lastPersistAt.current >= 2_000) {
        lastPersistAt.current = now;
        void saveReaderPosition(db, id, positionRef.current).catch((error) =>
          captureException('article_reader_position_failed', error),
        );
      }
    },
    [db, id],
  );

  const toggleBookmark = useCallback(async () => {
    if (!query.data) {
      return;
    }
    const next = !isBookmarked;
    setIsBookmarked(next);
    try {
      await outbox.enqueue({
        contentId: query.data.article.id,
        type: 'bookmark',
        operation: next ? 'create' : 'delete',
      });
      hapticSuccess();
    } catch (error) {
      setIsBookmarked(!next);
      captureException('article_bookmark_enqueue_failed', error);
    }
  }, [isBookmarked, outbox, query.data]);

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
      <SafeAreaView style={styles.state}>
        <ActivityIndicator color={colors.pressRed} />
      </SafeAreaView>
    );
  }
  if (!query.data) {
    return (
      <SafeAreaView style={styles.state}>
        <Text style={styles.unavailable}>{t('article.unavailable')}</Text>
      </SafeAreaView>
    );
  }

  const { article } = query.data;
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
  const publishedAt = formatPublishedAt(article.published_at);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        onMomentumScrollEnd={(event) =>
          persistPosition(event.nativeEvent.contentOffset.y, true)
        }
        onScroll={(event) => persistPosition(event.nativeEvent.contentOffset.y)}
        ref={scrollRef}
        scrollEventThrottle={250}
      >
        <View style={styles.topRow}>
          <Pressable
            accessibilityLabel={t('article.back')}
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.iconButton}
          >
            <ArrowLeft color={colors.ink} size={22} />
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={
                isBookmarked ? t('foryou.removeBookmark') : t('foryou.bookmark')
              }
              accessibilityRole="button"
              onPress={() => void toggleBookmark()}
              style={styles.iconButton}
            >
              <Bookmark
                color={colors.ink}
                fill={isBookmarked ? colors.ink : 'transparent'}
                size={20}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={t('foryou.share')}
              accessibilityRole="button"
              onPress={() => void shareArticle()}
              style={styles.iconButton}
            >
              <Share2 color={colors.ink} size={20} />
            </Pressable>
          </View>
        </View>
        {query.data.source === 'offline-cache' ? (
          <Text accessibilityLiveRegion="polite" style={styles.offline}>
            {t('article.offlineCopy')}
          </Text>
        ) : null}
        {article.thumbnail_url ? (
          <Image
            contentFit="cover"
            source={article.thumbnail_url}
            style={styles.hero}
          />
        ) : null}
        {isTranslated ? (
          <Text style={styles.translation}>
            {t('article.translationLabel', {
              language:
                article.translation_language || t('article.translationUnknown'),
            })}
          </Text>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {[
            article.source_name,
            publishedAt,
            t('article.readTime', { count: readingMinutes(article) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {article.original_url ? (
          <Pressable
            accessibilityRole="button"
            onPress={requestOriginalSource}
            style={styles.sourceButton}
          >
            <ExternalLink color={colors.pressRed} size={17} />
            <Text style={styles.sourceButtonLabel}>
              {t('article.originalSource')}
            </Text>
          </Pressable>
        ) : null}
        {body
          .split(/\n+/)
          .filter(Boolean)
          .map((paragraph, index) => (
            <Text
              key={`${index}-${paragraph.slice(0, 16)}`}
              style={styles.body}
            >
              {paragraph}
            </Text>
          ))}
      </ScrollView>
      <Modal
        animationType="fade"
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
    fontSize: 24,
    textAlign: 'center',
  },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  offline: {
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  hero: {
    backgroundColor: colors.card,
    height: 250,
    marginTop: spacing.md,
    width: '100%',
  },
  translation: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 32,
    lineHeight: 39,
    marginTop: spacing.md,
  },
  meta: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  sourceButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  sourceButtonLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
  },
  body: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 18,
    lineHeight: 30,
    marginTop: spacing.md,
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
    fontSize: 23,
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
    fontSize: 16,
    lineHeight: 23,
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
    fontSize: 14,
  },
});
