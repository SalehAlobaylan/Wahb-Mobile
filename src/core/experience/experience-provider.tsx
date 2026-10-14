import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import { usePathname } from 'expo-router';
import i18n from 'i18next';
import { usePlaybackController } from '@/features/playback/playback-provider';
import { createRouteContinuityExperience } from './route-continuity';
import { getEnv } from '@/core/config/env';
import {
  createExperienceCollector,
  emitEvent,
  flushExperience,
  setExperienceCollector,
} from './collector';
import {
  setExperienceForeground,
  setExperienceSurface,
  getExperienceSurface,
} from './lifecycle';

let initialized = false;
export function ExperienceProvider() {
  const path = usePathname();
  const playback = usePlaybackController();
  const continuity = useRef<ReturnType<
    typeof createRouteContinuityExperience
  > | null>(null);
  useEffect(() => {
    continuity.current ??= createRouteContinuityExperience(path);
    continuity.current.observe({
      path,
      contentId: playback.item?.id,
      position: playback.currentTimeSeconds,
      rate: playback.rate,
      phase: playback.phase,
      buffering: playback.isBuffering,
    });
  }, [
    path,
    playback.item?.id,
    playback.currentTimeSeconds,
    playback.rate,
    playback.phase,
    playback.isBuffering,
  ]);
  useEffect(
    () => () => {
      continuity.current?.dispose();
      continuity.current = null;
    },
    [],
  );
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const env = getEnv();
    const configuredRelease = env.EXPO_PUBLIC_APP_RELEASE;
    const release =
      !__DEV__ && configuredRelease === 'dev'
        ? ''
        : configuredRelease || (__DEV__ ? 'dev' : '');
    const collector = createExperienceCollector({
      release,
      locale: () => {
        const language = i18n.language?.split('-')[0];
        return language === 'ar' || language === 'en' ? language : 'unknown';
      },
      client: {
        platform: Platform.OS,
        os_major: Math.min(
          999,
          Math.max(0, parseInt(Device.osVersion || '', 10) || 0),
        ),
        browser_family: 'other',
        browser_major: 0,
        installed_pwa: false,
        device_class:
          Device.deviceType === Device.DeviceType.TABLET ? 'tablet' : 'mobile',
        network_class: 'unknown',
      },
      transport: async (path, body, ticket) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(
            env.EXPO_PUBLIC_CMS_URL + '/api/v1' + path,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(ticket ? { 'X-RUX-Native-Ticket': ticket } : {}),
              },
              body: JSON.stringify(body),
              signal: controller.signal,
            },
          );
          if (response.status >= 400 && response.status < 500)
            return {
              disabled: response.status === 429 || response.status === 409,
              ticketRejected: response.status === 401,
            };
          if (!response.ok) throw Error('telemetry unavailable');
          return await response.json();
        } finally {
          clearTimeout(timeout);
        }
      },
    });
    if (!initialized) {
      setExperienceCollector(collector);
      initialized = true;
    } else collector.dispose();
    setExperienceForeground(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', (state) => {
      setExperienceForeground(state === 'active');
      if (state !== 'active') flushExperience();
      else
        emitEvent({
          event_type: 'session_started',
          surface: getExperienceSurface(),
          measurements: { visible: true },
        });
    });
    return () => {
      listener.remove();
      setExperienceForeground(false);
      flushExperience();
    };
  }, []);
  useEffect(() => {
    const surface =
      path.includes('news') || path.includes('article')
        ? 'news'
        : path.includes('pods') || path === '/'
          ? 'pods'
          : null;
    if (surface) setExperienceSurface(surface);
    if (surface)
      emitEvent({
        event_type: 'session_started',
        surface,
        measurements: { visible: AppState.currentState === 'active' },
      });
  }, [path]);
  return null;
}
