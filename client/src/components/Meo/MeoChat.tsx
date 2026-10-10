import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import remarkGfm from 'remark-gfm';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';

type Connection = {
  id: string;
  provider: string;
  displayName: string;
  defaultModel: string;
  secretHint: string;
};
type Model = { id: string; name: string; description?: string };
type Message = { role: 'user' | 'assistant'; content: string };
type SavedConversation = { id: string; title: string; updatedAt: number; messages: Message[] };
type Consent = {
  requestId: string;
  payloadSha256: string;
  confirmationVersion: number;
  providerName: string;
  model: string;
  purpose: string;
  dataCategories: string[];
  destination: string;
  promptCharacters: number;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof value.error === 'string' ? value.error : `Request failed (${response.status})`,
    );
  return value as T;
}

export default function MeoChat() {
  const { t } = useTranslation();
  const { user } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = `meo-ai-web:v1:${user?.id ?? 'anonymous'}`;
  const [history, setHistory] = useState<SavedConversation[]>([]);
  const historyRef = useRef<SavedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [credentialId, setCredentialId] = useState(searchParams.get('connection') ?? '');
  const [model, setModel] = useState(searchParams.get('model') ?? '');
  const modelRef = useRef(model);
  modelRef.current = model;
  const [models, setModels] = useState<Model[]>([]);
  const [modelDiscovery, setModelDiscovery] = useState<'idle' | 'unsupported' | 'ready'>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      const conversations = Array.isArray(saved.conversations)
        ? (saved.conversations as SavedConversation[])
        : [];
      const activeId = typeof saved.activeId === 'string' ? saved.activeId : '';
      const active = conversations.find((item) => item.id === activeId);
      setHistory(conversations);
      historyRef.current = conversations;
      setActiveConversationId(activeId || crypto.randomUUID());
      setMessages(active?.messages ?? []);
    } catch {
      setHistory([]);
      historyRef.current = [];
      setActiveConversationId(crypto.randomUUID());
      setMessages([]);
    } finally {
      setHistoryLoaded(true);
    }
  }, [storageKey]);
  useEffect(() => {
    if (!user?.id || !historyLoaded || !activeConversationId || messages.length === 0) return;
    const title = messages.find((item) => item.role === 'user')?.content.slice(0, 80) || 'New chat';
    const conversation: SavedConversation = {
      id: activeConversationId,
      title,
      updatedAt: Date.now(),
      messages: messages.slice(-200),
    };
    const next = [
      conversation,
      ...historyRef.current.filter((item) => item.id !== activeConversationId),
    ].slice(0, 50);
    historyRef.current = next;
    setHistory(next);
    localStorage.setItem(
      storageKey,
      JSON.stringify({ activeId: activeConversationId, conversations: next }),
    );
  }, [activeConversationId, historyLoaded, messages, storageKey, user?.id]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    json<{ connections: Connection[] }>('/api/meo/connections')
      .then(({ connections: result }) => {
        if (!active) return;
        setConnections(result);
        const requested = searchParams.get('connection');
        const selected = result.find((item) => item.id === requested) ?? result[0];
        if (selected) setCredentialId(selected.id);
        if (!searchParams.get('model') && selected?.defaultModel) setModel(selected.defaultModel);
      })
      .catch((reason: Error) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [model, searchParams]);
  useEffect(() => {
    if (!credentialId) return;
    let active = true;
    setModelDiscovery('idle');
    json<{ supported: boolean; models: Model[] }>(
      `/api/meo/connections/${encodeURIComponent(credentialId)}/models`,
    )
      .then((result) => {
        if (!active) return;
        setModels(result.models);
        setModelDiscovery(result.supported ? 'ready' : 'unsupported');
        if (!modelRef.current && result.models[0]) setModel(result.models[0].id);
      })
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [credentialId]);

  const selected = useMemo(
    () => connections.find((item) => item.id === credentialId),
    [connections, credentialId],
  );
  const changeConnection = useCallback(
    (id: string) => {
      setCredentialId(id);
      setModel(connections.find((item) => item.id === id)?.defaultModel ?? '');
      const next = new URLSearchParams(searchParams);
      if (id) next.set('connection', id);
      else next.delete('connection');
      setSearchParams(next, { replace: true });
    },
    [connections, searchParams, setSearchParams],
  );

  const startNewChat = () => {
    const id = crypto.randomUUID();
    setActiveConversationId(id);
    setMessages([]);
    if (user?.id)
      localStorage.setItem(
        storageKey,
        JSON.stringify({ activeId: id, conversations: historyRef.current }),
      );
  };
  const openConversation = (conversation: SavedConversation) => {
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    if (user?.id)
      localStorage.setItem(
        storageKey,
        JSON.stringify({ activeId: conversation.id, conversations: historyRef.current }),
      );
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy || !credentialId || !model.trim()) return;
    setError('');
    setBusy(true);
    const nextMessages: Message[] = [...messages, { role: 'user', content: prompt }];
    try {
      const prepared = await json<{ consent: Consent }>('/api/meo/chat/prepare', {
        method: 'POST',
        body: JSON.stringify({ credentialId, model: model.trim(), messages: nextMessages }),
      });
      const consent = prepared.consent;
      const approved = window.confirm(
        `${consent.providerName} · ${consent.model}\n${consent.purpose}\n${consent.dataCategories.join(', ')}\n${consent.destination}\n\n${consent.promptCharacters} characters will be sent to this provider. Continue?`,
      );
      if (!approved) return;
      setMessages(nextMessages);
      setDraft('');
      const response = await fetch('/api/meo/chat/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          credentialId,
          model: model.trim(),
          messages: nextMessages,
          consent,
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string' ? body.error : `Chat failed (${response.status})`,
        );
      }
      setMessages((current) => [...current, { role: 'assistant', content: '' }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
          const data = block.match(/^data:\s*(.+)$/m)?.[1];
          if (event === 'delta' && data) {
            const chunk = JSON.parse(data).text as string;
            setMessages((current) =>
              current.map((message, index) =>
                index === current.length - 1 && message.role === 'assistant'
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            );
          }
          boundary = buffer.indexOf('\n\n');
        }
        if (done) break;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chat request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 px-4 py-5 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('meo_web_title')}</h1>
          <p className="text-text-secondary text-sm">{t('meo_web_account_control')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg border px-3 py-2" type="button" onClick={startNewChat}>
            {t('meo_web_new_chat')}
          </button>
          <select
            aria-label={t('meo_web_connection')}
            className="bg-surface-primary min-w-44 rounded-lg border px-3 py-2"
            value={credentialId}
            onChange={(event) => changeConnection(event.target.value)}
            disabled={loading}
          >
            <option value="">{t('meo_web_choose_connection')}</option>
            {connections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName} · {item.provider}
              </option>
            ))}
          </select>
          {models.length > 0 && modelDiscovery === 'ready' ? (
            <select
              aria-label={t('meo_web_model')}
              className="bg-surface-primary min-w-40 rounded-lg border px-3 py-2"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={t('meo_web_model_id')}
              className="bg-surface-primary min-w-40 rounded-lg border px-3 py-2"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={t('meo_web_model_id')}
            />
          )}
        </div>
      </header>
      {modelDiscovery === 'unsupported' && (
        <p className="text-text-secondary text-sm">{t('meo_web_model_manual_fallback')}</p>
      )}
      {selected && (
        <p className="text-text-secondary text-xs">
          {t('meo_web_key_hint', { hint: selected.secretHint })}
        </p>
      )}
      {history.length > 0 && (
        <nav aria-label="Conversation history" className="flex gap-2 overflow-x-auto pb-1">
          {history.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`max-w-56 truncate rounded-full border px-3 py-1.5 text-sm ${conversation.id === activeConversationId ? 'bg-surface-secondary' : ''}`}
              onClick={() => openConversation(conversation)}
            >
              {conversation.title}
            </button>
          ))}
        </nav>
      )}
      <section
        aria-label="Conversation"
        className="bg-surface-primary min-h-0 flex-1 space-y-5 overflow-y-auto rounded-xl border p-4 md:p-6"
      >
        {loading && <p>{t('meo_web_loading')}</p>}
        {!loading && connections.length === 0 && <p>{t('meo_web_no_connections')}</p>}
        {messages.map((message, index) => (
          <article
            key={`${index}-${message.role}`}
            className={
              message.role === 'user'
                ? 'bg-surface-secondary ml-auto max-w-[85%] rounded-2xl p-4'
                : 'prose prose-sm max-w-none'
            }
          >
            {message.role === 'assistant' ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </article>
        ))}
        {error && (
          <p role="alert" className="text-status-error-strong text-sm">
            {error}
          </p>
        )}
      </section>
      <form
        onSubmit={submit}
        className="bg-surface-primary flex items-end gap-3 rounded-xl border p-3"
      >
        <textarea
          className="max-h-48 min-h-14 flex-1 resize-y bg-transparent p-2 outline-none"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('meo_web_message_placeholder')}
          aria-label={t('meo_web_message')}
          disabled={busy || !selected}
        />
        <button
          className="bg-surface-primary rounded-lg px-4 py-2 font-medium shadow"
          type="submit"
          disabled={busy || !draft.trim() || !selected || !model.trim()}
        >
          {busy ? t('meo_web_thinking') : t('meo_web_send')}
        </button>
      </form>
    </main>
  );
}
