import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { NewsFeedResponse } from '@/core/api';
import { radii, spacing, typeScale } from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';

type Story = NewsFeedResponse['slides'][number]['featured'];

export function NewsCoverageSheet({
  onClose,
  story,
  visible,
}: {
  onClose: () => void;
  story: Story | null;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  if (!story) return null;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View>
            <Text
              style={[
                styles.kicker,
                { color: theme.accent, fontFamily: font('bold') },
              ]}
            >
              {t('news.coveredBy', {
                count: story.source_count || story.member_count,
              })}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                { color: theme.foreground, fontFamily: font('editorial') },
              ]}
            >
              {story.title || story.label}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={t('article.close')}
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.close, { borderColor: theme.border }]}
          >
            <X color={theme.foreground} size={20} />
          </Pressable>
        </View>
        {story.members.map((member) => (
          <View
            key={member.id}
            style={[styles.member, { borderBottomColor: theme.border }]}
          >
            <View style={styles.memberCopy}>
              <Text
                numberOfLines={2}
                style={[
                  styles.memberTitle,
                  { color: theme.foreground, fontFamily: font('editorial') },
                ]}
              >
                {member.title || member.source_name}
              </Text>
              <Text
                numberOfLines={2}
                style={[
                  styles.memberExcerpt,
                  { color: theme.mutedForeground, fontFamily: font('body') },
                ]}
              >
                {member.excerpt}
              </Text>
              <Text
                style={[
                  styles.memberSource,
                  { color: theme.mutedForeground, fontFamily: font('mono') },
                ]}
              >
                {member.source_name}
              </Text>
            </View>
            {member.thumbnail_url ? (
              <Image
                contentFit="cover"
                source={member.thumbnail_url}
                style={styles.image}
              />
            ) : null}
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.md },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    paddingTop: spacing.lg,
  },
  kicker: {
    ...typeScale.label,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: { ...typeScale.heading, marginTop: 3, maxWidth: 270 },
  close: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  member: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  memberCopy: { flex: 1 },
  memberTitle: { ...typeScale.cardTitle },
  memberExcerpt: { ...typeScale.meta, marginTop: 3 },
  memberSource: { ...typeScale.label, marginTop: spacing.xs },
  image: { height: 68, width: 88 },
});
