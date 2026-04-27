const { getBackupSettings, runManagedBackup } = require('./backupService');

let cronLib = null;
try {
  cronLib = require('node-cron');
} catch {
  cronLib = null;
}

let activeCronJob = null;
let fallbackTimer = null;

function clearSchedule() {
  if (activeCronJob) {
    activeCronJob.stop();
    activeCronJob = null;
  }
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

function getTimezone() {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Prague';
}

async function runScheduledBackup() {
  await runManagedBackup({ trigger: 'auto' });
}

function getNextRunDelay(autoTime) {
  const [hour, minute] = autoTime.split(':').map((part) => parseInt(part, 10));
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleFallback(autoTime) {
  const delay = getNextRunDelay(autoTime);
  fallbackTimer = setTimeout(async () => {
    try {
      await runScheduledBackup();
    } catch (err) {
      console.error('Autobackup selhal:', err.message);
    } finally {
      scheduleFallback(autoTime);
    }
  }, delay);
}

async function refreshBackupScheduler() {
  clearSchedule();
  const settings = await getBackupSettings();
  if (!settings.autoEnabled) return;

  if (cronLib?.schedule) {
    const [hour, minute] = settings.autoTime.split(':');
    activeCronJob = cronLib.schedule(`${minute} ${hour} * * *`, async () => {
      try {
        await runScheduledBackup();
      } catch (err) {
        console.error('Autobackup selhal:', err.message);
      }
    }, {
      scheduled: true,
      timezone: getTimezone(),
    });
    return;
  }

  scheduleFallback(settings.autoTime);
}

async function startBackupScheduler() {
  try {
    await refreshBackupScheduler();
  } catch (err) {
    console.error('Nepodařilo se spustit plánovač záloh:', err.message);
  }
}

module.exports = {
  refreshBackupScheduler,
  startBackupScheduler,
};
