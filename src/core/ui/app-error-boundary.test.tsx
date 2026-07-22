import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { AppErrorBoundary } from './app-error-boundary';

jest.mock('@/core/diagnostics/diagnostics', () => ({
  captureException: jest.fn(),
}));

function BrokenChild(): never {
  throw new Error('test-only render error');
}

describe('AppErrorBoundary', () => {
  it('offers an accessible recovery action instead of leaving a blank route', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const consoleWarn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const view = await render(
      <AppErrorBoundary>
        <BrokenChild />
      </AppErrorBoundary>,
    );
    expect(view.getByRole('button', { name: 'Retry' })).toBeTruthy();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
