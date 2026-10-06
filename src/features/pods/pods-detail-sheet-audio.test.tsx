import { describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { createRef } from 'react';
import type { PodsItem } from '@/core/api';
import {
  PodsDetailSheet,
  type PodsDetailSheetHandle,
} from './pods-detail-sheet';
import { useTranscriptQuery } from './use-transcript-query';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/core/haptics/feedback', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ clients: {}, subject: null }),
}));
jest.mock('@/core/outbox/outbox-provider', () => ({ useOutbox: () => ({}) }));
jest.mock('@/features/moderation/report-sheet', () => ({
  ReportSheet: () => null,
}));
jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => ({ data: undefined }),
  useMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('./use-transcript-query', () => ({ useTranscriptQuery: jest.fn() }));
jest.mock('@/components/feed/draggable-bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    DraggableBottomSheet: React.forwardRef(function MockDraggableBottomSheet(
      props: {
        onSnapChange: (value: string) => void;
        expandedContent: import('react').ReactNode;
      },
      ref,
    ) {
      React.useImperativeHandle(ref, () => ({
        expand: () => props.onSnapChange('expanded'),
        collapse: () => props.onSnapChange('collapsed'),
      }));
      return props.expandedContent;
    }),
  };
});

const query = jest.mocked(useTranscriptQuery);
const item = {
  id: 'child',
  transcript_id: 'transcript',
  title: 'Title',
  duration_sec: 270,
} as PodsItem;
const props = {
  item,
  installationId: 'installation',
  visible: true,
  collapsedContent: null,
};

describe('native audio transcript sheet', () => {
  it('keeps publisher, source, original range and publication date in About', async () => {
    query.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTranscriptQuery>);
    const ref = createRef<PodsDetailSheetHandle>();
    const view = await render(
      <PodsDetailSheet
        {...props}
        ref={ref}
        item={{
          ...item,
          author: 'Publisher',
          source_name: 'Show',
          parent_id: 'parent',
          chapter_start_ms: 1300500,
          chapter_end_ms: 1598500,
          published_at: '2026-06-16T03:00:15Z',
        }}
      />,
    );
    await act(() => ref.current?.open('about'));
    expect(view.getByText('Publisher')).toBeTruthy();
    expect(view.getByText('Show')).toBeTruthy();
    expect(view.getByText('21:40–26:38')).toBeTruthy();
    expect(view.getByText('June 16, 2026')).toBeTruthy();
  });
  it('reads approved word-only text and suspends requests when collapsed or unfocused', async () => {
    query.mockReturnValue({
      data: {
        content_item_id: 'child',
        full_text: '',
        word_timestamps: [
          { word: 'Hello', start: 0, end: 1 },
          { word: 'world', punctuated_word: 'world.', start: 1, end: 2 },
        ],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTranscriptQuery>);
    const ref = createRef<PodsDetailSheetHandle>();
    const view = await render(<PodsDetailSheet {...props} ref={ref} />);
    expect(query).toHaveBeenLastCalledWith('transcript', false);
    await act(() => ref.current?.open('transcript'));
    expect(query).toHaveBeenLastCalledWith('transcript', true);
    expect(view.getByText('Hello world.')).toBeTruthy();
    await view.rerender(
      <PodsDetailSheet {...props} visible={false} ref={ref} />,
    );
    expect(query).toHaveBeenLastCalledWith('transcript', false);
  });
  it('offers retry for a mismatched owner without exposing another item text', async () => {
    query.mockReturnValue({
      data: { content_item_id: 'parent', full_text: 'Parent text.' },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTranscriptQuery>);
    const ref = createRef<PodsDetailSheetHandle>();
    const view = await render(<PodsDetailSheet {...props} ref={ref} />);
    await act(() => ref.current?.open('transcript'));
    expect(view.queryByText('Parent text.')).toBeNull();
    expect(view.getByText('pods.retry')).toBeTruthy();
  });
});
