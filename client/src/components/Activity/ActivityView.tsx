import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Cloud, Download, Folder, RefreshCw, Sparkles } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { cn } from '~/utils';

type Summary = {
  lifetime_tokens?: number;
  peak_day_tokens?: number;
  active_days?: number;
  longest_streak?: number;
  current_streak?: number;
  longest_session_ms?: number;
  estimated_cost_microusd?: number;
};
type Daily = { date: string; tokens: number };
type ModelUsage = { name: string; provider: string; tokens: number; events: number };
type ProjectUsage = {
  name: string;
  project_key: string;
  tokens: number;
  sessions: number;
  last_used_at?: string;
};
type SourceUsage = { source: string; tokens: number; events: number; last_used_at?: string };
type Dashboard = {
  summary?: Summary;
  token_breakdown?: Record<string, number>;
  daily?: Daily[];
  models?: ModelUsage[];
  projects?: ProjectUsage[];
  sources?: SourceUsage[];
};

const SUPABASE_URL = (import.meta.env.VITE_MEO_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.VITE_MEO_SUPABASE_PUBLISHABLE_KEY as string | undefined;

function getMeoToken() {
  return (
    sessionStorage.getItem('meo.account.access_token') ||
    localStorage.getItem('meo.account.access_token') ||
    sessionStorage.getItem('meo_account_access_token') ||
    localStorage.getItem('meo_account_access_token') ||
    ''
  );
}

function compact(value = 0) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function duration(ms = 0) {
  if (!ms) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function sourceLabel(value: string) {
  if (value === 'claude_code') return 'Claude Code';
  if (value === 'codex') return 'Codex';
  if (value === 'meo') return 'Meo AI';
  if (value === 'opencode') return 'OpenCode';
  return value || 'Other';
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'border-border-light bg-surface-primary rounded-2xl border shadow-sm',
        className,
      )}
    >
      {children}
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <Card className="min-w-0 p-4">
      <div className="text-text-primary text-xl font-semibold tracking-tight">{value}</div>
      <div className="text-text-secondary mt-1 truncate text-xs">{label}</div>
    </Card>
  );
}

function ActivityHeatmap({ daily }: { daily: Daily[] }) {
  const recent = daily.slice(-154);
  const max = Math.max(1, ...recent.map((item) => item.tokens));
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1" aria-label="Token activity">
      {recent.map((item) => {
        const ratio = item.tokens / max;
        const opacity = item.tokens === 0 ? 0.16 : ratio < 0.08 ? 0.3 : ratio < 0.24 ? 0.5 : ratio < 0.5 ? 0.72 : 1;
        return (
          <div
            key={item.date}
            title={`${item.date} · ${compact(item.tokens)} tokens`}
            className="bg-text-primary size-3 rounded-[4px]"
            style={{ opacity }}
          />
        );
      })}
    </div>
  );
}

function UsageBars({ items }: { items: ModelUsage[] }) {
  const max = Math.max(1, ...items.map((item) => item.tokens));
  return (
    <div className="space-y-4">
      {items.slice(0, 7).map((item) => (
        <div key={`${item.provider}:${item.name}`}>
          <div className="mb-1.5 flex items-center gap-3 text-sm">
            <span className="text-text-primary min-w-0 flex-1 truncate">{item.name}</span>
            <span className="text-text-secondary shrink-0 tabular-nums">{compact(item.tokens)}</span>
          </div>
          <div className="bg-surface-tertiary h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-text-primary h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.max(2, (item.tokens / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ActivityView() {
  const [data, setData] = useState<Dashboard>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    const token = getMeoToken();
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setError('Meo cloud is not configured for this web build.');
      setLoading(false);
      return;
    }
    if (!token) {
      setError('Sign in with Meo Account to see activity synced from your devices.');
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_ai_usage_dashboard`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_days: 365 }),
      });
      if (!response.ok) throw new Error(`Meo cloud returned ${response.status}`);
      setData((await response.json()) as Dashboard);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load AI activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = data?.summary ?? {};
  const models = data?.models ?? [];
  const projects = data?.projects ?? [];
  const sources = data?.sources ?? [];
  const daily = data?.daily ?? [];
  const sourceTokens = useMemo(
    () => sources.reduce((total, source) => total + Number(source.tokens || 0), 0),
    [sources],
  );

  return (
    <main className="bg-surface-primary h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
        <header className="mb-7 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-text-secondary mb-2 flex items-center gap-2 text-sm">
              <Sparkles className="size-4" aria-hidden="true" />
              Meo AI
            </div>
            <h1 className="text-text-primary text-3xl font-semibold tracking-tight">AI activity</h1>
            <p className="text-text-secondary mt-2 max-w-2xl text-sm leading-6">
              One timeline for Meo AI, Codex and Claude Code. Desktop imports stay synced through your Meo Account.
            </p>
          </div>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn('mr-2 size-4', loading && 'animate-spin motion-reduce:animate-none')} />
            Refresh
          </Button>
        </header>

        {loading && !data ? (
          <div className="flex min-h-80 items-center justify-center"><Spinner className="size-7" /></div>
        ) : error && !data ? (
          <Card className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <Cloud className="text-text-secondary mb-4 size-8" aria-hidden="true" />
            <h2 className="text-text-primary font-medium">Activity is ready when your account is</h2>
            <p className="text-text-secondary mt-2 max-w-md text-sm leading-6">{error}</p>
          </Card>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric value={compact(summary.lifetime_tokens)} label="Lifetime tokens" />
              <Metric value={compact(summary.peak_day_tokens)} label="Peak day" />
              <Metric value={duration(summary.longest_session_ms)} label="Longest session" />
              <Metric value={String(summary.longest_streak ?? 0)} label="Best streak" />
              <Metric value={String(summary.current_streak ?? 0)} label="Current streak" />
            </div>

            <Card className="p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <Activity className="text-text-secondary size-4" aria-hidden="true" />
                <h2 className="text-text-primary flex-1 font-medium">Token activity</h2>
                <span className="text-text-secondary text-xs">{summary.active_days ?? 0} active days</span>
              </div>
              {daily.length ? <ActivityHeatmap daily={daily} /> : <p className="text-text-secondary text-sm">Import activity on your Meo desktop to begin.</p>}
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5 sm:p-6">
                <h2 className="text-text-primary mb-5 font-medium">Models</h2>
                {models.length ? <UsageBars items={models} /> : <p className="text-text-secondary text-sm">No model usage yet.</p>}
              </Card>
              <Card className="p-5 sm:p-6">
                <h2 className="text-text-primary mb-4 font-medium">Projects</h2>
                <div className="divide-border-light divide-y">
                  {projects.slice(0, 7).map((project) => (
                    <div key={project.project_key || project.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="bg-surface-secondary flex size-9 shrink-0 items-center justify-center rounded-xl"><Folder className="text-text-secondary size-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-text-primary truncate text-sm">{project.name}</div>
                        <div className="text-text-secondary text-xs">{project.sessions ?? 0} sessions</div>
                      </div>
                      <div className="text-text-secondary text-sm tabular-nums">{compact(project.tokens)}</div>
                    </div>
                  ))}
                  {!projects.length && <p className="text-text-secondary text-sm">No projects yet.</p>}
                </div>
              </Card>
            </div>

            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-text-primary flex-1 font-medium">Connected sources</h2>
                <span className="text-text-secondary text-xs">{compact(sourceTokens)} tokens</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sources.map((source) => (
                  <div key={source.source} className="border-border-light bg-surface-secondary text-text-primary inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs">
                    <span className="bg-text-primary size-1.5 rounded-full" />
                    {sourceLabel(source.source)}
                    <span className="text-text-secondary">{compact(source.tokens)}</span>
                  </div>
                ))}
                {!sources.length && <span className="text-text-secondary text-sm">Meo desktop can import Codex and Claude Code history.</span>}
              </div>
              <div className="border-border-light text-text-secondary mt-5 flex items-start gap-2 border-t pt-4 text-xs leading-5">
                <Download className="mt-0.5 size-3.5 shrink-0" />
                Import happens on your computer; raw local paths are not uploaded. Only normalized usage, project labels and model statistics sync to Supabase.
              </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
