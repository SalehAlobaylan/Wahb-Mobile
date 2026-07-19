import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initializeDatabase } from '@/core/database/migrations';
import { initializeDiagnostics } from '@/core/diagnostics/sentry';
import '@/core/i18n';
import { queryClient } from '@/core/query/query-client';
import { AppErrorBoundary } from '@/core/ui/app-error-boundary';
import { OutboxProvider } from '@/core/outbox/outbox-provider';
import { AuthProvider } from '@/features/auth/auth-provider';
import { LinkDispatcherProvider } from '@/features/auth/link-dispatcher-provider';
import { PlaybackProvider } from '@/features/playback/playback-provider';
import { NonFeedNowPlaying } from '@/features/playback/non-feed-now-playing';

void SplashScreen.preventAutoHideAsync();
initializeDiagnostics();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans: DMSans_400Regular,
    DMSansMedium: DMSans_500Medium,
    DMSansBold: DMSans_700Bold,
    PlayfairDisplayBold: PlayfairDisplay_700Bold,
    GeistMonoMedium: GeistMono_500Medium,
    Handicrafts: require('../../assets/fonts/TheYearofHandicrafts-Regular.otf'),
    HandicraftsMedium: require('../../assets/fonts/TheYearofHandicrafts-Medium.otf'),
    HandicraftsSemiBold: require('../../assets/fonts/TheYearofHandicrafts-SemiBold.otf'),
    HandicraftsBold: require('../../assets/fonts/TheYearofHandicrafts-Bold.otf'),
    HandicraftsBlack: require('../../assets/fonts/TheYearofHandicrafts-Black.otf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SQLiteProvider databaseName="wahb.db" onInit={initializeDatabase}>
          <AuthProvider>
            <OutboxProvider>
              <PlaybackProvider>
                <StatusBar style="auto" />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="news" />
                  <Stack.Screen name="article/[id]" />
                  <Stack.Screen name="sign-in" />
                  <Stack.Screen name="register" />
                  <Stack.Screen name="check-email" />
                  <Stack.Screen name="forgot-password" />
                  <Stack.Screen name="reset-password" />
                  <Stack.Screen name="verify-email" />
                  <Stack.Screen name="account" />
                </Stack>
                <LinkDispatcherProvider />
                <NonFeedNowPlaying />
              </PlaybackProvider>
            </OutboxProvider>
          </AuthProvider>
        </SQLiteProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
