'use strict';

const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { requireCapability } = require('../middleware/auth');
const {
  listNotificationRules,
  listNotificationDispatches,
  updateNotificationRule,
  runScheduledNotificationSweep,
} = require('../notificationRules');

router.use(auth, requireCapability('notification_rules.manage'));

router.get('/', async (_req, res, next) => {
  try {
    const rules = await listNotificationRules();
    res.json({ data: rules });
  } catch (err) { next(err); }
});

router.get('/dispatch-log', async (req, res, next) => {
  try {
    const rows = await listNotificationDispatches(req.query.limit || 100);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const rule = await updateNotificationRule(req.params.id, req.body || {}, req.user.id);
    if (!rule) return res.status(404).json({ error: 'Notification rule nenalezeno' });
    res.json(rule);
  } catch (err) { next(err); }
});

router.post('/run-sweep', async (req, res, next) => {
  try {
    await runScheduledNotificationSweep();
    res.status(202).json({ message: 'Sweep byl spusten' });
  } catch (err) { next(err); }
});

module.exports = router;
