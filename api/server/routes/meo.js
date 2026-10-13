const express = require('express');
const axios = require('axios');
const middleware = require('~/server/middleware');

const router = express.Router();
const MAX_SETTINGS_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

const trimTrailingSlash = (value = '') => value.trim().replace(/\/+$/, '');
const accountBase = () => trimTrailingSlash(process.env.MEO_ACCOUNT_SUPABASE_URL);
const cloudBase = () => trimTrailingSlash(process.env.MEO_CLOUD_URL);
const publishableKey = () =>
  (process.env.MEO_ACCOUNT_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const getAccountToken = (req) => {
  // OPENID_REUSE_TOKENS keeps these values in the server-side express-session
  // store. Never return this token from a Meo route and never put it in JSON.
  const sessionToken = req.session?.openidTokens?.accessToken;
  if (typeof sessionToken === 'string' && sessionToken.length > 20) {
    return sessionToken;
  }

  // Some authenticated OpenID requests carry the same token on the transient
  // request user. This fallback stays server-side and is intentionally narrow.
  const federated = req.user?.federatedTokens?.access_token;
  return typeof federated === 'string' && federated.length > 20 ? federated : null;
};

const requireMeoAccount = (req, res, next) => {
  const token = getAccountToken(req);
  if (!token) {
    return res.status(401).json({
      code: 'MEO_ACCOUNT_REQUIRED',
      error: 'Sign in with Meo Account to use synced Meo AI features.',
    });
  }
  req.meoAccountToken = token;
  next();
};

const accountHeaders = (token) => {
  const apikey = publishableKey();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (apikey) {
    headers.apikey = apikey;
  }
  return headers;
};

const configured = (res, value, variable) => {
  if (value) {
    return true;
  }
  res.status(503).json({
    code: 'MEO_BACKEND_NOT_CONFIGURED',
    error: `${variable} is not configured on this Meo AI server.`,
  });
  return false;
};

const safeAxiosError = (error, fallback = 'Meo backend request failed.') => {
  const status = Number(error?.response?.status) || 502;
  const upstream = error?.response?.data;
  const message =
    upstream && typeof upstream === 'object' && typeof upstream.error === 'string'
      ? upstream.error
      : fallback;
  return { status: status >= 400 && status <= 599 ? status : 502, message };
};

const getAccountUser = async (token) => {
  const base = accountBase();
  if (!base) {
    throw Object.assign(new Error('MEO_ACCOUNT_SUPABASE_URL is not configured'), {
      statusCode: 503,
    });
  }
  const response = await axios.get(`${base}/auth/v1/user`, {
    headers: accountHeaders(token),
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: 256 * 1024,
  });
  return response.data;
};

const callProviderBroker = async (token, body) => {
  const base = accountBase();
  if (!base) {
    throw Object.assign(new Error('MEO_ACCOUNT_SUPABASE_URL is not configured'), {
      statusCode: 503,
    });
  }
  const response = await axios.post(`${base}/functions/v1/ai-provider-broker`, body, {
    headers: accountHeaders(token),
    timeout: 125_000,
    maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: 512 * 1024,
  });
  return response.data;
};

router.use(middleware.requireJwtAuth, noStore, requireMeoAccount);

router.get('/account', async (req, res) => {
  try {
    const user = await getAccountUser(req.meoAccountToken);
    const metadata = user?.user_metadata && typeof user.user_metadata === 'object'
      ? user.user_metadata
      : {};
    return res.json({
      id: user?.id ?? null,
      email: user?.email ?? null,
      displayName:
        metadata.display_name || metadata.full_name || metadata.name || user?.email || 'Meo user',
      avatarUrl: metadata.avatar_url || metadata.picture || null,
      profileUrl: 'https://account.meoarch.org/settings/profile',
      securityUrl: 'https://account.meoarch.org/settings/security',
    });
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to load Meo Account.');
    return res.status(error?.statusCode || details.status).json({ error: details.message });
  }
});

router.get('/settings', async (req, res) => {
  const base = accountBase();
  if (!configured(res, base, 'MEO_ACCOUNT_SUPABASE_URL')) {
    return;
  }
  try {
    const response = await axios.get(
      `${base}/rest/v1/ai_user_settings?select=schema_version,settings,updated_at&limit=1`,
      {
        headers: accountHeaders(req.meoAccountToken),
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: 256 * 1024,
      },
    );
    const row = Array.isArray(response.data) ? response.data[0] : null;
    return res.json(
      row || {
        schema_version: 1,
        settings: {
          model_roles: {},
          agent: { coordinator: true, judge: true },
          memory: { enabled: true },
          sync: { history: true, settings: true, memory: true },
        },
        updated_at: null,
      },
    );
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to load synced AI settings.');
    return res.status(details.status).json({ error: details.message });
  }
});

router.put('/settings', middleware.requireSameOrigin, async (req, res) => {
  const base = accountBase();
  if (!configured(res, base, 'MEO_ACCOUNT_SUPABASE_URL')) {
    return;
  }

  const settings = req.body?.settings;
  const schemaVersion = Number(req.body?.schema_version ?? 1);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return res.status(400).json({ error: 'settings must be a JSON object.' });
  }
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > 1000) {
    return res.status(400).json({ error: 'schema_version is invalid.' });
  }
  if (Buffer.byteLength(JSON.stringify(settings), 'utf8') > MAX_SETTINGS_BYTES) {
    return res.status(413).json({ error: 'AI settings are too large.' });
  }

  try {
    const user = await getAccountUser(req.meoAccountToken);
    const response = await axios.post(
      `${base}/rest/v1/ai_user_settings?on_conflict=user_id`,
      {
        user_id: user.id,
        schema_version: schemaVersion,
        settings,
        updated_at: new Date().toISOString(),
      },
      {
        headers: {
          ...accountHeaders(req.meoAccountToken),
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: 256 * 1024,
        maxBodyLength: MAX_SETTINGS_BYTES + 16 * 1024,
      },
    );
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    return res.json(row);
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to save synced AI settings.');
    return res.status(details.status).json({ error: details.message });
  }
});

router.get('/providers', async (req, res) => {
  try {
    const result = await callProviderBroker(req.meoAccountToken, {
      action: 'list_credentials',
    });
    return res.json(result);
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to load AI providers.');
    return res.status(details.status).json({ error: details.message });
  }
});

router.post('/providers', middleware.requireSameOrigin, async (req, res) => {
  const provider = typeof req.body?.provider === 'string' ? req.body.provider.trim() : '';
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
  if (!provider || !displayName) {
    return res.status(400).json({ error: 'provider and displayName are required.' });
  }
  try {
    const result = await callProviderBroker(req.meoAccountToken, {
      action: 'upsert_credential',
      credentialId: req.body?.credentialId,
      provider,
      displayName,
      endpoint: req.body?.endpoint,
      defaultModel: req.body?.defaultModel,
      apiKey: req.body?.apiKey,
    });
    return res.json(result);
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to save AI provider.');
    return res.status(details.status).json({ error: details.message });
  }
});

router.delete('/providers/:credentialId', middleware.requireSameOrigin, async (req, res) => {
  try {
    const result = await callProviderBroker(req.meoAccountToken, {
      action: 'delete_credential',
      credentialId: req.params.credentialId,
    });
    return res.json(result);
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to delete AI provider.');
    return res.status(details.status).json({ error: details.message });
  }
});

router.get('/providers/:credentialId/models', async (req, res) => {
  try {
    const result = await callProviderBroker(req.meoAccountToken, {
      action: 'list_models',
      credentialId: req.params.credentialId,
    });
    return res.json(result);
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to discover provider models.');
    return res.status(details.status).json({ error: details.message });
  }
});

router.post('/providers/:credentialId/test', middleware.requireSameOrigin, async (req, res) => {
  try {
    const result = await callProviderBroker(req.meoAccountToken, {
      action: 'test_connection',
      credentialId: req.params.credentialId,
      model: req.body?.model,
      testPrompt: req.body?.testPrompt,
    });
    return res.json(result);
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to test AI provider.');
    return res.status(details.status).json({ error: details.message });
  }
});

router.get('/history', async (req, res) => {
  const base = cloudBase();
  if (!configured(res, base, 'MEO_CLOUD_URL')) {
    return;
  }
  try {
    const params = {};
    if (req.query.limit) params.limit = req.query.limit;
    if (req.query.cursor) params.cursor = req.query.cursor;
    if (req.query.updated_after) params.updated_after = req.query.updated_after;
    const response = await axios.get(`${base}/v1/conversations`, {
      params,
      headers: { Authorization: `Bearer ${req.meoAccountToken}` },
      timeout: REQUEST_TIMEOUT_MS,
      maxContentLength: 2 * 1024 * 1024,
    });
    return res.json(response.data);
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to sync Meo AI history.');
    return res.status(details.status).json({ error: details.message });
  }
});

router.get('/history/:conversationId', async (req, res) => {
  const base = cloudBase();
  if (!configured(res, base, 'MEO_CLOUD_URL')) {
    return;
  }
  try {
    const response = await axios.get(
      `${base}/v1/conversations/${encodeURIComponent(req.params.conversationId)}`,
      {
        headers: { Authorization: `Bearer ${req.meoAccountToken}` },
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: 4 * 1024 * 1024,
      },
    );
    return res.json(response.data);
  } catch (error) {
    const details = safeAxiosError(error, 'Unable to load this synced conversation.');
    return res.status(details.status).json({ error: details.message });
  }
});

module.exports = router;
