import { render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import i18n from '@/core/i18n';
import { AppErrorBoundary } from './app-error-boundary';

jest.mock('@/core/diagnostics/diagnostics', () => ({
  captureException: jest.fn(),
}));

function BrokenChild(): never {
  throw new Error('test-only render error');
}

describe('AppErrorBoundary', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

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
