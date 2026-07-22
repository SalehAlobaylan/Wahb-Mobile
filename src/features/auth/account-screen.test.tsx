import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import '@/core/i18n';
import { verifiedUserSession } from '@/testing/fixtures';

import { AccountScreen } from './account-screen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => ({}) }));
jest.mock('@/core/database/reset-local-data', () => ({
  clearLocalWahbData: jest.fn(),
}));
jest.mock('./auth-provider', () => ({ useAuth: jest.fn() }));

const mockExpoRouter = jest.requireMock('expo-router') as {
  router: { push: jest.Mock };
};
const mockAuthProvider = jest.requireMock('./auth-provider') as {
  useAuth: jest.Mock;
};
const mockRouter = mockExpoRouter.router;
const mockUseAuth = mockAuthProvider.useAuth;
const mockLogout = jest.fn();
const mockResetLocalData = jest.fn();

describe('AccountScreen', () => {
  it('gives every authenticated account route a truthful unique selector', async () => {
    mockUseAuth.mockReturnValue({
      ...verifiedUserSession(),
      logout: mockLogout,
      resetLocalData: mockResetLocalData,
    });

    const view = await render(<AccountScreen />);

    await act(async () => {
      fireEvent.press(view.getByTestId('account-profile'));
      fireEvent.press(view.getByTestId('account-interests'));
      fireEvent.press(view.getByTestId('account-saved'));
      fireEvent.press(view.getByTestId('account-history'));
      fireEvent.press(view.getByTestId('account-settings'));
      fireEvent.press(view.getByTestId('account-delete'));
    });

    expect(mockRouter.push).toHaveBeenNthCalledWith(1, '/profile');
    expect(mockRouter.push).toHaveBeenNthCalledWith(2, '/interests');
    expect(mockRouter.push).toHaveBeenNthCalledWith(3, '/saved');
    expect(mockRouter.push).toHaveBeenNthCalledWith(4, '/history');
    expect(mockRouter.push).toHaveBeenNthCalledWith(5, '/settings');
    expect(mockRouter.push).toHaveBeenNthCalledWith(6, '/delete-account');
  });
});
