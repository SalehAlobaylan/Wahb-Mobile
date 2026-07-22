import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import '@/core/i18n';
import { verifiedUserSession } from '@/testing/fixtures';

import { InterestsScreen } from './interests-screen';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('./../auth/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

const mockUseAuth = (
  jest.requireMock('./../auth/auth-provider') as { useAuth: jest.Mock }
).useAuth;
const query = jest.requireMock('@tanstack/react-query') as {
  useMutation: jest.Mock;
  useQuery: jest.Mock;
};

describe('InterestsScreen', () => {
  it('renders a server-owned muted source and restores it through the authenticated API', async () => {
    const unmuteSource = jest.fn();
    const restoreMutation = { mutate: jest.fn() };
    mockUseAuth.mockReturnValue({
      ...verifiedUserSession(),
      clients: {
        cms: {
          getPreferences: jest.fn(),
          getTopicPicker: jest.fn(),
          unmuteSource,
          updateDeclaredTopics: jest.fn(),
        },
      },
    });
    query.useQuery
      .mockReturnValueOnce({
        data: { topics: [] },
        isLoading: false,
      })
      .mockReturnValueOnce({
        data: {
          declared: [],
          learned: [],
          muted: [],
          muted_sources: [{ source_key: 'feed:example.com', state: 'muted' }],
        },
        isLoading: false,
        refetch: jest.fn(),
      });
    query.useMutation
      .mockReturnValueOnce({ mutate: jest.fn(), isPending: false })
      .mockReturnValueOnce(restoreMutation);

    const view = await render(<InterestsScreen />);

    expect(view.getByText('Muted sources')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Restore: example.com' }));
    expect(restoreMutation.mutate).toHaveBeenCalledWith('feed:example.com');
  });
});
