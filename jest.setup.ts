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
