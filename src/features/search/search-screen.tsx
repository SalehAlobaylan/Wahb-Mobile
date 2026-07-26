import Storage from 'expo-sqlite/kv-store';
import { router } from 'expo-router';
import { ArrowLeft, Clock3, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';
import { layoutMetrics, radii, spacing } from '@/design/tokens';
import { goBackOrReplace } from '@/core/navigation/go-back';

import { searchFixtures, type SearchFixture } from './search-fixtures';

const recentKey = 'search-recent-v1';
const filters: ('all' | SearchFixture['type'])[] = [
  'all',
  'NEWS',
  'VIDEO',
  'PODCAST',
];

export function SearchScreen() {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('all');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    void Storage.getItem(recentKey).then((value) =>
      setRecent(value ? JSON.parse(value) : []),
    );
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!debounced) return;
    const timer = setTimeout(() => {
      setRecent((current) => {
        const next = [
          debounced,
          ...current.filter((item) => item !== debounced),
        ].slice(0, 10);
        void Storage.setItem(recentKey, JSON.stringify(next));
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [debounced]);

  const results = useMemo(() => {
    const normalized = debounced.toLocaleLowerCase();
    return searchFixtures.filter(
      (item) =>
        (filter === 'all' || item.type === filter) &&
        (!normalized ||
          `${item.title} ${item.source} ${item.excerpt}`
            .toLocaleLowerCase()
            .includes(normalized)),
    );
  }, [debounced, filter]);

  if (!__DEV__) {
    return <UnavailableSearch />;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          accessibilityLabel={t('auth.back')}
          onPress={() => goBackOrReplace('/')}
          style={[
            styles.icon,
            { borderColor: theme.border, backgroundColor: theme.muted },
          ]}
        >
          <ArrowLeft color={theme.foreground} size={20} />
        </Pressable>
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: theme.muted, borderColor: theme.border },
          ]}
        >
          <Search color={theme.mutedForeground} size={17} />
          <TextInput
            autoFocus
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor={theme.mutedForeground}
            style={[
              styles.input,
              { color: theme.foreground, fontFamily: font('body') },
            ]}
            value={query}
          />
          {query ? (
            <Pressable
              accessibilityLabel={t('search.clear')}
              onPress={() => setQuery('')}
            >
              <X color={theme.foreground} size={17} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.filters}>
        {filters.map((value) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            style={[
              styles.filter,
              { borderColor: theme.border },
              filter === value && {
                backgroundColor: theme.accent,
                borderColor: theme.accent,
              },
            ]}
          >
            <Text
              style={{
                color: filter === value ? '#fff' : theme.foreground,
                fontFamily: font('bold'),
                fontSize: 11,
              }}
            >
              {t(`search.${value.toLowerCase()}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {!debounced ? (
          <View>
            <Text
              style={[
                styles.section,
                { color: theme.foreground, fontFamily: font('editorial') },
              ]}
            >
              {t('search.trending')}
            </Text>
            <View style={styles.chips}>
              {['AI', 'Saudi Arabia', 'Podcasts', 'Science'].map((topic) => (
                <Pressable
                  key={topic}
                  onPress={() => setQuery(topic)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.muted, borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.foreground,
                      fontFamily: font('medium'),
                    }}
                  >
                    {topic}
                  </Text>
                </Pressable>
              ))}
            </View>
            {recent.length ? (
              <>
                <Text
                  style={[
                    styles.section,
                    { color: theme.foreground, fontFamily: font('editorial') },
                  ]}
                >
                  {t('search.recent')}
                </Text>
                {recent.map((term) => (
                  <Pressable
                    key={term}
                    onPress={() => setQuery(term)}
                    style={styles.recent}
                  >
                    <Clock3 color={theme.mutedForeground} size={16} />
                    <Text
                      style={{
                        color: theme.foreground,
                        fontFamily: font('body'),
                      }}
                    >
                      {term}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>
        ) : (
          <>
            <Text
              style={[
                styles.sample,
                { color: theme.mutedForeground, fontFamily: font('mono') },
              ]}
            >
              {t('search.sample')}
            </Text>
            {results.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  router.push(
                    item.type === 'NEWS' ? `/article/${item.id}` : '/',
                  )
                }
                style={[
                  styles.result,
                  { backgroundColor: theme.muted, borderColor: theme.border },
                ]}
              >
                <Text
                  style={{
                    color: theme.accent,
                    fontFamily: font('bold'),
                    fontSize: 10,
                  }}
                >
                  {item.type}
                </Text>
                <Text
                  style={{
                    color: theme.foreground,
                    fontFamily: font('editorial'),
                    fontSize: 18,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    color: theme.mutedForeground,
                    fontFamily: font('body'),
                    fontSize: 13,
                  }}
                >
                  {item.source} · {item.excerpt}
                </Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function UnavailableSearch() {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <SafeAreaView
      style={[styles.unavailable, { backgroundColor: theme.background }]}
    >
      <Search color={theme.accent} size={32} />
      <Text
        style={{
          color: theme.foreground,
          fontFamily: font('editorial'),
          fontSize: 25,
        }}
      >
        {t('search.unavailable')}
      </Text>
      <Text
        style={{
          color: theme.mutedForeground,
          fontFamily: font('body'),
          textAlign: 'center',
        }}
      >
        {t('search.unavailableCopy')}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingVertical: layoutMetrics.pageTop,
  },
  icon: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  inputWrap: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 42,
    paddingHorizontal: spacing.sm,
  },
  input: { flex: 1, fontSize: 15 },
  filters: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingVertical: layoutMetrics.pageTop,
  },
  filter: {
    borderRadius: radii.round,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  content: {
    gap: spacing.sm,
    paddingBottom: layoutMetrics.pageBottom,
    paddingHorizontal: layoutMetrics.pageGutter,
  },
  section: { fontSize: 22, marginBottom: spacing.sm, marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: radii.round,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
  },
  sample: {
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  result: {
    borderRadius: radii.compact,
    borderWidth: 1,
    gap: 5,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  unavailable: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
