import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import '@/core/i18n';

import { ReportSheet } from './report-sheet';

jest.mock('@/core/outbox/outbox-provider', () => ({
  useOutbox: jest.fn(),
}));

const mockOutboxProvider = jest.requireMock(
  '@/core/outbox/outbox-provider',
) as {
  useOutbox: jest.Mock;
};
const mockUseOutbox = mockOutboxProvider.useOutbox;
const mockEnqueue = jest.fn();

describe('ReportSheet', () => {
  it('queues a selected report for an anonymous installation', async () => {
    mockUseOutbox.mockReturnValue({ enqueue: mockEnqueue });
    const onClose = jest.fn();
    const view = await render(
      <ReportSheet
        onClose={onClose}
        target={{ id: 'content-1', type: 'content' }}
        visible
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByRole('radio', { name: 'Misinformation' }));
    });
    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Send report' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      reason: 'misinformation',
      targetId: 'content-1',
      targetType: 'content',
      type: 'report',
    });
  });

  it('queues a selected report for a verified account', async () => {
    mockUseOutbox.mockReturnValue({ enqueue: mockEnqueue });
    const onClose = jest.fn();
    const view = await render(
      <ReportSheet
        onClose={onClose}
        target={{ id: 'content-1', type: 'content' }}
        visible
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByRole('radio', { name: 'Misinformation' }));
    });
    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Send report' }));
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      reason: 'misinformation',
      targetId: 'content-1',
      targetType: 'content',
      type: 'report',
    });
  });
});
