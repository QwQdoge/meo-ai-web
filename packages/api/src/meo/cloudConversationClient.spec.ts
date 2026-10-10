import { MeoCloudConversationClient } from './cloudConversationClient';

describe('MeoCloudConversationClient', () => {
  it('uses the Account session server-side and stores only conversation text', async () => {
    const fetcher = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ conversations: [{ id: 'conversation-1', title: 'Hello', user_id: 'leak' }] }),
    );
    const client = new MeoCloudConversationClient({
      cloudUrl: 'https://ai.meoarch.org',
      accessToken: async () => 'account-session-token',
      fetcher,
    });

    const conversations = await client.listConversations();
    expect(conversations).toEqual([
      { id: 'conversation-1', title: 'Hello', createdAt: '', updatedAt: '' },
    ]);
    expect(fetcher.mock.calls[0][1]?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer account-session-token',
        'Cache-Control': 'no-store',
      }),
    );

    fetcher.mockResolvedValueOnce(
      Response.json({
        message: {
          id: 'message-1',
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          created_at: '2026-10-10T00:00:00Z',
          providerKey: 'must-not-leak',
        },
      }),
    );
    const message = await client.appendMessage('conversation-1', 'user', 'Hello');
    expect(message.content).toBe('Hello');
    expect(JSON.stringify(message)).not.toContain('must-not-leak');
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      role: 'user',
      content: 'Hello',
    });
  });

  it('rejects public HTTP cloud URLs and extracts persisted text blocks', async () => {
    expect(
      () =>
        new MeoCloudConversationClient({
          cloudUrl: 'http://ai.meoarch.org',
          accessToken: async () => 'token',
        }),
    ).toThrow('Meo AI Cloud URL must use HTTPS');
    const fetcher = async () =>
      Response.json({
        messages: [
          {
            id: 'message-1',
            role: 'assistant',
            content: [
              { type: 'text', text: 'A' },
              { type: 'text', text: 'B' },
            ],
          },
        ],
      });
    const client = new MeoCloudConversationClient({
      cloudUrl: 'https://ai.meoarch.org',
      accessToken: async () => 'token',
      fetcher,
    });
    await expect(client.listMessages('conversation-1')).resolves.toEqual([
      { id: 'message-1', role: 'assistant', content: 'AB', createdAt: '' },
    ]);
  });
});
