import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import {
  Bookmark,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Heart,
  LayoutGrid,
  LogIn,
  MoreHorizontal,
  Play,
  Settings,
  Sparkles,
  Video,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type {
  HistoryItem,
  IamProfile,
  MyContentItem,
  PreferencesResponse,
  ProfileStats,
  SavedContentItem,
} from '@/core/api';
import { AppSubpageHeader } from '@/components/navigation/app-subpage-header';
import { getInstallationId } from '@/core/identity/installation-id';
import { useOutbox } from '@/core/outbox/outbox-provider';
import {
  colors,
  layoutMetrics,
  radii,
  spacing,
  typeScale,
} from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { fontForText, useWahbTypography } from '@/design/typography';
import { useAuth } from '@/features/auth/auth-provider';
import { usePlaybackController } from '@/features/playback/playback-provider';

type ProfileTab = 'saved' | 'likes' | 'history' | 'creations';
type CreationFilter = 'all' | 'audio' | 'writes' | 'video';
const tabs: readonly ProfileTab[] = ['saved', 'likes', 'history', 'creations'];

function compactNumber(value: number, locale: string) {
  const formatted =
    value >= 1000
      ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
      : String(value);
  return locale.startsWith('ar')
    ? formatted.replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)] ?? digit)
    : formatted;
}

function displayName(profile: { username: string; email: string }) {
  return profile.username || profile.email.split('@')[0] || 'Wahb';
}

export function ProfileScreen() {
  const { t } = useTranslation();
  const { clients, subject } = useAuth();
  const { theme } = useWahbTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: ProfileTab = tabs.includes(params.tab as ProfileTab)
    ? (params.tab as ProfileTab)
    : 'saved';
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['profile', subject?.id],
    enabled: Boolean(subject),
    queryFn: () => clients.iam.getProfile(),
  });
  const stats = useQuery({
    queryKey: ['profile-stats', subject?.id],
    enabled: Boolean(subject),
    queryFn: () => clients.cms.getProfileStats(),
  });
  const preferences = useQuery({
    queryKey: ['profile-preferences', subject?.id],
    enabled: Boolean(subject),
    queryFn: () => clients.cms.getPreferences(),
  });
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [creationFilter, setCreationFilter] = useState<CreationFilter>('all');

  const saved = useInfiniteQuery({
    queryKey: ['profile-saved', subject?.id],
    enabled: Boolean(subject) && tab === 'saved',
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clients.cms.getSavedContent({ cursor: pageParam ?? undefined, signal }),
    getNextPageParam: (page) => page.cursor,
  });
  const liked = useInfiniteQuery({
    queryKey: ['profile-likes', subject?.id],
    enabled: Boolean(subject) && tab === 'likes',
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clients.cms.getLikedContent({ cursor: pageParam ?? undefined, signal }),
    getNextPageParam: (page) => page.cursor,
  });
  const installation = useQuery({
    queryKey: ['profile-installation'],
    queryFn: getInstallationId,
    staleTime: Infinity,
  });
  const history = useInfiniteQuery({
    queryKey: ['profile-history', subject?.id, installation.data],
    enabled: Boolean(subject && installation.data && tab === 'history'),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clients.cms.getHistory({
        installationId: installation.data!,
        cursor: pageParam ?? undefined,
        signal,
      }),
    getNextPageParam: (page) => page.cursor,
  });
  const creationQuery = (type: 'PODCAST' | 'VIDEO' | 'NEWS' | 'ARTICLE') =>
    ({
      queryKey: ['profile-creations', subject?.id, type],
      enabled: Boolean(subject) && tab === 'creations',
      initialPageParam: null as string | null,
      queryFn: ({
        pageParam,
        signal,
      }: {
        pageParam: string | null;
        signal: AbortSignal;
      }) =>
        clients.cms.getMyContent({
          type,
          cursor: pageParam ?? undefined,
          signal,
        }),
      getNextPageParam: (page: { cursor: string | null }) => page.cursor,
    }) as const;
  const podcastCreations = useInfiniteQuery(creationQuery('PODCAST'));
  const videoCreations = useInfiniteQuery(creationQuery('VIDEO'));
  const newsCreations = useInfiniteQuery(creationQuery('NEWS'));
  const articleCreations = useInfiniteQuery(creationQuery('ARTICLE'));
  const creationQueries = [
    podcastCreations,
    videoCreations,
    newsCreations,
    articleCreations,
  ];
  const seenCreations = new Set<string>();
  const creationItems = creationQueries
    .flatMap((query) => query.data?.pages.flatMap((page) => page.items) ?? [])
    .filter(
      (item) =>
        !seenCreations.has(item.id) && Boolean(seenCreations.add(item.id)),
    )
    .sort(
      (a, b) =>
        Date.parse(b.published_at ?? '') - Date.parse(a.published_at ?? ''),
    );
  const visibleCreations = creationItems.filter(
    (item) =>
      creationFilter === 'all' ||
      (creationFilter === 'audio' && item.type === 'PODCAST') ||
      (creationFilter === 'video' && item.type === 'VIDEO') ||
      (creationFilter === 'writes' &&
        (item.type === 'NEWS' || item.type === 'ARTICLE')),
  );

  const playback = usePlaybackController();
  const outbox = useOutbox();
  const openSaved = useCallback(
    async (item: SavedContentItem) => {
      if (item.type === 'NEWS') return router.push(`/article/${item.id}`);
      if (
        !item.playback_url ||
        !item.playback_type ||
        item.has_video === undefined
      )
        return;
      await playback.start({
        id: item.id,
        contentType: item.type,
        title: item.title || 'Wahb',
        ...(item.source_name ? { sourceName: item.source_name } : {}),
        ...(item.thumbnail_url ? { artworkUrl: item.thumbnail_url } : {}),
        playback: {
          url: item.playback_url,
          type: item.playback_type,
          hasVideo: item.has_video,
          ...(item.fallback_playback_url
            ? { fallbackUrl: item.fallback_playback_url }
            : {}),
          ...(item.fallback_playback_type
            ? { fallbackType: item.fallback_playback_type }
            : {}),
          ...(item.fallback_has_video !== undefined
            ? { fallbackHasVideo: item.fallback_has_video }
            : {}),
        },
      });
    },
    [playback],
  );
  const removeInteraction = useCallback(
    async (item: SavedContentItem, type: 'bookmark' | 'like') => {
      await outbox.enqueue({ contentId: item.id, type, operation: 'delete' });
      await queryClient.invalidateQueries({
        queryKey: [
          type === 'bookmark' ? 'profile-saved' : 'profile-likes',
          subject?.id,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ['profile-stats', subject?.id],
      });
    },
    [outbox, queryClient, subject?.id],
  );
  const openHistory = useCallback(
    async (item: HistoryItem) => {
      if (item.type === 'NEWS')
        return router.push(`/article/${item.content_id}`);
      if (!item.media_url) return;
      await playback.start(
        {
          id: item.content_id,
          contentType: item.type,
          title: item.title || 'Wahb',
          ...(item.source_name ? { sourceName: item.source_name } : {}),
          ...(item.thumbnail_url ? { artworkUrl: item.thumbnail_url } : {}),
          playback: {
            url: item.media_url,
            type: 'mp4',
            hasVideo: item.type === 'VIDEO',
          },
        },
        { positionSeconds: item.progress_seconds ?? 0 },
      );
    },
    [playback],
  );
  const openCreation = useCallback(
    async (item: MyContentItem) => {
      if (item.status !== 'READY') return;
      if (item.type === 'NEWS' || item.type === 'ARTICLE')
        return router.push(`/article/${item.id}`);
      if (
        !item.playback_url ||
        !item.playback_type ||
        item.has_video === undefined
      )
        return;
      await playback.start({
        id: item.id,
        contentType: item.type,
        title: item.title || 'Wahb',
        ...(item.thumbnail_url ? { artworkUrl: item.thumbnail_url } : {}),
        playback: {
          url: item.playback_url,
          type: item.playback_type,
          hasVideo: item.has_video,
          ...(item.fallback_playback_url
            ? { fallbackUrl: item.fallback_playback_url }
            : {}),
          ...(item.fallback_playback_type
            ? { fallbackType: item.fallback_playback_type }
            : {}),
          ...(item.fallback_has_video !== undefined
            ? { fallbackHasVideo: item.fallback_has_video }
            : {}),
        },
      });
    },
    [playback],
  );
  const clearHistory = () =>
    Alert.alert(t('library.clearHistoryTitle'), t('library.clearHistoryCopy'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('library.clear'),
        style: 'destructive',
        onPress: () =>
          installation.data
            ? void clients.cms.clearHistory(installation.data).then(() =>
                queryClient.invalidateQueries({
                  queryKey: ['profile-history', subject?.id],
                }),
              )
            : undefined,
      },
    ]);
  const setTab = (next: ProfileTab) => router.setParams({ tab: next });
  const refresh = () =>
    Promise.all([
      profile.refetch(),
      stats.refetch(),
      preferences.refetch(),
      tab === 'saved'
        ? saved.refetch()
        : tab === 'likes'
          ? liked.refetch()
          : tab === 'history'
            ? history.refetch()
            : Promise.all(creationQueries.map((query) => query.refetch())),
    ]);

  if (!subject) return <GuestProfile />;
  if (profile.isError) {
    return <ProfileLoadFailure onRetry={() => void profile.refetch()} />;
  }
  const data = profile.data;
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: theme.background }]}
    >
      <AppSubpageHeader
        fallback="/"
        title={data ? `@${displayName(data)}` : t('profile.title')}
        end={
          <Pressable
            accessibilityLabel={t('settings.title')}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [
              styles.headerIcon,
              { borderColor: theme.border, backgroundColor: theme.card },
              pressed && styles.headerPressed,
            ]}
          >
            <Settings color={theme.foreground} size={19} />
          </Pressable>
        }
      />
      <SectionList
        sections={[{ key: 'library', data: [tab] }]}
        keyExtractor={(item) => item}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching || stats.isRefetching}
            onRefresh={() => void refresh()}
            tintColor={theme.accent}
          />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          data ? (
            <ProfileHero
              profile={data}
              stats={stats.data}
              statsLoading={stats.isLoading}
              preferences={preferences.data?.declared ?? []}
              onInterests={() => setInterestsOpen(true)}
              onSelect={setTab}
            />
          ) : (
            <ActivityIndicator color={theme.accent} style={styles.loading} />
          )
        }
        renderSectionHeader={() => <ProfileTabs tab={tab} />}
        renderItem={() => (
          <ProfileLibrary
            tab={tab}
            saved={saved}
            liked={liked}
            history={history}
            creations={visibleCreations}
            creationLoading={creationQueries.some((query) => query.isLoading)}
            creationFilter={creationFilter}
            setCreationFilter={setCreationFilter}
            onSaved={openSaved}
            onHistory={openHistory}
            onCreation={openCreation}
            onRemove={removeInteraction}
            onClearHistory={clearHistory}
          />
        )}
      />
      <InterestsSheet
        visible={interestsOpen}
        onClose={() => setInterestsOpen(false)}
      />
    </SafeAreaView>
  );
}

function ProfileLoadFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: theme.background }]}
    >
      <AppSubpageHeader fallback="/" title={t('profile.title')} />
      <View style={styles.profileFailure}>
        <Text
          style={[
            styles.emptyTitle,
            { color: theme.foreground, fontFamily: font('editorial') },
          ]}
        >
          {t('errors.title')}
        </Text>
        <Text
          style={[
            styles.emptyCopy,
            { color: theme.mutedForeground, fontFamily: font('body') },
          ]}
        >
          {t('errors.copy')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={[styles.retry, { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.primaryText, { fontFamily: font('bold') }]}>
            {t('errors.retry')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function GuestProfile() {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: theme.background }]}
    >
      <AppSubpageHeader
        fallback="/"
        title={t('profile.title')}
        end={
          <Pressable
            accessibilityLabel={t('settings.title')}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [
              styles.headerIcon,
              { borderColor: theme.border, backgroundColor: theme.card },
              pressed && styles.headerPressed,
            ]}
          >
            <Settings color={theme.foreground} size={19} />
          </Pressable>
        }
      />
      <View style={styles.guest}>
        <View
          style={[
            styles.guestAvatar,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <LogIn color={theme.mutedForeground} size={36} />
        </View>
        <Text
          style={[
            styles.guestTitle,
            { color: theme.foreground, fontFamily: font('editorial') },
          ]}
        >
          {t('profile.guestTitle')}
        </Text>
        <Text
          style={[
            styles.guestCopy,
            { color: theme.mutedForeground, fontFamily: font('body') },
          ]}
        >
          {t('profile.guestCopy')}
        </Text>
        <Pressable
          onPress={() => router.push('/sign-in')}
          style={[styles.primary, { backgroundColor: theme.accent }]}
        >
          <LogIn color={colors.inkInverse} size={18} />
          <Text style={[styles.primaryText, { fontFamily: font('bold') }]}>
            {t('account.signIn')}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push('/register')}>
          <Text
            style={[
              styles.register,
              { color: theme.accent, fontFamily: font('body') },
            ]}
          >
            {t('profile.register')}
          </Text>
        </Pressable>
        <View style={styles.featureChips}>
          {[
            [Heart, 'profile.tabs.likes'],
            [Bookmark, 'profile.tabs.saved'],
            [Clock3, 'profile.tabs.history'],
            [Sparkles, 'pods.feedLabel'],
          ].map(([Icon, key]) => {
            const ItemIcon = Icon as typeof Heart;
            return (
              <View
                key={String(key)}
                style={[
                  styles.featureChip,
                  { borderColor: theme.border, backgroundColor: theme.card },
                ]}
              >
                <ItemIcon color={theme.mutedForeground} size={14} />
                <Text
                  style={[
                    styles.featureText,
                    { color: theme.mutedForeground, fontFamily: font('body') },
                  ]}
                >
                  {t(String(key))}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

function ProfileHero({
  profile,
  stats,
  statsLoading,
  preferences,
  onInterests,
  onSelect,
}: {
  profile: IamProfile;
  stats?: ProfileStats;
  statsLoading: boolean;
  preferences: PreferencesResponse['declared'];
  onInterests: () => void;
  onSelect: (tab: ProfileTab) => void;
}) {
  const { t, i18n } = useTranslation();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  const { clients, subject } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const pick = async (camera: boolean) => {
    try {
      // Native avatar modules must never be evaluated while Expo Router is
      // discovering this route. Older development clients can therefore still
      // render Profile and report this optional feature's failure locally.
      const ImagePicker = await import('expo-image-picker');
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('profile.photoPermission'));
        return;
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
            mediaTypes: ['images'],
          });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setUploading(true);
      // Keep this optional native feature out of route discovery and app startup.
      // A stale development client can then fail recoverably inside the avatar
      // flow instead of preventing the entire application from rendering.
      const ImageManipulator = await import('expo-image-manipulator');
      const normalized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: Math.min(asset.width || 1024, 1024) } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      if (new File(normalized.uri).size > 5 * 1024 * 1024) {
        Alert.alert(t('profile.avatarTooLarge'));
        return;
      }
      const next = await clients.iam.uploadAvatar({
        uri: normalized.uri,
        mimeType: 'image/jpeg',
        name: 'wahb-avatar.jpg',
      });
      qc.setQueryData(['profile', subject?.id], next);
    } catch {
      Alert.alert(t('profile.avatarFailed'));
    } finally {
      setUploading(false);
    }
  };
  const choosePhoto = () =>
    Alert.alert(t('profile.changePhoto'), undefined, [
      { text: t('profile.camera'), onPress: () => void pick(true) },
      { text: t('profile.photoLibrary'), onPress: () => void pick(false) },
      { text: t('account.cancel'), style: 'cancel' },
    ]);
  const name = displayName(profile);
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <View>
      <View style={styles.hero}>
        <Pressable
          accessibilityLabel={t('profile.changePhoto')}
          accessibilityRole="button"
          onPress={choosePhoto}
          style={[
            styles.avatar,
            { borderColor: theme.border, backgroundColor: theme.card },
          ]}
        >
          {profile.avatar_url ? (
            <Image
              source={profile.avatar_url}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <Text
              style={[
                styles.avatarInitial,
                { color: theme.accent, fontFamily: font('editorial') },
              ]}
            >
              {initial}
            </Text>
          )}
          <View
            style={[
            styles.camera,
            { backgroundColor: theme.accent, borderColor: theme.background },
            isRTL ? { left: 0, right: undefined } : undefined,
          ]}
          >
            {uploading ? (
              <ActivityIndicator color={colors.inkInverse} size="small" />
            ) : (
              <Camera color={colors.inkInverse} size={15} />
            )}
          </View>
        </Pressable>
        <Text
          style={[
            styles.name,
            {
              color: theme.foreground,
              fontFamily: fontForText(name, 'editorial'),
            },
          ]}
        >
          {name}
        </Text>
        <Text
          style={[
            styles.meta,
            { color: theme.mutedForeground, fontFamily: font('mono') },
          ]}
        >{`@${name} · ${t('profile.memberSince', { year: new Date(profile.created_at).getFullYear() })}`}</Text>
        {profile.bio ? (
          <Text
            style={[
              styles.bio,
              {
                color: theme.mutedForeground,
                fontFamily: fontForText(profile.bio, 'body'),
              },
            ]}
          >
            {profile.bio}
          </Text>
        ) : null}
        <View style={[styles.actions, isRTL && styles.rowReverse]}>
          <Pressable
            onPress={() => router.push('/profile/edit')}
            style={[styles.actionPrimary, { backgroundColor: theme.accent }]}
          >
            <Text
              style={[styles.actionPrimaryText, { fontFamily: font('bold') }]}
            >
              {t('profile.edit')}
            </Text>
          </Pressable>
          <View
            style={[
              styles.actionLater,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <MoreHorizontal color={theme.mutedForeground} size={17} />
            <Text
              style={[
                styles.actionLaterText,
                { color: theme.mutedForeground, fontFamily: font('bold') },
              ]}
            >
              {t('profile.shareLater')}
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.stats, isRTL && styles.rowReverse]}>
        {(['saved', 'likes', 'listened', 'created'] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() =>
              onSelect(
                key === 'listened'
                  ? 'history'
                  : key === 'created'
                    ? 'creations'
                    : key,
              )
            }
            style={[
              styles.stat,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text
              style={[
                styles.statNumber,
                { color: theme.foreground, fontFamily: font('mono') },
              ]}
            >
              {statsLoading || !stats
                ? '—'
                : compactNumber(stats[key], i18n.language)}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: theme.mutedForeground, fontFamily: font('bold') },
              ]}
            >
              {t(`profile.stats.${key}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={onInterests}
        style={[
          styles.interests,
          isRTL && styles.rowReverse,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.interestList}>
          {preferences.length ? (
            preferences.slice(0, 3).map((topic) => (
              <Text
                key={topic.id}
                style={[
                  styles.interestText,
                  { color: theme.foreground, fontFamily: font('bold') },
                ]}
              >
                #{i18n.language.startsWith('ar')
                  ? topic.label_ar || topic.label_en
                  : topic.label_en || topic.label_ar}
              </Text>
            ))
          ) : (
            <Text
              style={[
                styles.interestText,
                { color: theme.mutedForeground, fontFamily: font('body') },
              ]}
            >
              {' '}
              {t('profile.editInterests')}
            </Text>
          )}
        </View>
        {isRTL ? (
          <ChevronLeft color={theme.mutedForeground} size={18} />
        ) : (
          <ChevronRight color={theme.mutedForeground} size={18} />
        )}
      </Pressable>
    </View>
  );
}

function ProfileLibrary({
  tab,
  saved,
  liked,
  history,
  creations,
  creationLoading,
  creationFilter,
  setCreationFilter,
  onSaved,
  onHistory,
  onCreation,
  onRemove,
  onClearHistory,
}: any) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const active =
    tab === 'saved'
      ? saved
      : tab === 'likes'
        ? liked
        : tab === 'history'
          ? history
          : null;
  const items = active?.data?.pages.flatMap((page: any) => page.items) ?? [];
  const loading = tab === 'creations' ? creationLoading : active?.isLoading;
  const rows = tab === 'creations' ? creations : items;
  const open =
    tab === 'history' ? onHistory : tab === 'creations' ? onCreation : onSaved;
  return (
    <View style={styles.library}>
      {tab === 'creations' ? (
        <View style={styles.filters}>
          {(['all', 'audio', 'writes', 'video'] as CreationFilter[]).map(
            (filter) => (
              <Pressable
                key={filter}
                onPress={() => setCreationFilter(filter)}
                style={[
                  styles.filter,
                  {
                    borderColor: theme.border,
                    backgroundColor:
                      filter === creationFilter ? theme.accent : theme.card,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color:
                        filter === creationFilter
                          ? colors.inkInverse
                          : theme.foreground,
                      fontFamily: font('bold'),
                    },
                  ]}
                >
                  {t(`profile.filters.${filter}`)}
                </Text>
              </Pressable>
            ),
          )}
        </View>
      ) : null}
      {tab === 'history' && rows.length ? (
        <Pressable
          onPress={onClearHistory}
          style={[styles.clear, { borderColor: theme.border }]}
        >
          <Text
            style={[
              styles.clearText,
              { color: theme.mutedForeground, fontFamily: font('bold') },
            ]}
          >
            {t('library.clearHistory')}
          </Text>
        </Pressable>
      ) : null}
      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.loading} />
      ) : tab !== 'creations' && active?.isError ? (
        <View style={styles.tabFailure}>
          <Text
            style={[
              styles.emptyCopy,
              { color: theme.mutedForeground, fontFamily: font('body') },
            ]}
          >
            {t('errors.copy')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void active.refetch()}
            style={[styles.tabRetry, { borderColor: theme.border }]}
          >
            <Text
              style={[
                styles.loadMoreText,
                { color: theme.foreground, fontFamily: font('bold') },
              ]}
            >
              {t('errors.retry')}
            </Text>
          </Pressable>
        </View>
      ) : rows.length ? (
        <View>
          {rows.map((item: any) => (
            <ProfileRow
              key={item.id ?? `${item.content_id}-${item.viewed_at}`}
              item={item}
              tab={tab}
              onOpen={open}
              onRemove={onRemove}
            />
          ))}
          {active?.hasNextPage ? (
            <Pressable
              onPress={() => void active.fetchNextPage()}
              style={[styles.loadMore, { borderColor: theme.border }]}
            >
              <Text
                style={[
                  styles.loadMoreText,
                  { color: theme.foreground, fontFamily: font('bold') },
                ]}
              >
                {t('library.loadMore')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <EmptyTab tab={tab} />
      )}
    </View>
  );
}

function ProfileTabs({ tab }: { tab: ProfileTab }) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  return (
    <View
      style={[
        styles.tabs,
        isRTL && styles.rowReverse,
        {
          backgroundColor: theme.background,
          borderBottomColor: theme.border,
        },
      ]}
    >
      {tabs.map((candidate) => {
        const Icon =
          candidate === 'saved'
            ? Bookmark
            : candidate === 'likes'
              ? Heart
              : candidate === 'history'
                ? Clock3
                : LayoutGrid;
        return (
          <Pressable
            key={candidate}
            onPress={() => router.setParams({ tab: candidate })}
            style={[
              styles.tab,
              candidate === tab && { borderBottomColor: theme.accent },
            ]}
          >
            <Icon
              color={candidate === tab ? theme.accent : theme.mutedForeground}
              size={18}
            />
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    candidate === tab ? theme.accent : theme.mutedForeground,
                  fontFamily: font('bold'),
                },
              ]}
            >
              {t(`profile.tabs.${candidate}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileRow({ item, tab, onOpen, onRemove }: any) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  const creation = tab === 'creations';
  const type = item.type;
  const ready = !creation || item.status === 'READY';
  const id = item.id ?? item.content_id;
  const title = item.title || 'Wahb';
  const source =
    item.source_name || item.author || (creation ? item.status : type);
  const Icon =
    type === 'VIDEO'
      ? Video
      : type === 'NEWS' || type === 'ARTICLE'
        ? FileText
        : Play;
  return (
    <View
      style={[
        styles.row,
        isRTL && styles.rowReverse,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <Pressable
        disabled={!ready}
        onPress={() => void onOpen(item)}
        style={[styles.rowMain, isRTL && styles.rowReverse]}
      >
        {item.thumbnail_url ? (
          <Image
            source={item.thumbnail_url}
            contentFit="cover"
            style={styles.thumb}
          />
        ) : (
          <View
            style={[
              styles.thumb,
              { alignItems: 'center', justifyContent: 'center' },
            ]}
          >
            <Icon color={theme.accent} size={20} />
          </View>
        )}
        <View style={styles.rowCopy}>
          <Text
            numberOfLines={2}
            style={[
              styles.rowTitle,
              {
                color: theme.foreground,
                fontFamily: fontForText(title, 'editorial'),
              },
            ]}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.rowMeta,
              { color: theme.mutedForeground, fontFamily: font('body') },
            ]}
          >
            {source}
          </Text>
        </View>
      </Pressable>
      {creation ? (
        <Text
          style={[
            styles.status,
            {
              color:
                item.status === 'FAILED' ? theme.accent : theme.mutedForeground,
              fontFamily: font('bold'),
            },
          ]}
        >
          {item.status}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            tab === 'saved' ? t('library.remove') : t('profile.unlike')
          }
          onPress={() =>
            void onRemove({ id }, tab === 'saved' ? 'bookmark' : 'like')
          }
          style={styles.remove}
        >
          <Icon color={theme.mutedForeground} size={18} />
        </Pressable>
      )}
    </View>
  );
}

function EmptyTab({ tab }: { tab: ProfileTab }) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const Icon =
    tab === 'saved'
      ? Bookmark
      : tab === 'likes'
        ? Heart
        : tab === 'history'
          ? Clock3
          : LayoutGrid;
  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { borderColor: theme.border, backgroundColor: theme.card },
        ]}
      >
        <Icon color={theme.accent} size={28} />
      </View>
      <Text
        style={[
          styles.emptyTitle,
          { color: theme.foreground, fontFamily: font('editorial') },
        ]}
      >
        {t(`profile.empty.${tab}.title`)}
      </Text>
      <Text
        style={[
          styles.emptyCopy,
          { color: theme.mutedForeground, fontFamily: font('body') },
        ]}
      >
        {t(`profile.empty.${tab}.copy`)}
      </Text>
      {tab === 'creations' ? (
        <View style={[styles.laterButton, { borderColor: theme.border }]}>
          <Text
            style={[
              styles.laterText,
              { color: theme.mutedForeground, fontFamily: font('bold') },
            ]}
          >
            {t('profile.createLater')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function InterestsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { clients, subject } = useAuth();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const qc = useQueryClient();
  const picker = useQuery({
    queryKey: ['profile-topic-picker'],
    enabled: visible,
    queryFn: () => clients.cms.getTopicPicker(),
  });
  const prefs = useQuery({
    queryKey: ['profile-preferences', subject?.id],
    enabled: visible && Boolean(subject),
    queryFn: () => clients.cms.getPreferences(),
  });
  const [selected, setSelected] = useState<string[] | null>(null);
  const selectedIds =
    selected ?? prefs.data?.declared.map((topic) => topic.id) ?? [];
  const save = useMutation({
    mutationFn: () => clients.cms.updateDeclaredTopics(selectedIds),
    onSuccess: (next) => {
      qc.setQueryData(['profile-preferences', subject?.id], next);
      onClose();
    },
  });
  const syncPreferences = (next: PreferencesResponse) =>
    qc.setQueryData(['profile-preferences', subject?.id], next);
  const muteTopic = useMutation({
    mutationFn: (topicId: string) => clients.cms.muteTopic(topicId),
    onSuccess: syncPreferences,
  });
  const unmuteTopic = useMutation({
    mutationFn: (topicId: string) => clients.cms.unmuteTopic(topicId),
    onSuccess: syncPreferences,
  });
  const restoreSource = useMutation({
    mutationFn: (sourceKey: string) => clients.cms.unmuteSource(sourceKey),
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: ['profile-preferences', subject?.id],
      }),
  });
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = current ?? selectedIds;
      return next.includes(id)
        ? next.filter((value) => value !== id)
        : [...next, id];
    });
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text
              style={[
                styles.sheetTitle,
                { color: theme.foreground, fontFamily: font('editorial') },
              ]}
            >
              {t('profile.interestsTitle')}
            </Text>
            <Pressable onPress={onClose}>
              <Text
                style={[
                  styles.close,
                  { color: theme.mutedForeground, fontFamily: font('bold') },
                ]}
              >
                {t('article.close')}
              </Text>
            </Pressable>
          </View>
          {picker.isLoading || prefs.isLoading ? (
            <ActivityIndicator color={theme.accent} style={styles.loading} />
          ) : (
            <FlatList
              data={picker.data?.topics ?? []}
              keyExtractor={(topic) => topic.id}
              contentContainerStyle={styles.topicList}
              renderItem={({ item: topic }) => {
                const active = selectedIds.includes(topic.id);
                const label = i18n.language.startsWith('ar')
                  ? topic.label_ar
                  : topic.label_en;
                return (
                  <Pressable
                    onPress={() => toggle(topic.id)}
                    style={[
                      styles.topic,
                      {
                        backgroundColor: active ? theme.accent : theme.card,
                        borderColor: active ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    {active ? (
                      <Check color={colors.inkInverse} size={15} />
                    ) : null}
                    <Text
                      style={[
                        styles.topicText,
                        {
                          color: active ? colors.inkInverse : theme.foreground,
                          fontFamily: font('body'),
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              }}
              ListFooterComponent={
                <>
                  {(prefs.data?.learned.length ?? 0) > 0 ? (
                    <View style={styles.learnedSection}>
                      <Text
                        style={[
                          styles.sheetNote,
                          {
                            color: theme.mutedForeground,
                            fontFamily: font('body'),
                          },
                        ]}
                      >
                        {t('profile.learnedTopics')}
                      </Text>
                      {prefs.data?.learned.map((topic) => (
                        <View
                          key={topic.id}
                          style={[
                            styles.learnedRow,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.card,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.learnedLabel,
                              {
                                color: theme.foreground,
                                fontFamily: font('body'),
                              },
                            ]}
                          >
                            {i18n.language.startsWith('ar')
                              ? topic.label_ar
                              : topic.label_en}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            disabled={muteTopic.isPending}
                            onPress={() => muteTopic.mutate(topic.id)}
                          >
                            <Text
                              style={[
                                styles.learnedAction,
                                {
                                  color: theme.accent,
                                  fontFamily: font('bold'),
                                },
                              ]}
                            >
                              {t('profile.muteTopic')}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {(prefs.data?.muted.length ?? 0) > 0 ? (
                    <View style={styles.learnedSection}>
                      <Text
                        style={[
                          styles.sheetNote,
                          {
                            color: theme.mutedForeground,
                            fontFamily: font('body'),
                          },
                        ]}
                      >
                        {t('profile.mutedSources')}
                      </Text>
                      {prefs.data?.muted.map((topic) => (
                        <View
                          key={topic.id}
                          style={[
                            styles.learnedRow,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.card,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.learnedLabel,
                              {
                                color: theme.foreground,
                                fontFamily: font('body'),
                              },
                            ]}
                          >
                            {i18n.language.startsWith('ar')
                              ? topic.label_ar
                              : topic.label_en}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            disabled={unmuteTopic.isPending}
                            onPress={() => unmuteTopic.mutate(topic.id)}
                          >
                            <Text
                              style={[
                                styles.learnedAction,
                                {
                                  color: theme.accent,
                                  fontFamily: font('bold'),
                                },
                              ]}
                            >
                              {t('profile.restoreTopic')}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {(prefs.data?.muted_sources.length ?? 0) > 0 ? (
                    <View style={styles.learnedSection}>
                      <Text
                        style={[
                          styles.sheetNote,
                          {
                            color: theme.mutedForeground,
                            fontFamily: font('body'),
                          },
                        ]}
                      >
                        {t('profile.mutedSources')}
                      </Text>
                      {prefs.data?.muted_sources.map((source) => (
                        <View
                          key={source.source_key}
                          style={[
                            styles.learnedRow,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.card,
                            },
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.learnedLabel,
                              {
                                color: theme.foreground,
                                fontFamily: font('body'),
                              },
                            ]}
                          >
                            {source.source_key}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            disabled={restoreSource.isPending}
                            onPress={() =>
                              restoreSource.mutate(source.source_key)
                            }
                          >
                            <Text
                              style={[
                                styles.learnedAction,
                                {
                                  color: theme.accent,
                                  fontFamily: font('bold'),
                                },
                              ]}
                            >
                              {t('profile.restoreSource')}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    disabled={save.isPending}
                    onPress={() => save.mutate()}
                    style={[
                      styles.sheetSave,
                      { backgroundColor: theme.accent },
                    ]}
                  >
                    <Text
                      style={[styles.primaryText, { fontFamily: font('bold') }]}
                    >
                      {save.isPending
                        ? t('profile.saving')
                        : t('profile.saveInterests')}
                    </Text>
                  </Pressable>
                </>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerIcon: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerPressed: { opacity: 0.74, transform: [{ scale: 0.97 }] },
  list: { paddingBottom: 120 },
  loading: { margin: spacing.xl },
  hero: {
    alignItems: 'center',
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingTop: spacing.lg,
  },
  avatar: {
    borderRadius: 56,
    borderWidth: 1,
    height: 112,
    justifyContent: 'center',
    overflow: 'visible',
    width: 112,
  },
  avatarInitial: { fontSize: 42, textAlign: 'center' },
  camera: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 2,
    bottom: 0,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 36,
  },
  rowReverse: { flexDirection: 'row-reverse' },
  name: {
    ...typeScale.featureTitle,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  meta: { ...typeScale.meta, marginTop: 2, textAlign: 'center' },
  bio: { ...typeScale.body, marginTop: spacing.sm, textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  actionPrimary: {
    alignItems: 'center',
    borderRadius: radii.compact,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  actionPrimaryText: { color: colors.inkInverse, ...typeScale.body },
  actionLater: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 44,
  },
  actionLaterText: { ...typeScale.meta },
  stats: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: layoutMetrics.pageGutter,
  },
  stat: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flex: 1,
    minHeight: 66,
    justifyContent: 'center',
  },
  statNumber: { ...typeScale.bodyLarge },
  statLabel: { ...typeScale.micro, textAlign: 'center' },
  interests: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: layoutMetrics.pageGutter,
    padding: spacing.sm,
  },
  interestList: { flex: 1, flexDirection: 'row', gap: spacing.xs },
  interestText: { ...typeScale.meta },
  library: { marginTop: spacing.md },
  tabs: { borderBottomWidth: 1, flexDirection: 'row' },
  tab: {
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    flex: 1,
    gap: 3,
    minHeight: 58,
    justifyContent: 'center',
  },
  tabText: { ...typeScale.micro, textAlign: 'center' },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    padding: layoutMetrics.pageGutter,
  },
  filter: {
    borderRadius: radii.round,
    borderWidth: 1,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  filterText: { ...typeScale.label },
  clear: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    marginHorizontal: layoutMetrics.pageGutter,
    marginTop: spacing.sm,
    minHeight: 38,
    justifyContent: 'center',
  },
  clearText: { ...typeScale.meta },
  row: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: layoutMetrics.pageGutter,
    marginTop: spacing.sm,
    minHeight: 74,
    padding: spacing.sm,
  },
  rowMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thumb: {
    backgroundColor: colors.card,
    borderRadius: radii.compact,
    height: 52,
    width: 52,
  },
  rowCopy: { flex: 1 },
  rowTitle: { ...typeScale.body },
  rowMeta: { ...typeScale.meta, marginTop: 2 },
  remove: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  status: { ...typeScale.micro, maxWidth: 68, textAlign: 'right' },
  loadMore: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    margin: layoutMetrics.pageGutter,
    minHeight: 42,
    justifyContent: 'center',
  },
  loadMoreText: { ...typeScale.meta },
  tabFailure: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  tabRetry: { borderRadius: radii.compact, borderWidth: 1, marginTop: spacing.md, minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  profileFailure: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  retry: {
    borderRadius: radii.compact,
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  emptyTitle: {
    ...typeScale.heading,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptyCopy: { ...typeScale.body, marginTop: spacing.xs, textAlign: 'center' },
  laterButton: {
    borderRadius: radii.compact,
    borderWidth: 1,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  laterText: { ...typeScale.meta },
  guest: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  guestAvatar: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  guestTitle: {
    ...typeScale.featureTitle,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  guestCopy: { ...typeScale.body, marginTop: spacing.sm, textAlign: 'center' },
  primary: {
    alignItems: 'center',
    borderRadius: radii.compact,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  primaryText: { color: colors.inkInverse, ...typeScale.body },
  register: { ...typeScale.body, marginTop: spacing.md },
  featureChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  featureChip: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  featureText: { ...typeScale.label },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.54)',
  },
  sheet: {
    borderTopLeftRadius: radii.compact,
    borderTopRightRadius: radii.compact,
    borderWidth: 1,
    maxHeight: '82%',
    padding: layoutMetrics.pageGutter,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: { ...typeScale.heading },
  close: { ...typeScale.meta },
  topicList: { gap: spacing.xs },
  topic: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
  },
  topicText: { ...typeScale.body },
  sheetNote: { ...typeScale.meta, marginTop: spacing.md },
  learnedSection: { gap: spacing.xs, marginTop: spacing.sm },
  learnedRow: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 40,
    paddingHorizontal: spacing.sm,
  },
  learnedLabel: { ...typeScale.body, flex: 1 },
  learnedAction: { ...typeScale.meta },
  sheetSave: {
    alignItems: 'center',
    borderRadius: radii.compact,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
  },
});
