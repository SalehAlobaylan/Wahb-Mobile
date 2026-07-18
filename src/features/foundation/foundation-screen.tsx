import { useLocales } from 'expo-localization';
import { Image } from 'expo-image';
import { Headphones, Newspaper, Radio } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

type FoundationChipProps = {
  icon: ReactNode;
  label: string;
  dark: boolean;
};

function FoundationChip({ icon, label, dark }: FoundationChipProps) {
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: dark ? colors.cardDark : colors.card,
          borderColor: dark ? colors.inkInverse : colors.ink,
        },
      ]}
    >
      {icon}
      <Text
        style={[
          styles.chipText,
          {
            color: dark ? colors.inkInverse : colors.ink,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function FoundationScreen() {
  const { t, i18n } = useTranslation();
  const locales = useLocales();
  const dark = useColorScheme() === 'dark';
  const isArabic = i18n.resolvedLanguage === 'ar';
  const isRtl = locales[0]?.textDirection === 'rtl' && isArabic;
  const foreground = dark ? colors.inkInverse : colors.ink;
  const secondary = dark ? '#c9c4bf' : colors.inkMuted;
  const accent = dark ? colors.pressRedDark : colors.pressRed;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: dark ? colors.paperDark : colors.paper },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.masthead, { borderColor: foreground }]}>
          <Image
            source={
              dark
                ? require('../../../assets/brand/wahb-wordmark-light.png')
                : require('../../../assets/brand/wahb-wordmark.png')
            }
            style={styles.wordmark}
            contentFit="contain"
            accessibilityLabel="Wahb"
          />
          <Text
            style={[
              styles.issue,
              {
                color: accent,
                fontFamily: fontFamilies.mono,
              },
            ]}
          >
            01 / 2026
          </Text>
        </View>

        <View style={[styles.hero, isRtl && styles.rtl]}>
          <Text
            style={[
              styles.eyebrow,
              {
                color: accent,
                fontFamily: isArabic
                  ? fontFamilies.arabicBold
                  : fontFamilies.bodyBold,
              },
            ]}
          >
            {t('foundation.eyebrow')}
          </Text>
          <Text
            style={[
              styles.title,
              {
                color: foreground,
                fontFamily: isArabic
                  ? fontFamilies.arabicBlack
                  : fontFamilies.editorial,
                textAlign: isRtl ? 'right' : 'left',
              },
            ]}
          >
            {t('foundation.title')}
          </Text>
          <Text
            style={[
              styles.description,
              {
                color: secondary,
                fontFamily: isArabic
                  ? fontFamilies.arabicMedium
                  : fontFamilies.body,
                textAlign: isRtl ? 'right' : 'left',
              },
            ]}
          >
            {t('foundation.description')}
          </Text>
        </View>

        <View style={[styles.redRule, { backgroundColor: accent }]} />

        <View style={styles.chips}>
          <FoundationChip
            dark={dark}
            icon={<Radio color={accent} size={18} strokeWidth={2.2} />}
            label={t('foundation.iosFirst')}
          />
          <FoundationChip
            dark={dark}
            icon={<Newspaper color={accent} size={18} strokeWidth={2.2} />}
            label={t('foundation.guest')}
          />
          <FoundationChip
            dark={dark}
            icon={<Headphones color={accent} size={18} strokeWidth={2.2} />}
            label={t('foundation.offline')}
          />
        </View>

        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: dark ? colors.cardDark : colors.card,
              borderColor: foreground,
            },
          ]}
        >
          <View style={[styles.statusHeader, isRtl && styles.rtl]}>
            <View style={[styles.statusDot, { backgroundColor: accent }]} />
            <Text
              style={[
                styles.status,
                {
                  color: foreground,
                  fontFamily: isArabic
                    ? fontFamilies.arabicBold
                    : fontFamilies.bodyBold,
                },
              ]}
            >
              {t('foundation.status')}
            </Text>
          </View>
          <Text
            style={[
              styles.note,
              {
                color: secondary,
                fontFamily: isArabic
                  ? fontFamilies.arabicMedium
                  : fontFamilies.body,
                textAlign: isRtl ? 'right' : 'left',
              },
            ]}
          >
            {t('foundation.note')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  masthead: {
    minHeight: 76,
    borderBottomWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    width: 112,
    height: 42,
  },
  issue: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  hero: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  rtl: {
    direction: 'rtl',
  },
  eyebrow: {
    fontSize: 13,
    letterSpacing: 1.6,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 48,
    lineHeight: 51,
    letterSpacing: -1.4,
    maxWidth: 360,
  },
  description: {
    fontSize: 17,
    lineHeight: 25,
    marginTop: spacing.lg,
    maxWidth: 350,
  },
  redRule: {
    width: 64,
    height: 5,
    marginBottom: spacing.xl,
  },
  chips: {
    gap: spacing.sm,
  },
  chip: {
    minHeight: 46,
    borderWidth: 1.5,
    borderRadius: radii.compact,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipText: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
  },
  statusCard: {
    borderWidth: 2,
    borderRadius: radii.compact,
    marginTop: 'auto',
    padding: spacing.md,
    minHeight: 116,
    justifyContent: 'center',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: radii.round,
  },
  status: {
    fontSize: 15,
  },
  note: {
    fontSize: 14,
    lineHeight: 21,
  },
});
