import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  AudioLines,
  Bell,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Languages,
  LogOut,
  Palette,
  Shield,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppSubpageHeader } from '@/components/navigation/app-subpage-header';
import { setHapticsEnabled } from '@/core/haptics/feedback';
import { queryClient } from '@/core/query/query-client';
import { layoutMetrics, radii, spacing, typeScale } from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';
import { useAuth } from '@/features/auth/auth-provider';
import { playbackRates, type PlaybackRateClass } from '@/features/playback/playback-model';
import { usePlaybackController } from '@/features/playback/playback-provider';

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
import { type SettingsPanel } from './settings-panel';
export { parseSettingsPanel, settingsPanels, type SettingsPanel } from './settings-panel';

const legalBaseUrl = 'https://wahb.salehspace.dev';

function settingsPanelHref(panel: SettingsPanel): Href {
  return `/settings/${panel}` as Href;
}

function useSettingsPreferences() {
  const playback = usePlaybackController();
  const { setPreference } = useWahbTheme();
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
    void writeLanguagePreferences(preferences).then(() =>
      queryClient.invalidateQueries({
        queryKey: ['content-language-preference'],
      }),
    );
  };
  const updateExperience = (next: Partial<ExperiencePreferences>) => {
    const preferences = { ...experience, ...next };
    setExperience(preferences);
    if (next.hapticsEnabled !== undefined) {
      setHapticsEnabled(next.hapticsEnabled);
    }
    if (next.autoplayEnabled !== undefined) {
      playback.setAutoplayEnabled(next.autoplayEnabled);
    }
    if (next.theme !== undefined) void setPreference(next.theme);
    void writeExperiencePreferences(preferences);
  };

  return { experience, language, playback, updateExperience, updateLanguage };
}

export function SettingsScreen() {
  return <SettingsHome />;
}

export function SettingsPanelScreen({ panel }: { panel: SettingsPanel }) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const title = t(`settings.panels.${panel}`);
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: theme.background }]}
    >
      <AppSubpageHeader fallback="/settings" title={title} />
      {panel === 'language' ? <LanguagePanel /> : null}
      {panel === 'appearance' ? <AppearancePanel /> : null}
      {panel === 'playback' ? <PlaybackPanel /> : null}
      {panel === 'legal' ? <LegalPanel /> : null}
      {panel === 'security' ? <SecurityPanel /> : null}
    </SafeAreaView>
  );
}

function SettingsHome() {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const { clients, subject } = useAuth();
  const profile = useQuery({
    queryKey: ['profile', subject?.id],
    enabled: Boolean(subject),
    queryFn: () => clients.iam.getProfile(),
  });
  const displayName = profile.data?.username || subject?.email?.split('@')[0];

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: theme.background }]}
    >
      <AppSubpageHeader fallback="/" title={t('settings.title')} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(subject ? '/profile' : '/sign-in')}
          style={({ pressed }) => [
            styles.profileTeaser,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.teaserAvatar, { borderColor: theme.accent }]}>
            <Text
              style={[
                styles.teaserInitial,
                { color: theme.accent, fontFamily: font('editorial') },
              ]}
            >
              {displayName?.slice(0, 1).toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={styles.teaserCopy}>
            <Text
              style={[
                styles.teaserName,
                { color: theme.foreground, fontFamily: font('editorial') },
              ]}
            >
              {displayName ?? t('settings.signIn')}
            </Text>
            <Text
              style={[
                styles.teaserMeta,
                { color: subject ? theme.accent : theme.mutedForeground, fontFamily: font('bold') },
              ]}
            >
              {subject ? t('settings.member') : t('settings.signInCopy')}
            </Text>
          </View>
          <DisclosureIcon />
        </Pressable>

        <SettingsGroup title={t('settings.sections.account')}>
          <SettingsRow
            icon={UserRound}
            label={t('account.profile')}
            onPress={() => router.push('/profile')}
          />
          <SettingsRow
            icon={Shield}
            label={t('settings.security')}
            onPress={() => router.push(settingsPanelHref('security'))}
          />
        </SettingsGroup>
        <SettingsGroup title={t('settings.sections.content')}>
          <SettingsRow
            icon={AudioLines}
            label={t('settings.playback')}
            onPress={() => router.push(settingsPanelHref('playback'))}
          />
          <SettingsRow icon={Download} label={t('settings.downloads')} disabled />
        </SettingsGroup>
        <SettingsGroup title={t('settings.sections.preferences')}>
          <SettingsRow
            icon={Palette}
            label={t('settings.appearance')}
            onPress={() => router.push(settingsPanelHref('appearance'))}
          />
          <SettingsRow
            icon={Languages}
            label={t('settings.uiLanguage')}
            onPress={() => router.push(settingsPanelHref('language'))}
          />
          <SettingsRow icon={Bell} label={t('settings.notifications')} disabled />
        </SettingsGroup>
        <SettingsGroup title={t('settings.legal')}>
          <SettingsRow
            icon={FileText}
            label={t('settings.legal')}
            onPress={() => router.push(settingsPanelHref('legal'))}
          />
        </SettingsGroup>
        <Text
          style={[
            styles.version,
            { color: theme.mutedForeground, fontFamily: font('mono') },
          ]}
        >
          {t('settings.version')} {Constants.expoConfig?.version ?? '0.1.0'}
          {' · '}
          {Constants.expoConfig?.ios?.buildNumber ?? '1'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function LanguagePanel() {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const { language, updateLanguage } = useSettingsPreferences();
  return (
    <PanelScroll>
      <PanelSection title={t('settings.uiLanguage')}>
        <Choice value="ar" selected={language.uiLanguage} label={t('settings.arabic')} onPress={() => updateLanguage({ uiLanguage: 'ar' })} />
        <Choice value="en" selected={language.uiLanguage} label={t('settings.english')} onPress={() => updateLanguage({ uiLanguage: 'en' })} />
      </PanelSection>
      <Text style={[styles.note, { color: theme.mutedForeground, fontFamily: font('body') }]}>{t('settings.rtlNote')}</Text>
      <PanelSection title={t('settings.contentLanguage')}>
        <Choice value="ar" selected={language.contentLanguage} label={t('settings.arabic')} onPress={() => updateLanguage({ contentLanguage: 'ar' })} />
        <Choice value="en" selected={language.contentLanguage} label={t('settings.english')} onPress={() => updateLanguage({ contentLanguage: 'en' })} />
        <Choice value="both" selected={language.contentLanguage} label={t('settings.both')} onPress={() => updateLanguage({ contentLanguage: 'both' })} />
      </PanelSection>
      <Text style={[styles.note, { color: theme.mutedForeground, fontFamily: font('body') }]}>{t('settings.contentNote')}</Text>
    </PanelScroll>
  );
}

function AppearancePanel() {
  const { t } = useTranslation();
  const { experience, updateExperience } = useSettingsPreferences();
  return (
    <PanelScroll>
      <PanelSection title={t('settings.appearance')}>
        <Choice value="system" selected={experience.theme} label={t('settings.themeSystem')} onPress={() => updateExperience({ theme: 'system' })} />
        <Choice value="light" selected={experience.theme} label={t('settings.themeLight')} onPress={() => updateExperience({ theme: 'light' })} />
        <Choice value="dark" selected={experience.theme} label={t('settings.themeDark')} onPress={() => updateExperience({ theme: 'dark' })} />
      </PanelSection>
    </PanelScroll>
  );
}

function PlaybackPanel() {
  const { t } = useTranslation();
  const { experience, playback, updateExperience } = useSettingsPreferences();
  return (
    <PanelScroll>
      <PanelSection title={t('settings.playback')}>
        <ToggleRow label={t('settings.autoplay')} copy={t('settings.autoplayCopy')} value={experience.autoplayEnabled} onChange={(value) => updateExperience({ autoplayEnabled: value })} />
        <ToggleRow label={t('settings.haptics')} copy={t('settings.hapticsCopy')} value={experience.hapticsEnabled} onChange={(value) => updateExperience({ hapticsEnabled: value })} />
      </PanelSection>
      <PanelSection title={t('settings.speed')}>
        <RateRow label={t('settings.video')} rateClass="video" value={playback.rateDefaults.video} onSelect={playback.setDefaultRate} />
        <RateRow label={t('settings.podcast')} rateClass="podcast" value={playback.rateDefaults.podcast} onSelect={playback.setDefaultRate} />
        <RateRow label={t('settings.audioChapter')} rateClass="audio_chapter" value={playback.rateDefaults.audio_chapter} onSelect={playback.setDefaultRate} />
      </PanelSection>
    </PanelScroll>
  );
}

function LegalPanel() {
  const { i18n, t } = useTranslation();
  const legalPrefix = i18n.language.startsWith('ar') ? '/ar' : '/en';
  const rows = [
    ['privacy', `${legalBaseUrl}${legalPrefix}/privacy`],
    ['terms', `${legalBaseUrl}${legalPrefix}/terms`],
    ['guidelines', `${legalBaseUrl}${legalPrefix}/community-guidelines`],
    ['support', `${legalBaseUrl}${legalPrefix}/support`],
    ['reportingInfo', `${legalBaseUrl}${legalPrefix}/reporting`],
    ['licenses', `${legalBaseUrl}${legalPrefix}/licenses`],
  ] as const;
  return (
    <PanelScroll>
      <PanelSection title={t('settings.legal')}>
        {rows.map(([label, url]) => (
          <SettingsRow
            key={label}
            icon={label === 'support' ? Globe2 : FileText}
            label={t(`settings.${label}`)}
            external
            onPress={() => void WebBrowser.openBrowserAsync(url, { enableBarCollapsing: true, showTitle: true })}
          />
        ))}
      </PanelSection>
    </PanelScroll>
  );
}

function SecurityPanel() {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const auth = useAuth();
  return (
    <PanelScroll>
      <PanelSection title={t('settings.security')}>
        <SettingsRow icon={UserRound} label={t('account.title')} onPress={() => router.push('/account')} />
        {auth.subject ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => void auth.logout().then(() => router.replace('/'))}
              style={({ pressed }) => [styles.outlineAction, { borderColor: theme.accent }, pressed && styles.pressed]}
            >
              <LogOut color={theme.accent} size={18} />
              <Text style={[styles.outlineActionText, { color: theme.accent, fontFamily: font('bold') }]}>{t('account.signOut')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/delete-account')}
              style={({ pressed }) => [styles.deleteAction, { borderColor: theme.accent }, pressed && styles.pressed]}
            >
              <Trash2 color={theme.accent} size={18} />
              <Text style={[styles.outlineActionText, { color: theme.accent, fontFamily: font('bold') }]}>{t('account.deleteAccount')}</Text>
            </Pressable>
          </>
        ) : (
          <SettingsRow icon={UserRound} label={t('settings.signIn')} onPress={() => router.push('/sign-in')} />
        )}
      </PanelSection>
    </PanelScroll>
  );
}

function PanelScroll({ children }: { children: ReactNode }) {
  const { theme } = useWahbTheme();
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.background }]} contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  );
}

function SettingsGroup({ children, title }: { children: ReactNode; title: string }) {
  const { theme } = useWahbTheme();
  return (
    <View style={styles.group}>
      <PanelLabel>{title}</PanelLabel>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>{children}</View>
    </View>
  );
}

function PanelSection({ children, title }: { children: ReactNode; title: string }) {
  return <SettingsGroup title={title}>{children}</SettingsGroup>;
}

function PanelLabel({ children }: { children: ReactNode }) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return <Text style={[styles.groupLabel, { color: theme.mutedForeground, fontFamily: font('bold') }]}>{children}</Text>;
}

function DisclosureIcon({ external = false }: { external?: boolean }) {
  const { theme } = useWahbTheme();
  const { isRTL } = useWahbTypography();
  if (external) return <ExternalLink color={theme.accent} size={17} />;
  const Icon = isRTL ? ChevronLeft : ChevronRight;
  return <Icon color={theme.mutedForeground} size={19} />;
}

function SettingsRow({ icon: Icon, label, value, onPress, disabled = false, external = false }: { icon: LucideIcon; label: string; value?: string; onPress?: () => void; disabled?: boolean; external?: boolean }) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border }, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Icon color={disabled ? theme.mutedForeground : theme.accent} size={18} />
      <Text style={[styles.rowLabel, { color: disabled ? theme.mutedForeground : theme.foreground, fontFamily: font('body') }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: theme.mutedForeground, fontFamily: font('mono') }]}>{value}</Text> : null}
      {!disabled ? <DisclosureIcon external={external} /> : <Text style={[styles.later, { color: theme.mutedForeground, fontFamily: font('bold') }]}>LATER</Text>}
    </Pressable>
  );
}

function Choice({ value, selected, label, onPress }: { value: string; selected: string; label: string; onPress: () => void }) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const active = value === selected;
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.choice, { borderBottomColor: theme.border }, pressed && styles.pressed]}>
      <View style={[styles.radio, { borderColor: active ? theme.accent : theme.border }, active && { backgroundColor: theme.accent }]} />
      <Text style={[styles.rowLabel, { color: theme.foreground, fontFamily: font('body') }]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({ label, copy, value, onChange }: { label: string; copy: string; value: boolean; onChange: (value: boolean) => void }) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <View style={[styles.toggle, { borderBottomColor: theme.border }]}>
      <View style={styles.toggleCopy}>
        <Text style={[styles.rowLabel, { color: theme.foreground, fontFamily: font('body') }]}>{label}</Text>
        <Text style={[styles.note, { color: theme.mutedForeground, fontFamily: font('body') }]}>{copy}</Text>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ false: theme.muted, true: theme.accent }} />
    </View>
  );
}

function RateRow({ label, rateClass, value, onSelect }: { label: string; rateClass: PlaybackRateClass; value: number; onSelect: (rateClass: PlaybackRateClass, rate: number) => void }) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <View style={[styles.rateRow, { borderBottomColor: theme.border }]}>
      <Text style={[styles.rowLabel, { color: theme.foreground, fontFamily: font('body') }]}>{label}</Text>
      <View style={styles.rates}>{playbackRates.map((rate) => <Pressable key={rate} accessibilityRole="radio" accessibilityState={{ selected: rate === value }} onPress={() => onSelect(rateClass, rate)} style={({ pressed }) => [styles.rate, { borderColor: rate === value ? theme.accent : theme.border, backgroundColor: rate === value ? theme.accent : theme.background }, pressed && styles.pressed]}><Text style={[styles.rateText, { color: rate === value ? theme.inverse : theme.foreground, fontFamily: font('mono') }]}>{rate}×</Text></Pressable>)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: 128, paddingHorizontal: layoutMetrics.pageGutter, paddingTop: spacing.md },
  profileTeaser: { alignItems: 'center', borderRadius: radii.compact, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  teaserAvatar: { alignItems: 'center', borderRadius: 28, borderWidth: 2, height: 56, justifyContent: 'center', width: 56 },
  teaserInitial: { fontSize: 23 },
  teaserCopy: { flex: 1, gap: 2 },
  teaserName: { ...typeScale.bodyLarge },
  teaserMeta: { ...typeScale.label, letterSpacing: 0.7, textTransform: 'uppercase' },
  group: { gap: spacing.xs },
  groupLabel: { ...typeScale.label, letterSpacing: 0.8, paddingHorizontal: spacing.xs, textTransform: 'uppercase' },
  card: { borderRadius: radii.compact, borderWidth: 1, overflow: 'hidden' },
  row: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md },
  rowLabel: { ...typeScale.body, flex: 1 },
  rowValue: { ...typeScale.meta },
  later: { ...typeScale.micro, letterSpacing: 0.7 },
  disabled: { opacity: 0.54 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  choice: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 54, paddingHorizontal: spacing.md },
  radio: { borderRadius: 9, borderWidth: 1, height: 18, width: 18 },
  toggle: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 72, paddingHorizontal: spacing.md },
  toggleCopy: { flex: 1, gap: 2 },
  note: { ...typeScale.meta },
  rateRow: { borderBottomWidth: 1, gap: spacing.sm, padding: spacing.md },
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rate: { borderRadius: radii.compact, borderWidth: 1, minWidth: 46, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  rateText: { ...typeScale.meta, textAlign: 'center' },
  outlineAction: { alignItems: 'center', borderRadius: radii.compact, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md },
  deleteAction: { alignItems: 'center', borderRadius: radii.compact, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md },
  outlineActionText: { ...typeScale.body },
  version: { ...typeScale.meta, paddingBottom: spacing.lg, textAlign: 'center' },
});
