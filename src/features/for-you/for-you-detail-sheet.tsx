import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { hapticLightImpact, hapticSelection } from '@/core/haptics/feedback';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { MessageCircle, FileText, Info, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { ForYouItem } from '@/core/api';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import { useAuth } from '@/features/auth/auth-provider';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { ReportSheet } from '@/features/moderation/report-sheet';
import { useReducedMotion } from '@/core/ui/use-reduced-motion';

import { detailSheetIntentForPan } from './detail-sheet-intents';

type DetailTab = 'comments' | 'transcript' | 'about';

type ForYouDetailSheetProps = {
  item: ForYouItem;
  installationId: string;
  initialTab: DetailTab;
  visible: boolean;
  onClose: () => void;
};

export function ForYouDetailSheet({
  item,
  installationId,
  initialTab,
  visible,
  onClose,
}: ForYouDetailSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { clients, subject } = useAuth();
  const outbox = useOutbox();
  const reducedMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [expanded, setExpanded] = useState(initialTab === 'transcript');
  const [commentDraft, setCommentDraft] = useState('');
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(
    new Set(),
  );
  const [blockedAuthorIds, setBlockedAuthorIds] = useState<Set<string>>(
    new Set(),
  );
  const selectTab = (nextTab: DetailTab) => {
    if (nextTab === tab) {
      return;
    }
    setTab(nextTab);
    hapticSelection();
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 8 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          const intent = detailSheetIntentForPan(gesture.dy, expanded);
          if (intent === 'close') {
            onClose();
          } else if (intent === 'expand') {
            setExpanded(true);
            hapticLightImpact();
          } else if (intent === 'collapse') {
            setExpanded(false);
            hapticLightImpact();
          }
        },
      }),
    [expanded, onClose],
  );
  const commentsQuery = useInfiniteQuery({
    queryKey: ['content-comments', item.id, installationId, subject?.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clients.cms.getComments({
        contentId: item.id,
        installationId,
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: 20,
        signal,
      }),
    getNextPageParam: (page) => page.cursor,
    enabled: visible && tab === 'comments',
  });
  const submitComment = async () => {
    const text = commentDraft.trim();
    if (!subject) {
      router.push('/sign-in');
      return;
    }
    if (!text) {
      return;
    }
    await outbox.enqueue({
      contentId: item.id,
      type: 'comment',
      metadata: { text },
    });
    setCommentDraft('');
    await commentsQuery.refetch();
  };
  const deleteComment = async (commentId: string) => {
    await clients.cms.deleteComment(commentId, installationId);
    await commentsQuery.refetch();
  };
  const blockAuthor = async (authorId: string) => {
    setBlockedAuthorIds((current) => new Set(current).add(authorId));
    try {
      await clients.cms.blockAuthor(authorId);
    } catch {
      setBlockedAuthorIds((current) => {
        const next = new Set(current);
        next.delete(authorId);
        return next;
      });
    }
  };
  const visibleComments =
    commentsQuery.data?.pages
      .flatMap((page) => page.items)
      .filter(
        (comment) =>
          !hiddenCommentIds.has(comment.id) &&
          !(comment.author_id && blockedAuthorIds.has(comment.author_id)),
      ) ?? [];
  const transcriptQuery = useQuery({
    queryKey: ['transcript', item.transcript_id],
    queryFn: () => clients.cms.getTranscript(item.transcript_id!),
    enabled: visible && tab === 'transcript' && Boolean(item.transcript_id),
  });

  const sheetHeight = expanded
    ? Math.min(Math.round(windowHeight * 0.78), 680)
    : Math.min(Math.round(windowHeight * 0.48), 390);

  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel={t('foryou.closeDetails')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={[styles.sheet, { height: sheetHeight }]}>
          <View
            accessibilityHint={t('foryou.sheetGestureHint')}
            accessibilityLabel={t('foryou.sheetHandle')}
            accessibilityRole="adjustable"
            {...panResponder.panHandlers}
            style={styles.handleRegion}
          >
            <View style={styles.handle} />
          </View>
          <View style={styles.sheetHeader}>
            <Text numberOfLines={1} style={styles.sheetTitle}>
              {item.title}
            </Text>
            <Pressable
              accessibilityLabel={t('foryou.closeDetails')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}
            >
              <X color={colors.ink} size={20} />
            </Pressable>
          </View>
          <View style={styles.tabs}>
            <SheetTabButton
              active={tab === 'comments'}
              icon={<MessageCircle size={16} />}
              label={t('foryou.comments')}
              onPress={() => selectTab('comments')}
            />
            <SheetTabButton
              active={tab === 'transcript'}
              icon={<FileText size={16} />}
              label={t('foryou.transcript')}
              onPress={() => selectTab('transcript')}
            />
            <SheetTabButton
              active={tab === 'about'}
              icon={<Info size={16} />}
              label={t('foryou.about')}
              onPress={() => selectTab('about')}
            />
          </View>
          <ScrollView contentContainerStyle={styles.panelContent}>
            {tab === 'comments' ? (
              <CommentsPanel
                isError={commentsQuery.isError}
                isLoading={commentsQuery.isPending}
                isLoadingMore={commentsQuery.isFetchingNextPage}
                hasMore={commentsQuery.hasNextPage}
                canComment={Boolean(subject)}
                draft={commentDraft}
                onChangeDraft={setCommentDraft}
                onBlock={blockAuthor}
                onDelete={deleteComment}
                onReport={(commentId) => setReportCommentId(commentId)}
                onLoadMore={() => void commentsQuery.fetchNextPage()}
                onRetry={() => void commentsQuery.refetch()}
                onSubmit={() => void submitComment()}
                comments={visibleComments}
              />
            ) : null}
            {tab === 'transcript' ? (
              <TranscriptPanel
                hasTranscript={Boolean(item.transcript_id)}
                isError={transcriptQuery.isError}
                isLoading={transcriptQuery.isLoading}
                onRetry={() => void transcriptQuery.refetch()}
                text={transcriptQuery.data?.full_text}
              />
            ) : null}
            {tab === 'about' ? <AboutPanel item={item} /> : null}
          </ScrollView>
        </View>
      </View>
      <ReportSheet
        onClose={() => setReportCommentId(null)}
        onReported={() => {
          if (reportCommentId) {
            setHiddenCommentIds((current) =>
              new Set(current).add(reportCommentId),
            );
          }
        }}
        target={
          reportCommentId ? { type: 'comment', id: reportCommentId } : null
        }
        visible={Boolean(reportCommentId)}
      />
    </Modal>
  );
}

function SheetTabButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        active && styles.tabActive,
        pressed && styles.pressed,
      ]}
    >
      {icon}
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CommentsPanel({
  comments,
  isError,
  isLoading,
  isLoadingMore,
  hasMore,
  canComment,
  draft,
  onChangeDraft,
  onBlock,
  onDelete,
  onReport,
  onLoadMore,
  onRetry,
  onSubmit,
}: {
  comments: {
    id: string;
    text: string;
    author?: string;
    author_id?: string | null;
    is_mine: boolean;
  }[];
  isError: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  canComment: boolean;
  draft: string;
  onChangeDraft: (value: string) => void;
  onBlock: (authorId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReport: (id: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  if (isLoading) {
    return <ActivityIndicator color={colors.pressRed} />;
  }
  if (isError) {
    return (
      <RetryPanel label={t('foryou.commentsUnavailable')} onRetry={onRetry} />
    );
  }
  return (
    <View style={styles.list}>
      <View style={styles.commentComposer}>
        <TextInput
          accessibilityLabel={t('foryou.commentInput')}
          editable={canComment}
          onChangeText={onChangeDraft}
          placeholder={
            canComment
              ? t('foryou.commentPlaceholder')
              : t('foryou.commentSignIn')
          }
          placeholderTextColor={colors.inkMuted}
          style={styles.commentInput}
          value={draft}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          style={styles.commentSubmit}
        >
          <Text style={styles.commentSubmitText}>
            {t('foryou.commentPost')}
          </Text>
        </Pressable>
      </View>
      {comments.length === 0 ? (
        <Text style={styles.emptyText}>{t('foryou.noComments')}</Text>
      ) : null}
      {comments.map((comment) => (
        <View key={comment.id} style={styles.comment}>
          <View style={styles.commentTopline}>
            <Text style={styles.commentAuthor}>
              {comment.author || t('foryou.member')}
            </Text>
            <View style={styles.commentActions}>
              {comment.is_mine ? (
                <Pressable
                  accessibilityLabel={t('foryou.deleteComment')}
                  accessibilityRole="button"
                  onPress={() => void onDelete(comment.id)}
                >
                  <Text style={styles.commentDelete}>
                    {t('foryou.deleteComment')}
                  </Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    accessibilityLabel={t('moderation.report')}
                    accessibilityRole="button"
                    onPress={() => onReport(comment.id)}
                  >
                    <Text style={styles.commentDelete}>
                      {t('moderation.report')}
                    </Text>
                  </Pressable>
                  {comment.author_id ? (
                    <Pressable
                      accessibilityLabel={t('moderation.block')}
                      accessibilityRole="button"
                      onPress={() => void onBlock(comment.author_id!)}
                    >
                      <Text style={styles.commentDelete}>
                        {t('moderation.block')}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </View>
          <Text style={styles.commentText}>{comment.text}</Text>
        </View>
      ))}
      {hasMore ? (
        <Pressable
          accessibilityRole="button"
          disabled={isLoadingMore}
          onPress={onLoadMore}
          style={styles.loadMore}
        >
          {isLoadingMore ? (
            <ActivityIndicator color={colors.pressRed} />
          ) : (
            <Text style={styles.loadMoreText}>
              {t('foryou.loadMoreComments')}
            </Text>
          )}
        </Pressable>
      ) : comments.length > 0 ? (
        <Text accessibilityLiveRegion="polite" style={styles.endOfComments}>
          {t('foryou.endOfComments')}
        </Text>
      ) : null}
    </View>
  );
}

function TranscriptPanel({
  hasTranscript,
  isError,
  isLoading,
  onRetry,
  text,
}: {
  hasTranscript: boolean;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  text?: string;
}) {
  const { t } = useTranslation();
  if (!hasTranscript) {
    return <Text style={styles.emptyText}>{t('foryou.noTranscript')}</Text>;
  }
  if (isLoading) {
    return <ActivityIndicator color={colors.pressRed} />;
  }
  if (isError) {
    return (
      <RetryPanel label={t('foryou.transcriptUnavailable')} onRetry={onRetry} />
    );
  }
  return <Text style={styles.transcriptText}>{text}</Text>;
}

function AboutPanel({ item }: { item: ForYouItem }) {
  const { t } = useTranslation();
  return (
    <View style={styles.list}>
      <Text style={styles.aboutLabel}>{item.type}</Text>
      {!!item.author && <Text style={styles.aboutText}>{item.author}</Text>}
      {!!item.source_name && (
        <Text style={styles.aboutText}>{item.source_name}</Text>
      )}
      <Text style={styles.aboutText}>
        {t('foryou.duration', { duration: formatDuration(item.duration_sec) })}
      </Text>
    </View>
  );
}

function RetryPanel({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.retryPanel}>
      <Text style={styles.emptyText}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.retryButton}
      >
        <Text style={styles.retryText}>{t('foryou.retry')}</Text>
      </Pressable>
    </View>
  );
}

function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: {
    backgroundColor: colors.paper,
    borderColor: colors.ink,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  handleRegion: { alignItems: 'center', minHeight: 44, paddingTop: spacing.sm },
  handle: {
    backgroundColor: colors.ink,
    borderRadius: radii.round,
    height: 4,
    width: 42,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sheetTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.editorial,
    fontSize: 20,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 44,
  },
  tabActive: { borderBottomColor: colors.pressRed, borderBottomWidth: 3 },
  tabText: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
  },
  tabTextActive: { color: colors.ink },
  panelContent: { flexGrow: 1, padding: spacing.md },
  list: { gap: spacing.md },
  comment: {
    borderLeftColor: colors.pressRed,
    borderLeftWidth: 3,
    gap: spacing.xs,
    paddingLeft: spacing.sm,
  },
  commentComposer: { flexDirection: 'row', gap: spacing.sm },
  commentInput: {
    backgroundColor: colors.inkInverse,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.body,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
  },
  commentSubmit: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.compact,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: spacing.sm,
  },
  commentSubmitText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
  },
  commentTopline: { flexDirection: 'row', justifyContent: 'space-between' },
  commentActions: { flexDirection: 'row', gap: spacing.sm },
  commentDelete: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
  },
  commentAuthor: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
  },
  commentText: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 22,
  },
  loadMore: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  loadMoreText: { color: colors.ink, fontFamily: fontFamilies.bodyBold },
  endOfComments: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  transcriptText: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 27,
  },
  aboutLabel: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  aboutText: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 23,
  },
  retryPanel: { alignItems: 'center', gap: spacing.sm },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.compact,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  retryText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
  },
  pressed: { opacity: 0.7 },
});
