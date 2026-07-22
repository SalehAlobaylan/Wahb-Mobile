import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LockKeyhole,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { setHapticsEnabled } from '@/core/haptics/feedback';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import {
  playbackRates,
  type PlaybackRateClass,
} from '@/features/playback/playback-model';
import { usePlaybackController } from '@/features/playback/playback-provider';
import { useAuth } from '@/features/auth/auth-provider';

import {
  defaultExperiencePreferences,
  readExperiencePreferences,
  writeExperiencePreferences,
  type ExperiencePreferences,
} from './experience-preferences';
import {
  defaultLanguagePreferences,
  readLanguagePreferences,
  writeLanguagePreferences,
} from './language-preferences';

const legalBaseUrl = 'https://wahb.salehspace.dev';

export function SettingsScreen() {
  const { i18n, t } = useTranslation();
  const playback = usePlaybackController();
  const { subject } = useAuth();
  const [language, setLanguage] = useState(defaultLanguagePreferences);
  const [experience, setExperience] = useState<ExperiencePreferences>(
    defaultExperiencePreferences,
  );

  useEffect(() => {
    void Promise.all([
      readLanguagePreferences(),
      readExperiencePreferences(),
    ]).then(([nextLanguage, nextExperience]) => {
      setLanguage(nextLanguage);
      setExperience(nextExperience);
    });
  }, []);

  const updateLanguage = (next: Partial<typeof language>) => {
    const preferences = { ...language, ...next };
    setLanguage(preferences);
    void writeLanguagePreferences(preferences);
  };
  const updateExperience = (next: Partial<ExperiencePreferences>) => {
    const preferences = { ...experience, ...next };
    setExperience(preferences);
    if (next.hapticsEnabled !== undefined)
      setHapticsEnabled(next.hapticsEnabled);
    if (next.autoplayEnabled !== undefined)
      playback.setAutoplayEnabled(next.autoplayEnabled);
    void writeExperiencePreferences(preferences);
  };

  const legalPrefix = i18n.language === 'ar' ? '/ar' : '/en';
  const legalRows = useMemo(
    () =>
      [
        ['privacy', `${legalBaseUrl}${legalPrefix}/privacy`],
        ['terms', `${legalBaseUrl}${legalPrefix}/terms`],
        ['guidelines', `${legalBaseUrl}${legalPrefix}/community-guidelines`],
        ['support', `${legalBaseUrl}${legalPrefix}/support`],
        ['reportingInfo', `${legalBaseUrl}${legalPrefix}/reporting`],
        ['licenses', `${legalBaseUrl}${legalPrefix}/licenses`],
      ] as const,
    [legalPrefix],
  );

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityLabel={t('auth.back')}
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <Section title={t('settings.uiLanguage')}>
          <Choice
            value="ar"
            selected={language.uiLanguage}
            label={t('settings.arabic')}
            onPress={() => updateLanguage({ uiLanguage: 'ar' })}
          />
          <Choice
            value="en"
            selected={language.uiLanguage}
            label={t('settings.english')}
            onPress={() => updateLanguage({ uiLanguage: 'en' })}
          />
          <Text style={styles.note}>{t('settings.rtlNote')}</Text>
        </Section>
        <Section title={t('settings.contentLanguage')}>
          <Choice
            value="ar"
            selected={language.contentLanguage}
            label={t('settings.arabic')}
            onPress={() => updateLanguage({ contentLanguage: 'ar' })}
          />
          <Choice
            value="en"
            selected={language.contentLanguage}
            label={t('settings.english')}
            onPress={() => updateLanguage({ contentLanguage: 'en' })}
          />
          <Choice
            value="both"
            selected={language.contentLanguage}
            label={t('settings.both')}
            onPress={() => updateLanguage({ contentLanguage: 'both' })}
          />
          <Text style={styles.note}>{t('settings.contentNote')}</Text>
        </Section>
        <Section title={t('settings.playback')}>
          <ToggleRow
            label={t('settings.autoplay')}
            copy={t('settings.autoplayCopy')}
            value={experience.autoplayEnabled}
            onChange={(value) => updateExperience({ autoplayEnabled: value })}
          />
          <ToggleRow
            label={t('settings.haptics')}
            copy={t('settings.hapticsCopy')}
            value={experience.hapticsEnabled}
            onChange={(value) => updateExperience({ hapticsEnabled: value })}
          />
        </Section>
        <Section title={t('settings.appearance')}>
          <Choice
            value="system"
            selected={experience.theme}
            label={t('settings.themeSystem')}
            onPress={() => updateExperience({ theme: 'system' })}
          />
          <Choice
            value="light"
            selected={experience.theme}
            label={t('settings.themeLight')}
            onPress={() => updateExperience({ theme: 'light' })}
          />
          <Choice
            value="dark"
            selected={experience.theme}
            label={t('settings.themeDark')}
            onPress={() => updateExperience({ theme: 'dark' })}
          />
        </Section>
        <Section title={t('settings.speed')}>
          <RateRow
            label={t('settings.video')}
            rateClass="video"
            value={playback.rateDefaults.video}
            onSelect={playback.setDefaultRate}
          />
          <RateRow
            label={t('settings.podcast')}
            rateClass="podcast"
            value={playback.rateDefaults.podcast}
            onSelect={playback.setDefaultRate}
          />
          <RateRow
            label={t('settings.audioChapter')}
            rateClass="audio_chapter"
            value={playback.rateDefaults.audio_chapter}
            onSelect={playback.setDefaultRate}
          />
        </Section>
        <Section title={t('settings.legal')}>
          {legalRows.map(([key, url]) => (
            <LinkRow
              key={key}
              label={t(`settings.${key}`)}
              onPress={() =>
                void WebBrowser.openBrowserAsync(url, {
                  enableBarCollapsing: true,
                  showTitle: true,
                })
              }
            />
          ))}
          <View style={styles.versionRow}>
            <LockKeyhole color={colors.inkMuted} size={18} />
            <Text style={styles.versionText}>
              {t('settings.version')}:{' '}
              {Constants.expoConfig?.version ?? '0.1.0'} (
              {Constants.expoConfig?.ios?.buildNumber ?? '1'})
            </Text>
          </View>
          {subject ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/delete-account')}
              style={styles.deleteRow}
            >
              <Trash2 color={colors.pressRed} size={18} />
              <Text style={styles.deleteRowText}>
                {t('account.deleteAccount')}
              </Text>
            </Pressable>
          ) : null}
        </Section>
        <Section title={t('settings.later')}>
          {[
            'streamingQuality',
            'spatialAudio',
            'downloads',
            'notifications',
          ].map((key) => (
            <View
              key={key}
              accessibilityState={{ disabled: true }}
              style={styles.laterRow}
            >
              <Text style={styles.laterText}>{t(`settings.${key}`)}</Text>
              <Text style={styles.laterBadge}>{t('settings.later')}</Text>
            </View>
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{title}</Text>
      {children}
    </View>
  );
}
function Choice({
  value,
  selected,
  label,
  onPress,
}: {
  value: string;
  selected: string;
  label: string;
  onPress: () => void;
}) {
  const active = value === selected;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.choice, active && styles.choiceActive]}
    >
      <View style={[styles.dot, active && styles.dotActive]} />
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}
function ToggleRow({
  label,
  copy,
  value,
  onChange,
}: {
  label: string;
  copy: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.note}>{copy}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.card, true: colors.pressRed }}
      />
    </View>
  );
}
function RateRow({
  label,
  rateClass,
  value,
  onSelect,
}: {
  label: string;
  rateClass: PlaybackRateClass;
  value: number;
  onSelect: (rateClass: PlaybackRateClass, rate: number) => void;
}) {
  return (
    <View style={styles.rateRow}>
      <Text style={styles.rowTitle}>{label}</Text>
      <View style={styles.rateChoices}>
        {playbackRates.map((rate) => (
          <Pressable
            key={rate}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === rate }}
            onPress={() => onSelect(rateClass, rate)}
            style={[styles.rate, value === rate && styles.rateActive]}
          >
            <Text
              style={[styles.rateText, value === rate && styles.rateTextActive]}
            >
              {rate}×
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={styles.linkRow}
    >
      <Text style={styles.rowTitle}>{label}</Text>
      <View style={styles.linkIcon}>
        <ExternalLink color={colors.pressRed} size={17} />
        <ChevronRight color={colors.inkMuted} size={18} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 },
  content: { gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xxl },
  back: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 32,
  },
  section: { gap: spacing.sm },
  label: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  choice: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  choiceActive: { backgroundColor: colors.ink },
  dot: {
    borderColor: colors.ink,
    borderRadius: radii.round,
    borderWidth: 1,
    height: 14,
    width: 14,
  },
  dotActive: {
    backgroundColor: colors.pressRed,
    borderColor: colors.inkInverse,
  },
  choiceText: { color: colors.ink, fontFamily: fontFamilies.bodyMedium },
  choiceTextActive: { color: colors.inkInverse },
  note: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    lineHeight: 19,
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: colors.ink,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  toggleCopy: { flex: 1, gap: 2 },
  rowTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
  },
  rateRow: {
    borderBottomColor: colors.ink,
    borderBottomWidth: 1,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  rateChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rate: {
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  rateActive: { backgroundColor: colors.ink },
  rateText: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
  },
  rateTextActive: { color: colors.inkInverse },
  linkRow: {
    alignItems: 'center',
    borderBottomColor: colors.ink,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  linkIcon: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  versionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  versionText: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
  },
  deleteRow: {
    alignItems: 'center',
    borderColor: colors.pressRed,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  deleteRowText: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
  },
  laterRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.inkMuted,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    opacity: 0.68,
    paddingHorizontal: spacing.sm,
  },
  laterText: { color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium },
  laterBadge: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
});
