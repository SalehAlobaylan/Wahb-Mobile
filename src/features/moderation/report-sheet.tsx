import { router } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ModerationReason } from '@/core/api';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import { useAuth } from '@/features/auth/auth-provider';
import { useOutbox } from '@/core/outbox/outbox-provider';

const reasons: ModerationReason[] = [
  'harmful_inappropriate',
  'misinformation',
  'copyright',
  'broken_media',
  'incorrect_language_translation',
  'other',
];

export function ReportSheet({
  target,
  visible,
  onClose,
  onReported,
}: {
  target: { type: 'content' | 'comment'; id: string } | null;
  visible: boolean;
  onClose: () => void;
  onReported?: () => void;
}) {
  const { t } = useTranslation();
  const { subject } = useAuth();
  const outbox = useOutbox();
  const [reason, setReason] = useState<ModerationReason | null>(null);
  const [detail, setDetail] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!subject) {
      onClose();
      router.push('/sign-in');
      return;
    }
    if (!target || !reason || (reason === 'other' && !detail.trim())) {
      return;
    }
    setPending(true);
    try {
      await outbox.enqueue({
        type: 'report',
        targetType: target.type,
        targetId: target.id,
        reason,
        ...(detail.trim() ? { detail: detail.trim() } : {}),
      });
      setReason(null);
      setDetail('');
      onReported?.();
      onClose();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <SafeAreaView style={styles.root}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('moderation.reportTitle')}</Text>
          <Text style={styles.copy}>{t('moderation.reportCopy')}</Text>
          <View style={styles.reasons}>
            {reasons.map((entry) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === entry }}
                key={entry}
                onPress={() => setReason(entry)}
                style={[styles.reason, reason === entry && styles.reasonActive]}
              >
                <Text
                  style={[
                    styles.reasonText,
                    reason === entry && styles.reasonTextActive,
                  ]}
                >
                  {t(`moderation.reason.${entry}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          {reason === 'other' ? (
            <TextInput
              accessibilityLabel={t('moderation.detail')}
              multiline
              onChangeText={setDetail}
              placeholder={t('moderation.detail')}
              placeholderTextColor={colors.inkMuted}
              style={styles.detail}
              value={detail}
            />
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>{t('account.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={
                !reason || pending || (reason === 'other' && !detail.trim())
              }
              onPress={() => void submit()}
              style={[
                styles.submit,
                (!reason ||
                  pending ||
                  (reason === 'other' && !detail.trim())) &&
                  styles.disabled,
              ]}
            >
              <Text style={styles.submitText}>{t('moderation.submit')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.5)' },
  sheet: {
    backgroundColor: colors.paper,
    borderColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 27,
  },
  copy: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 20,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  reason: {
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reasonActive: { backgroundColor: colors.ink },
  reasonText: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
  },
  reasonTextActive: { color: colors.inkInverse },
  detail: {
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    minHeight: 84,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancel: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelText: { color: colors.ink, fontFamily: fontFamilies.bodyBold },
  submit: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.compact,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  submitText: { color: colors.inkInverse, fontFamily: fontFamilies.bodyBold },
});
