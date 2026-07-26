import { router, type Href } from 'expo-router';

/**
 * Returns to the previous route when the app owns a navigation history.
 * Deep links and cold launches do not have one, so they replace themselves
 * with a deliberate parent destination instead of dispatching an unhandled
 * GO_BACK action.
 */
export function goBackOrReplace(fallback: Href) {
  const navigation = router as typeof router & {
    canGoBack?: () => boolean;
  };

  // Some Expo Router runtimes do not expose `canGoBack` on the imperative
  // router. Treat that as no owned history: dispatching GO_BACK in that state
  // produces an unhandled navigation action and leaves a cold-launched route
  // (such as Profile) stranded.
  if (navigation.canGoBack?.() === true) {
    router.back();
    return;
  }

  router.replace(fallback);
}
