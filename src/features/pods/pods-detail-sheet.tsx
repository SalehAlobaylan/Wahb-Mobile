import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { hapticSelection } from '@/core/haptics/feedback';
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MessageCircle, FileText, Info, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { PodsItem } from '@/core/api';
import { fontForText } from '@/design/typography';
import {
  colors,
  fontFamilies,
  radii,
  spacing,
  typeScale,
} from '@/design/tokens';
import { useAuth } from '@/features/auth/auth-provider';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { ReportSheet } from '@/features/moderation/report-sheet';
import { useTranscriptQuery } from './use-transcript-query';
import { normalizeTranscript } from './pods-transcript-model';
import {
  DraggableBottomSheet,
  type DraggableBottomSheetHandle,
  type BottomSheetSnap,
} from '@/components/feed/draggable-bottom-sheet';

type DetailTab = 'comments' | 'transcript' | 'about';
export type PodsDetailSheetHandle = { open: (tab: DetailTab) => void };

type PodsDetailSheetProps = {
  item: PodsItem;
  installationId: string;
  collapsedContent: ReactNode;
  visible: boolean;
  onSnapChange?: (snap: BottomSheetSnap) => void;
  onInteractionChange?: (interacting: boolean) => void;
};

export const PodsDetailSheet = forwardRef<
  PodsDetailSheetHandle,
  PodsDetailSheetProps
>(function PodsDetailSheet(
  {
    item,
    installationId,
    collapsedContent,
    visible,
    onSnapChange,
    onInteractionChange,
  },
  ref,
) {
  const { t } = useTranslation();
  const router = useRouter();
  const { clients, subject } = useAuth();
  const outbox = useOutbox();
  const sheetRef = useRef<DraggableBottomSheetHandle>(null);
  const [tab, setTab] = useState<DetailTab>('comments');
  const [snap, setSnap] = useState<BottomSheetSnap>('collapsed');
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
  useImperativeHandle(ref, () => ({
    open: (nextTab) => {
      setTab(nextTab);
      sheetRef.current?.expand();
    },
  }));
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
    enabled: tab === 'comments',
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
  const transcriptQuery = useTranscriptQuery(
    item.transcript_id,
    visible && snap !== 'collapsed' && tab === 'transcript',
  );
  const transcriptText = useMemo(() => {
    const transcript = transcriptQuery.data;
    if (transcript?.content_item_id !== item.id) return undefined;
    return normalizeTranscript(
      transcript.full_text,
      { segments: transcript.segments, words: transcript.word_timestamps },
      item.duration_sec,
    ).text;
  }, [item.duration_sec, item.id, transcriptQuery.data]);
  const generation = useMutation({
    mutationFn: (id: string) => clients.cms.requestTranscription(id),
  });

  return (
    <>
      <DraggableBottomSheet
        ref={sheetRef}
        onSnapChange={(next) => {
          setSnap(next);
          onSnapChange?.(next);
        }}
        onInteractionChange={onInteractionChange}
        expandedContent={
          <View style={styles.panel}>
            <View style={styles.sheetHeader}>
              <Text numberOfLines={1} style={styles.sheetTitle}>
                {item.title}
              </Text>
              <Pressable
                accessibilityLabel={t('pods.closeDetails')}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => sheetRef.current?.collapse()}
                style={styles.closeButton}
              >
                <X color={colors.ink} size={20} />
              </Pressable>
            </View>
            <View style={styles.tabs}>
              <SheetTabButton
                active={tab === 'comments'}
                icon={<MessageCircle size={16} />}
                label={t('pods.comments')}
                onPress={() => selectTab('comments')}
              />
              <SheetTabButton
                active={tab === 'transcript'}
                icon={<FileText size={16} />}
                label={t('pods.transcript')}
                onPress={() => selectTab('transcript')}
              />
              <SheetTabButton
                active={tab === 'about'}
                icon={<Info size={16} />}
                label={t('pods.about')}
                onPress={() => selectTab('about')}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.panelContent}
              style={styles.panelScroll}
            >
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
                  isError={
                    transcriptQuery.isError ||
                    Boolean(
                      transcriptQuery.data &&
                      transcriptQuery.data.content_item_id !== item.id,
                    )
                  }
                  isLoading={transcriptQuery.isLoading}
                  onRetry={() => void transcriptQuery.refetch()}
                  text={transcriptText}
                  generationPending={
                    generation.variables === item.id && generation.isPending
                  }
                  generationRequested={
                    generation.variables === item.id && generation.isSuccess
                  }
                  generationFailed={
                    generation.variables === item.id && generation.isError
                  }
                  onGenerate={() =>
                    subject
                      ? generation.mutate(item.id)
                      : router.push('/sign-in')
                  }
                  canGenerate={Boolean(subject)}
                />
              ) : null}
              {tab === 'about' ? <AboutPanel item={item} /> : null}
            </ScrollView>
          </View>
        }
        testID="pods-bottom-sheet"
      >
        {collapsedContent}
      </DraggableBottomSheet>
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
    </>
  );
});

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
      <RetryPanel label={t('pods.commentsUnavailable')} onRetry={onRetry} />
    );
  }
  return (
    <View style={styles.list}>
      <View style={styles.commentComposer}>
        <TextInput
          accessibilityLabel={t('pods.commentInput')}
          editable={canComment}
          onChangeText={onChangeDraft}
          placeholder={
            canComment ? t('pods.commentPlaceholder') : t('pods.commentSignIn')
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
          <Text style={styles.commentSubmitText}>{t('pods.commentPost')}</Text>
        </Pressable>
      </View>
      {comments.length === 0 ? (
        <Text style={styles.emptyText}>{t('pods.noComments')}</Text>
      ) : null}
      {comments.map((comment) => (
        <View key={comment.id} style={styles.comment}>
          <View style={styles.commentTopline}>
            <Text style={styles.commentAuthor}>
              {comment.author || t('pods.member')}
            </Text>
            <View style={styles.commentActions}>
              {comment.is_mine ? (
                <Pressable
                  accessibilityLabel={t('pods.deleteComment')}
                  accessibilityRole="button"
                  onPress={() => void onDelete(comment.id)}
                >
                  <Text style={styles.commentDelete}>
                    {t('pods.deleteComment')}
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
              {t('pods.loadMoreComments')}
            </Text>
          )}
        </Pressable>
      ) : comments.length > 0 ? (
        <Text accessibilityLiveRegion="polite" style={styles.endOfComments}>
          {t('pods.endOfComments')}
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
  generationPending,
  generationRequested,
  generationFailed,
  onGenerate,
  canGenerate,
}: {
  hasTranscript: boolean;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  text?: string;
  generationPending: boolean;
  generationRequested: boolean;
  generationFailed: boolean;
  onGenerate: () => void;
  canGenerate: boolean;
}) {
  const { t } = useTranslation();
  if (!hasTranscript) {
    return (
      <View>
        <Text style={styles.emptyText}>
          {t(
            generationRequested
              ? 'pods.transcriptRequested'
              : 'pods.noTranscript',
          )}
        </Text>
        {!generationRequested && (
          <Pressable
            accessibilityRole="button"
            disabled={generationPending}
            onPress={onGenerate}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>
              {t(
                generationPending
                  ? 'pods.transcriptRequesting'
                  : canGenerate
                    ? 'pods.requestTranscript'
                    : 'account.signIn',
              )}
            </Text>
          </Pressable>
        )}
        {generationFailed && (
          <Text style={styles.emptyText}>
            {t('pods.transcriptUnavailable')}
          </Text>
        )}
      </View>
    );
  }
  if (isLoading) {
    return <ActivityIndicator color={colors.pressRed} />;
  }
  if (isError) {
    return (
      <RetryPanel label={t('pods.transcriptUnavailable')} onRetry={onRetry} />
    );
  }
  return (
    <Text
      style={[
        styles.transcriptText,
        { fontFamily: fontForText(text, 'body'), writingDirection: 'auto' },
      ]}
    >
      {text || t('pods.transcriptUnavailable')}
    </Text>
  );
}

function AboutPanel({ item }: { item: PodsItem }) {
  const { t, i18n } = useTranslation();
  const date = new Date(item.published_at ?? '');
  const range =
    item.parent_id &&
    Number.isFinite(item.chapter_start_ms) &&
    Number.isFinite(item.chapter_end_ms) &&
    item.chapter_end_ms! > item.chapter_start_ms!
      ? `${formatDuration(item.chapter_start_ms! / 1000)}–${formatDuration(item.chapter_end_ms! / 1000)}`
      : null;
  return (
    <View style={styles.list}>
      <Text style={styles.aboutLabel}>{item.type}</Text>
      {!!item.author && <Text style={styles.aboutText}>{item.author}</Text>}
      {!!item.source_name && (
        <Text style={styles.aboutText}>{item.source_name}</Text>
      )}
      <Text style={styles.aboutText}>
        {t('pods.duration', { duration: formatDuration(item.duration_sec) })}
      </Text>
      {Number.isFinite(date.getTime()) && (
        <>
          <Text style={styles.aboutLabel}>{t('pods.published')}</Text>
          <Text style={styles.aboutText}>
            {date.toLocaleDateString(i18n.language, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </>
      )}
      {range && (
        <>
          <Text style={styles.aboutLabel}>{t('pods.episodeExcerpt')}</Text>
          <Text style={[styles.aboutText, { writingDirection: 'ltr' }]}>
            {range}
          </Text>
        </>
      )}
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
        <Text style={styles.retryText}>{t('pods.retry')}</Text>
      </Pressable>
    </View>
  );
}

function formatDuration(durationSeconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(durationSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  panelScroll: { flex: 1, minHeight: 0 },
  modalRoot: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
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
    ...typeScale.heading,
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
    ...typeScale.meta,
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
    ...typeScale.meta,
  },
  commentTopline: { flexDirection: 'row', justifyContent: 'space-between' },
  commentActions: { flexDirection: 'row', gap: spacing.sm },
  commentDelete: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
  },
  commentAuthor: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
  },
  commentText: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    ...typeScale.body,
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
    ...typeScale.body,
    textAlign: 'center',
  },
  transcriptText: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    ...typeScale.bodyLarge,
  },
  aboutLabel: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
    letterSpacing: 1.2,
  },
  aboutText: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    ...typeScale.bodyLarge,
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
    ...typeScale.body,
  },
  pressed: { opacity: 0.7 },
});
