'use strict';

const cron = require('node-cron');
const { query, withTransaction } = require('./db');
const { runScheduledVoucherOrderSendSweep } = require('./voucherShop');

let scheduled = false;

async function runVoucherExpirationSweep() {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `WITH due AS (
         SELECT id, status AS previous_status
         FROM vouchers
         WHERE status IN ('draft', 'active')
           AND expires_at IS NOT NULL
           AND expires_at < NOW()
       )
       UPDATE vouchers v
       SET status = 'expired',
           updated_at = NOW()
       FROM due
       WHERE v.id = due.id
       RETURNING v.id, due.previous_status`
    );

    for (const row of rows) {
      await client.query(
        `INSERT INTO voucher_events (voucher_id, event_type, previous_status, next_status, payload, actor_label)
         VALUES ($1, 'auto_expired', $2, 'expired', $3, 'system')`,
        [row.id, row.previous_status, JSON.stringify({ reason: 'expires_at elapsed' })]
      );
    }

    return { expiredCount: rows.length };
  });
}

function startVoucherExpirationScheduler() {
  if (scheduled) return;
  scheduled = true;

  cron.schedule('5 * * * *', async () => {
    try {
      const result = await runVoucherExpirationSweep();
      if (result.expiredCount > 0) {
        console.log(`✅  Automaticky expirováno poukazů: ${result.expiredCount}`);
      }
    } catch (err) {
      console.error('❌  Chyba automatické expirace poukazů:', err.message);
    }
  });

  cron.schedule('*/10 * * * *', async () => {
    try {
      const result = await runScheduledVoucherOrderSendSweep();
      if (result.sentCount > 0) {
        console.log(`✅  Naplánovaně odesláno poukazů: ${result.sentCount}`);
      }
    } catch (err) {
      console.error('❌  Chyba plánovaného odesílání poukazů:', err.message);
    }
  });
}

module.exports = {
  runVoucherExpirationSweep,
  startVoucherExpirationScheduler,
};
