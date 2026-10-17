import { renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { useAudioErrorRecovery } from './use-audio-error-recovery';

describe('native audio failure recovery', () => {
  it('does not loop when recovery re-renders with a retained native error', async () => {
    const recover = jest.fn();
    const view = await renderHook(
      ({ error }: { error: string | null }) => {
        // The provider callback changes as the replacement updates its snapshot.
        useAudioErrorRecovery(error, () => recover());
      },
      {
        initialProps: { error: 'source unavailable' } as {
          error: string | null;
        },
      },
    );
    for (let i = 0; i < 8; i++)
      await view.rerender({ error: 'source unavailable' });
    expect(recover).toHaveBeenCalledTimes(1);
    await view.rerender({ error: null });
    await view.rerender({ error: 'source unavailable' });
    expect(recover).toHaveBeenCalledTimes(2);
    await view.unmount();
  });
});
