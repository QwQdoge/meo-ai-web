const express = require('express');
const axios = require('axios');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const cleanBaseUrl = (value) => String(value || '').trim().replace(/\/$/, '');

router.get('/', requireJwtAuth, async (req, res) => {
  const supabaseUrl = cleanBaseUrl(process.env.MEO_SUPABASE_URL);
  const publishableKey = String(process.env.MEO_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!supabaseUrl || !publishableKey || !supabaseUrl.startsWith('https://')) {
    return res.status(503).json({
      error: 'Meo activity cloud is not configured on this deployment.',
      code: 'MEO_ACTIVITY_NOT_CONFIGURED',
    });
  }

  /*
   * OPENID_REUSE_TOKENS keeps the Meo Account token in the server-side
   * OpenID session. Never copy it into localStorage or return it to browser JS.
   * The fallback covers requests authenticated by the reusable OpenID bearer
   * strategy, which exposes the same credential only on req.user in memory.
   */
  const accessToken =
    req.session?.openidTokens?.accessToken ||
    req.user?.federatedTokens?.access_token ||
    '';
  if (!accessToken) {
    return res.status(401).json({
      error: 'Reconnect Meo Account so AI activity can be read securely.',
      code: 'MEO_ACCOUNT_TOKEN_UNAVAILABLE',
    });
  }

  const requestedDays = Number.parseInt(String(req.query.days || '365'), 10);
  const days = Number.isFinite(requestedDays) ? Math.max(7, Math.min(requestedDays, 730)) : 365;

  try {
    const response = await axios.post(
      `${supabaseUrl}/rest/v1/rpc/get_ai_usage_dashboard`,
      { p_days: days },
      {
        timeout: 15_000,
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );
    res.set('Cache-Control', 'private, no-store');
    return res.status(200).json(response.data || {});
  } catch (error) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      return res.status(401).json({
        error: 'Your Meo Account session needs to be refreshed.',
        code: 'MEO_ACCOUNT_TOKEN_EXPIRED',
      });
    }
    return res.status(502).json({
      error: 'Meo activity cloud is temporarily unavailable.',
      code: 'MEO_ACTIVITY_UPSTREAM_ERROR',
    });
  }
});

module.exports = router;
