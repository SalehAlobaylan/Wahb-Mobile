import '@testing-library/react-native';
import { jest } from '@jest/globals';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy(
    {},
    {
      get: () => () => React.createElement(Text),
    },
  );
});

// Loading the native Sentry package starts an internal cleanup interval even
// when diagnostics are disabled. Unit tests exercise Wahb's redaction and
// event boundaries, not Sentry's SDK internals, so keep that native timer out
// of the hermetic Jest runtime.
jest.mock('@sentry/react-native', () => ({
  captureMessage: jest.fn(),
  init: jest.fn(),
  setTag: jest.fn(),
  withScope: (
    callback: (scope: { setContext: jest.Mock; setTag: jest.Mock }) => void,
  ) => callback({ setContext: jest.fn(), setTag: jest.fn() }),
}));

/**
 * Unit and rendered-component tests must be hermetic. API tests inject a
 * transport fetch implementation explicitly; any unmocked request is a test
 * failure instead of an accidental call to a developer, staging, or public
 * service.
 */
globalThis.fetch = async () => {
  throw new Error(
    'Unexpected network request in a hermetic test. Inject a fixture transport instead.',
  );
};
