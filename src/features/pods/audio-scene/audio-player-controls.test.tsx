import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { AudioPlayerControls } from './audio-player-controls';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('@react-native-community/slider', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return View;
});

const props = {
  position: 40,
  duration: 298,
  playing: false,
  buffering: false,
  disabled: false,
  rate: 1,
  onToggle: jest.fn(),
  onSeek: jest.fn(),
  onRate: jest.fn(),
  onScrubChange: jest.fn(),
};

describe('native audio transport', () => {
  it('cancels a scrub without seeking or leaving the feed locked', async () => {
    const seek = jest.fn();
    const dragging = jest.fn();
    const view = await render(
      <AudioPlayerControls {...props} onSeek={seek} onScrubChange={dragging} />,
    );
    await fireEvent(view.getByTestId('pods-audio-scrubber'), 'slidingStart');
    await fireEvent(
      view.getByTestId('pods-audio-scrubber'),
      'valueChange',
      130,
    );
    await fireEvent(view.getByTestId('pods-audio-player'), 'touchCancel');
    expect(seek).not.toHaveBeenCalled();
    expect(dragging).toHaveBeenLastCalledWith(false);
    expect(view.getByText('0:40')).toBeTruthy();
  });
  it('seeks only after scrubbing finishes and preserves the pause state', async () => {
    const seek = jest.fn();
    const view = await render(<AudioPlayerControls {...props} onSeek={seek} />);
    const slider = view.getByTestId('pods-audio-scrubber');
    await fireEvent(slider, 'slidingStart');
    await fireEvent(slider, 'valueChange', 120);
    await fireEvent(slider, 'valueChange', 130);
    expect(seek).not.toHaveBeenCalled();
    expect(view.getByText('2:10')).toBeTruthy();
    await fireEvent(slider, 'slidingComplete', 130);
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(130);
    expect(props.onToggle).not.toHaveBeenCalled();
    expect(props.onScrubChange).toHaveBeenLastCalledWith(false);
  });
  it('bounds skips to the item and cycles temporary playback speed', async () => {
    const seek = jest.fn();
    const view = await render(
      <AudioPlayerControls {...props} position={2} onSeek={seek} />,
    );
    await fireEvent.press(
      view.getByRole('button', { name: 'nowPlaying.back15' }),
    );
    expect(seek).toHaveBeenLastCalledWith(0);
    await view.rerender(
      <AudioPlayerControls {...props} position={297} onSeek={seek} />,
    );
    await fireEvent.press(
      view.getByRole('button', { name: 'nowPlaying.forward15' }),
    );
    expect(seek).toHaveBeenLastCalledWith(298);
    await fireEvent.press(
      view.getByRole('button', { name: 'pods.changeSpeed' }),
    );
    expect(props.onRate).toHaveBeenLastCalledWith(1.25);
  });
  it('lets a paused unselected item start, prevents seeking a previous owner, and releases paging on unmount', async () => {
    const toggle = jest.fn();
    const dragging = jest.fn();
    const view = await render(
      <AudioPlayerControls
        {...props}
        seekable={false}
        onToggle={toggle}
        onScrubChange={dragging}
      />,
    );
    expect(view.getByTestId('pods-audio-scrubber').props.disabled).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: 'pods.play' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(dragging).toHaveBeenLastCalledWith(false);
  });
});
