const express = require('express');
const { MeoAccountProviderClient } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
const accountUrl = process.env.MEO_ACCOUNT_URL || 'https://account.meoarch.org';
const clientId = process.env.MEO_ACCOUNT_OAUTH_CLIENT_ID || '';

router.use((_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store' });
  next();
});

function clientFor(req) {
  const sessionTokens = req.session?.openidTokens;
  const sessionUserId = sessionTokens?.appUserId;
  const requestUserId = req.user?.id || req.user?._id?.toString?.();
  const accessToken =
    sessionUserId && requestUserId && sessionUserId !== requestUserId
      ? ''
      : sessionTokens?.accessToken || '';
  return new MeoAccountProviderClient({
    accountUrl,
    clientId,
    accessToken: async () => accessToken,
  });
}

function sendError(res, error) {
  const message = error instanceof Error ? error.message : 'Meo Account request failed';
  const status = message.includes('session is unavailable') ? 401 : 400;
  const safeMessage =
    status === 401
      ? 'Meo Account session is unavailable. Sign in again.'
      : 'Meo Account request failed. Check the connection and try again.';
  return res.status(status).json({ error: safeMessage });
}

router.get('/connections', requireJwtAuth, async (req, res) => {
  try {
    return res.json({ connections: await clientFor(req).listConnections() });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/connections/:credentialId/models', requireJwtAuth, async (req, res) => {
  try {
    return res.json(await clientFor(req).listModels(req.params.credentialId));
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/chat/prepare', requireJwtAuth, async (req, res) => {
  try {
    const consent = await clientFor(req).prepareChat(req.body);
    return res.json({ consent });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/chat/invoke', requireJwtAuth, async (req, res) => {
  try {
    const result = await clientFor(req).invokeChat(req.body);
    res.set({ 'Cache-Control': 'no-store' });
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/chat/stream', requireJwtAuth, async (req, res) => {
  try {
    const result = await clientFor(req).invokeChat(req.body);
    res.status(200).set({
      'Cache-Control': 'no-store, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    for (let offset = 0; offset < result.text.length; offset += 96) {
      res.write(
        `event: delta\ndata: ${JSON.stringify({ text: result.text.slice(offset, offset + 96) })}\n\n`,
      );
      res.flush?.();
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
    res.write(`event: done\ndata: ${JSON.stringify({ model: result.model })}\n\n`);
    return res.end();
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
