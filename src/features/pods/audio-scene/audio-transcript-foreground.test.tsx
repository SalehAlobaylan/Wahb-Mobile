import { describe, expect, it, jest } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react-native';
import type { Transcript } from '@/core/api';
import { AudioTranscriptForeground } from './audio-transcript-foreground';
const Native =
  jest.requireActual<typeof import('react-native')>('react-native');

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));
jest
  .spyOn(Native, 'useWindowDimensions')
  .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });

const transcript: Transcript = {
  id: 't',
  content_item_id: 'child',
  full_text: 'One. Two. Three. Four. Five.',
  created_at: '2026-10-04T00:00:00Z',
  segments: Array.from({ length: 5 }, (_, i) => ({
    text: ['One.', 'Two.', 'Three.', 'Four.', 'Five.'][i],
    start: i * 2,
    end: i * 2 + 1,
  })),
};
const props = {
  itemId: 'child',
  title: 'عنوان عربي',
  sourceName: 'Source',
  duration: 270,
  transcript,
  showTranscript: true,
  positionSeconds: 4.5,
  loading: false,
  error: false,
  onRetry: jest.fn(),
  onRead: jest.fn(),
};

describe('native audio foreground', () => {
  it('mounts a bounded phrase window and uses the existing transcript sheet', async () => {
    const view = await render(<AudioTranscriptForeground {...props} />);
    expect(view.getByTestId('pods-audio-active-cue')).toHaveTextContent(
      'Three.',
    );
    expect(view.queryByText('One.')).toBeNull();
    expect(view.queryByText('Five.')).toBeNull();
    await fireEvent.press(view.getByTestId('pods-audio-open-transcript'));
    expect(props.onRead).toHaveBeenCalledTimes(1);
    await view.rerender(
      <AudioTranscriptForeground {...props} positionSeconds={5.5} />,
    );
    expect(view.queryByTestId('pods-audio-active-cue')).toBeNull();
  });
  it('never shows another item transcript or invents timing for full text', async () => {
    const view = await render(
      <AudioTranscriptForeground
        {...props}
        transcript={{ ...transcript, content_item_id: 'other' }}
      />,
    );
    expect(view.queryByText('Three.')).toBeNull();
    await view.rerender(
      <AudioTranscriptForeground
        {...props}
        transcript={{ ...transcript, segments: undefined }}
      />,
    );
    expect(view.getByText('pods.untimedTranscript')).toBeTruthy();
    expect(view.queryByTestId('pods-audio-active-cue')).toBeNull();
  });
  it('retains source identity without foreground captions in Listen mode', async () => {
    const view = await render(
      <AudioTranscriptForeground {...props} showTranscript={false} />,
    );
    expect(view.getByText('عنوان عربي')).toBeTruthy();
    expect(view.queryByTestId('pods-audio-cues')).toBeNull();
    expect(view.queryByTestId('pods-audio-open-transcript')).toBeNull();
  });
  it('removes neighboring phrases before falling back to the reader when text cannot fit', async () => {
    const view = await render(<AudioTranscriptForeground {...props} />);
    await fireEvent(view.getByTestId('pods-audio-cue-area'), 'layout', {
      nativeEvent: { layout: { width: 220, height: 300 } },
    });
    await fireEvent(view.getByTestId('pods-audio-cues'), 'layout', {
      nativeEvent: { layout: { height: 340 } },
    });
    expect(view.queryByText('Two.')).toBeNull();
    expect(view.getByTestId('pods-audio-active-cue')).toHaveTextContent(
      'Three.',
    );
    await fireEvent(view.getByTestId('pods-audio-cues'), 'layout', {
      nativeEvent: { layout: { height: 320 } },
    });
    expect(view.queryByTestId('pods-audio-active-cue')).toBeNull();
    expect(view.getByText('pods.readPassage')).toBeTruthy();
    await fireEvent.press(view.getByTestId('pods-audio-open-transcript'));
    expect(props.onRead).toHaveBeenCalled();
  });
  it('keeps the reader available at large text sizes without mounting partial captions', async () => {
    jest
      .spyOn(Native, 'useWindowDimensions')
      .mockReturnValueOnce({
        width: 320,
        height: 568,
        scale: 2,
        fontScale: 2,
      })
      .mockReturnValueOnce({ width: 320, height: 568, scale: 2, fontScale: 2 });
    const view = await render(<AudioTranscriptForeground {...props} />);
    expect(view.queryByTestId('pods-audio-active-cue')).toBeNull();
    expect(view.getByTestId('pods-audio-open-transcript')).toBeTruthy();
  });
});
