import { Tabs } from 'expo-router';

/**
 * The visible feed navigation lives in FeedHeader. This navigator supplies
 * persistent route frames so switching feeds does not destroy scroll,
 * playback, frozen-session, or filter state.
 */
export default function FeedLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        animation: 'none',
        headerShown: false,
        lazy: true,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="news" />
      <Tabs.Screen name="saved" />
    </Tabs>
  );
}
