'use strict';

const express = require('express');
const { auth, requireCapability } = require('../middleware/auth');
const {
  getVoucherShopConfig,
  createPublicOrder,
  loadOrder,
  listOrders,
  markOrderPaid,
  cancelOrder,
  resendOrder,
  renderPaymentQrDataUrl,
} = require('../voucherShop');

const publicRouter = express.Router();
const adminRouter = express.Router();

publicRouter.get('/config', async (_req, res, next) => {
  try {
    const config = await getVoucherShopConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

publicRouter.post('/orders', async (req, res, next) => {
  try {
    const order = await createPublicOrder(req.body || {});
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/orders/:token', async (req, res, next) => {
  try {
    const order = await loadOrder(req.params.token, { byToken: true });
    if (!order) return res.status(404).json({ error: 'Objednávka nebyla nalezena.' });
    res.json({
      ...order,
      payment_qr_data_url: await renderPaymentQrDataUrl(order.payment_qr_payload),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const data = await listOrders(req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/:id', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const order = await loadOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Objednávka nebyla nalezena.' });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/:id/mark-paid', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const order = await markOrderPaid(req.params.id, req.user?.id || null);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/:id/cancel', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const order = await cancelOrder(req.params.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/:id/resend', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const order = await resendOrder(req.params.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = {
  publicRouter,
  adminRouter,
};
