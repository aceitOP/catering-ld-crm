'use strict';

const { query } = require('./db');

async function appendAdminAudit({
  actorId = null,
  action,
  entityType,
  entityId = null,
  beforePayload = null,
  afterPayload = null,
  meta = null,
  dbQuery = query,
}) {
  if (!action || !entityType) return null;

  const { rows } = await dbQuery(
    `INSERT INTO admin_audit_log
       (actor_id, action, entity_type, entity_id, before_payload, after_payload, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      actorId,
      action,
      entityType,
      entityId,
      beforePayload ? JSON.stringify(beforePayload) : null,
      afterPayload ? JSON.stringify(afterPayload) : null,
      meta ? JSON.stringify(meta) : null,
    ]
  );

  return rows[0] || null;
}

module.exports = {
  appendAdminAudit,
};
