import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { parseWahbLink } from './link-dispatcher';

function dispatch(url: string): void {
  const intent = parseWahbLink(url);
  if (!intent) {
    return;
  }
  if (intent.type === 'content') {
    router.push({
      pathname: '/article/[id]',
      params: { id: intent.contentId },
    });
    return;
  }
  if (intent.type === 'verify-email') {
    router.replace({
      pathname: '/verify-email',
      params: { token: intent.token },
    });
    return;
  }
  router.replace({
    pathname: '/reset-password',
    params: { token: intent.token },
  });
}

/** One source-agnostic boundary that notifications can reuse later. */
export function LinkDispatcherProvider() {
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) {
        dispatch(url);
      }
    });
    const subscription = Linking.addEventListener('url', ({ url }) =>
      dispatch(url),
    );
    return () => subscription.remove();
  }, []);
  return null;
}
