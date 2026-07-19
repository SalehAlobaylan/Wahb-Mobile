import { useQuery } from '@tanstack/react-query';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { MessageCircle, FileText, Info, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { createServiceClients, type ForYouItem } from '@/core/api';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

type DetailTab = 'comments' | 'transcript' | 'about';

type ForYouDetailSheetProps = {
  item: ForYouItem;
  installationId: string;
  initialTab: DetailTab;
  visible: boolean;
  onClose: () => void;
};

const { cms } = createServiceClients();

export function ForYouDetailSheet({
  item,
  installationId,
  initialTab,
  visible,
  onClose,
}: ForYouDetailSheetProps) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [expanded, setExpanded] = useState(initialTab === 'transcript');
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
          if (gesture.dy > 120) {
            onClose();
          } else if (gesture.dy < -50 && !expanded) {
            setExpanded(true);
            hapticLightImpact();
          } else if (gesture.dy > 50 && expanded) {
            setExpanded(false);
            hapticLightImpact();
          }
        },
      }),
    [expanded, onClose],
  );
  const commentsQuery = useQuery({
    queryKey: ['content-comments', item.id, installationId],
    queryFn: () =>
      cms.getComments({ contentId: item.id, installationId, limit: 20 }),
    enabled: visible && tab === 'comments',
  });
  const transcriptQuery = useQuery({
    queryKey: ['transcript', item.transcript_id],
    queryFn: () => cms.getTranscript(item.transcript_id!),
    enabled: visible && tab === 'transcript' && Boolean(item.transcript_id),
  });

  const sheetHeight = expanded
    ? Math.min(Math.round(windowHeight * 0.78), 680)
    : Math.min(Math.round(windowHeight * 0.48), 390);

  return (
    <Modal
      animationType="slide"
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
                isLoading={commentsQuery.isLoading}
                onRetry={() => void commentsQuery.refetch()}
                comments={commentsQuery.data?.items ?? []}
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
  onRetry,
}: {
  comments: { id: string; text: string; author?: string }[];
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
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
  if (comments.length === 0) {
    return <Text style={styles.emptyText}>{t('foryou.noComments')}</Text>;
  }
  return (
    <View style={styles.list}>
      {comments.map((comment) => (
        <View key={comment.id} style={styles.comment}>
          <Text style={styles.commentAuthor}>
            {comment.author || t('foryou.member')}
          </Text>
          <Text style={styles.commentText}>{comment.text}</Text>
        </View>
      ))}
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
  handleRegion: { alignItems: 'center', minHeight: 36, paddingTop: spacing.sm },
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
