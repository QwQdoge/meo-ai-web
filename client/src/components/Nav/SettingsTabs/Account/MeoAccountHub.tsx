import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Cloud, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';

type MeoAccount = {
  id: string | null;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  securityUrl: string;
};

type ProviderConnection = {
  id: string;
  provider: string;
  displayName: string;
  endpoint: string;
  defaultModel: string;
  secretHint: string;
  enabled: boolean;
  updatedAt?: string;
};

type ModelRole = { connection_id?: string; model?: string };
type AiSettings = {
  model_roles?: Record<string, ModelRole>;
  agent?: Record<string, unknown>;
  memory?: { enabled?: boolean };
  sync?: { history?: boolean; settings?: boolean; memory?: boolean };
  [key: string]: unknown;
};

type SettingsEnvelope = {
  schema_version?: number;
  settings?: AiSettings;
  updated_at?: string | null;
};

type ProviderDraft = {
  provider: string;
  displayName: string;
  endpoint: string;
  defaultModel: string;
  apiKey: string;
};

const roles = [
  ['chat', 'Chat'],
  ['reasoning', 'Reasoning'],
  ['execution', 'Execution'],
  ['vision', 'Vision'],
  ['judge', 'Judge'],
  ['title', 'Title'],
] as const;

const providerPresets: Record<string, { label: string; endpoint: string }> = {
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1' },
  deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com' },
  gemini: { label: 'Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta' },
  openai_compatible: { label: 'Custom · OpenAI-compatible', endpoint: '' },
};

const emptyDraft = (): ProviderDraft => ({
  provider: 'openrouter',
  displayName: 'OpenRouter',
  endpoint: providerPresets.openrouter.endpoint,
  defaultModel: '',
  apiKey: '',
});

const defaultSettings = (): AiSettings => ({
  model_roles: {},
  agent: { coordinator: true, judge: true },
  memory: { enabled: true },
  sync: { history: true, settings: true, memory: true },
});

export default function MeoAccountHub() {
  const { token } = useAuthContext();
  const [account, setAccount] = useState<MeoAccount | null>(null);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [settings, setSettings] = useState<AiSettings>(defaultSettings);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [modelsByConnection, setModelsByConnection] = useState<Record<string, string[]>>({});
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!token) {
        throw new Error('Meo AI session is not ready.');
      }
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const response = await fetch(`/api/user/meo${path}`, {
        ...init,
        headers,
        credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          payload && typeof payload.error === 'string'
            ? payload.error
            : 'Meo Account request failed.';
        throw new Error(message);
      }
      return payload as T;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [accountData, providerData, settingsData] = await Promise.all([
        request<MeoAccount>('/account'),
        request<{ credentials?: ProviderConnection[] }>('/providers'),
        request<SettingsEnvelope>('/settings'),
      ]);
      setAccount(accountData);
      setConnections(providerData.credentials ?? []);
      setSettings(settingsData.settings ?? defaultSettings());
      setUpdatedAt(settingsData.updated_at ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Meo Account.');
    } finally {
      setLoading(false);
    }
  }, [request, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const roleSettings = useMemo(
    () => (settings.model_roles && typeof settings.model_roles === 'object' ? settings.model_roles : {}),
    [settings.model_roles],
  );

  const updateRole = (role: string, patch: Partial<ModelRole>) => {
    setSettings((current) => ({
      ...current,
      model_roles: {
        ...(current.model_roles ?? {}),
        [role]: {
          ...(current.model_roles?.[role] ?? {}),
          ...patch,
        },
      },
    }));
  };

  const updateSync = (key: 'history' | 'settings' | 'memory', value: boolean) => {
    setSettings((current) => ({
      ...current,
      sync: { ...(current.sync ?? {}), [key]: value },
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await request<SettingsEnvelope>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ schema_version: 1, settings }),
      });
      setSettings(result.settings ?? settings);
      setUpdatedAt(result.updated_at ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save Meo AI settings.');
    } finally {
      setSaving(false);
    }
  };

  const addProvider = async () => {
    setSaving(true);
    setError(null);
    try {
      await request('/providers', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      setDraft(emptyDraft());
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add provider.');
    } finally {
      setSaving(false);
    }
  };

  const deleteProvider = async (connection: ProviderConnection) => {
    if (!window.confirm(`Remove ${connection.displayName}? Meo AI will forget this provider connection.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await request(`/providers/${encodeURIComponent(connection.id)}`, { method: 'DELETE' });
      setConnections((current) => current.filter((item) => item.id !== connection.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove provider.');
    } finally {
      setSaving(false);
    }
  };

  const discoverModels = async (connection: ProviderConnection) => {
    setError(null);
    try {
      const result = await request<{ supported?: boolean; models?: Array<string | { id?: string }> }>(
        `/providers/${encodeURIComponent(connection.id)}/models`,
      );
      const modelIds = (result.models ?? [])
        .map((model) => (typeof model === 'string' ? model : model.id ?? ''))
        .filter(Boolean);
      setModelsByConnection((current) => ({ ...current, [connection.id]: modelIds }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to discover models.');
    }
  };

  const choosePreset = (provider: string) => {
    const preset = providerPresets[provider];
    setDraft((current) => ({
      ...current,
      provider,
      displayName: preset?.label ?? provider,
      endpoint: preset?.endpoint ?? '',
    }));
  };

  if (loading) {
    return (
      <div className="text-text-secondary flex items-center gap-2 py-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Connecting Meo Account…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="border-border-light bg-surface-secondary text-text-primary rounded-xl border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <section className="border-border-light bg-surface-secondary rounded-2xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-text-primary text-base font-medium">
              {account?.displayName ?? 'Meo Account'}
            </div>
            <div className="text-text-secondary truncate text-sm">{account?.email ?? 'Connected'}</div>
            <div className="text-text-tertiary mt-1 flex items-center gap-1.5 text-xs">
              <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
              {updatedAt ? `Synced ${new Date(updatedAt).toLocaleString()}` : 'Meo sync ready'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="hover:bg-surface-hover text-text-secondary rounded-lg p-2"
            aria-label="Refresh Meo Account"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => account?.profileUrl && window.open(account.profileUrl, '_blank', 'noopener,noreferrer')}
            className="border-border-light hover:bg-surface-hover text-text-primary flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          >
            Manage profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => account?.securityUrl && window.open(account.securityUrl, '_blank', 'noopener,noreferrer')}
            className="border-border-light hover:bg-surface-hover text-text-primary flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          >
            Security <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-text-primary font-medium">Providers</h3>
            <p className="text-text-secondary text-xs">
              Keys are encrypted by Meo Account. Meo AI only receives masked connection metadata.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd((value) => !value)}
            className="bg-surface-tertiary hover:bg-surface-hover text-text-primary flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add
          </button>
        </div>

        <div className="space-y-2">
          {connections.map((connection) => (
            <div key={connection.id} className="border-border-light rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-text-primary flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    {connection.displayName}
                    {connection.enabled && <Check className="h-3.5 w-3.5" aria-label="Connected" />}
                  </div>
                  <div className="text-text-tertiary mt-1 truncate text-xs">
                    {connection.secretHint || 'Stored securely'}
                    {connection.defaultModel ? ` · ${connection.defaultModel}` : ''}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void discoverModels(connection)}
                    className="hover:bg-surface-hover text-text-secondary rounded-lg p-1.5 text-xs"
                  >
                    Models
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteProvider(connection)}
                    className="hover:bg-surface-hover text-text-secondary rounded-lg p-1.5"
                    aria-label={`Remove ${connection.displayName}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {(modelsByConnection[connection.id]?.length ?? 0) > 0 && (
                <div className="text-text-secondary mt-2 max-h-24 overflow-y-auto text-xs">
                  {modelsByConnection[connection.id].slice(0, 30).join(' · ')}
                </div>
              )}
            </div>
          ))}
          {connections.length === 0 && (
            <div className="text-text-secondary border-border-light rounded-xl border border-dashed p-4 text-sm">
              No cloud provider configured yet.
            </div>
          )}
        </div>

        {showAdd && (
          <div className="border-border-light bg-surface-secondary mt-3 grid gap-3 rounded-xl border p-3">
            <label className="text-text-secondary text-xs">
              Provider
              <select
                value={draft.provider}
                onChange={(event) => choosePreset(event.target.value)}
                className="border-border-light bg-surface-primary text-text-primary mt-1 w-full rounded-lg border px-2 py-2 text-sm"
              >
                {Object.entries(providerPresets).map(([value, preset]) => (
                  <option key={value} value={value}>{preset.label}</option>
                ))}
              </select>
            </label>
            <label className="text-text-secondary text-xs">
              Display name
              <input
                value={draft.displayName}
                onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                className="border-border-light bg-surface-primary text-text-primary mt-1 w-full rounded-lg border px-2 py-2 text-sm"
              />
            </label>
            {draft.provider === 'openai_compatible' && (
              <label className="text-text-secondary text-xs">
                HTTPS endpoint
                <input
                  value={draft.endpoint}
                  onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))}
                  placeholder="https://api.example.com/v1"
                  className="border-border-light bg-surface-primary text-text-primary mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                />
              </label>
            )}
            <label className="text-text-secondary text-xs">
              API key
              <input
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
                className="border-border-light bg-surface-primary text-text-primary mt-1 w-full rounded-lg border px-2 py-2 text-sm"
              />
            </label>
            <label className="text-text-secondary text-xs">
              Default model
              <input
                value={draft.defaultModel}
                onChange={(event) => setDraft((current) => ({ ...current, defaultModel: event.target.value }))}
                placeholder="Optional"
                className="border-border-light bg-surface-primary text-text-primary mt-1 w-full rounded-lg border px-2 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="hover:bg-surface-hover text-text-secondary rounded-lg px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !draft.displayName.trim() || !draft.apiKey.trim()}
                onClick={() => void addProvider()}
                className="bg-text-primary text-surface-primary disabled:opacity-50 rounded-lg px-3 py-2 text-sm font-medium"
              >
                Save provider
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-text-primary font-medium">Models & routing</h3>
        <p className="text-text-secondary mb-3 text-xs">
          These preferences sync with your Meo Account. A device can fall back locally without overwriting the preference.
        </p>
        <div className="space-y-2">
          {roles.map(([role, label]) => {
            const value = roleSettings[role] ?? {};
            return (
              <div key={role} className="grid grid-cols-[7rem_1fr] items-center gap-2 sm:grid-cols-[7rem_1fr_1fr]">
                <span className="text-text-primary text-sm">{label}</span>
                <select
                  value={value.connection_id ?? ''}
                  onChange={(event) => updateRole(role, { connection_id: event.target.value })}
                  className="border-border-light bg-surface-primary text-text-primary rounded-lg border px-2 py-1.5 text-sm"
                >
                  <option value="">Auto</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>{connection.displayName}</option>
                  ))}
                </select>
                <input
                  value={value.model ?? ''}
                  onChange={(event) => updateRole(role, { model: event.target.value })}
                  placeholder="Auto / model id"
                  className="border-border-light bg-surface-primary text-text-primary col-start-2 rounded-lg border px-2 py-1.5 text-sm sm:col-start-auto"
                />
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-text-primary font-medium">Sync & storage</h3>
        <div className="mt-2 space-y-2">
          {([
            ['history', 'Chat history'],
            ['settings', 'AI settings'],
            ['memory', 'Memory'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-text-primary flex items-center justify-between gap-4 text-sm">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={settings.sync?.[key] !== false}
                onChange={(event) => updateSync(key, event.target.checked)}
                className="h-4 w-4"
              />
            </label>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveSettings()}
          className="bg-text-primary text-surface-primary disabled:opacity-50 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save Meo AI settings
        </button>
      </div>
    </div>
  );
}
