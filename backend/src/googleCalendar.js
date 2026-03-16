'use strict';

// Stub – Google Calendar integration
// Will be fully implemented when GOOGLE_SERVICE_ACCOUNT_JSON is configured

function isConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

async function getCalendarClient() {
  return null;
}

async function upsertEvent(zakazka) {
  if (!isConfigured()) return null;
  return null;
}

async function deleteEvent(eventId) {
  if (!isConfigured()) return null;
  return null;
}

async function listEvents(od, doo) {
  if (!isConfigured()) return [];
  return [];
}

async function testConnection() {
  if (!isConfigured()) return { connected: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON not set' };
  return { connected: false, reason: 'Not yet implemented' };
}

module.exports = { isConfigured, getCalendarClient, upsertEvent, deleteEvent, listEvents, testConnection };
