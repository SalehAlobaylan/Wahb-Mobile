import type { Href } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { goBackOrReplace } from '@/core/navigation/go-back';
import { layoutMetrics, typeScale } from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';

type AppSubpageHeaderProps = {
  title: string;
  fallback: Href;
  end?: ReactNode;
  testID?: string;
};

/**
 * The stable utility-screen header. It deliberately lives inside each screen's
 * safe-area shell so the back target never slips beneath an iPhone notch.
 */
export function AppSubpageHeader({
  title,
  fallback,
  end,
  testID = 'page-back',
}: AppSubpageHeaderProps) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.background, borderBottomColor: theme.border },
      ]}
    >
      <Pressable
        testID={testID}
        accessibilityLabel={t('article.back')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => goBackOrReplace(fallback)}
        style={({ pressed }) => [
          styles.back,
          { borderColor: theme.border, backgroundColor: theme.card },
          pressed && styles.pressed,
        ]}
      >
        <ArrowLeft
          color={theme.foreground}
          size={20}
          style={isRTL ? { transform: [{ rotate: '180deg' }] } : undefined}
        />
      </Pressable>
      <Text
        numberOfLines={1}
        style={[
          styles.title,
          { color: theme.foreground, fontFamily: font('editorial') },
        ]}
      >
        {title}
      </Text>
      <View style={styles.end}>{end}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: layoutMetrics.pageGutter,
  },
  back: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: { ...typeScale.heading, flex: 1, paddingHorizontal: 12, textAlign: 'center' },
  end: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 44 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.97 }] },
});
