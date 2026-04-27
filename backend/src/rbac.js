'use strict';

const CAPABILITY_MAP = {
  super_admin: {
    'settings.manage': true,
    'settings.manage_sensitive': true,
    'users.manage': true,
    'users.manage_admins': true,
    'faktury.manage': true,
    'email.templates.manage': true,
    'email.smtp_test': true,
    'venues.manage': true,
    'backup.manage': true,
    'notification_rules.manage': true,
    'error_log.manage': true,
    'ingredients.manage': true,
    'recipes.manage': true,
    'recipe_costs.view': true,
    'owner_dashboard.view': true,
    'vouchers.manage': true,
  },
  admin: {
    'settings.manage': true,
    'settings.manage_sensitive': false,
    'users.manage': true,
    'users.manage_admins': false,
    'faktury.manage': true,
    'email.templates.manage': true,
    'email.smtp_test': false,
    'venues.manage': true,
    'backup.manage': false,
    'notification_rules.manage': true,
    'error_log.manage': false,
    'ingredients.manage': true,
    'recipes.manage': true,
    'recipe_costs.view': true,
    'owner_dashboard.view': true,
    'vouchers.manage': true,
  },
  uzivatel: {
    'settings.manage': false,
    'settings.manage_sensitive': false,
    'users.manage': false,
    'users.manage_admins': false,
    'faktury.manage': false,
    'email.templates.manage': false,
    'email.smtp_test': false,
    'venues.manage': false,
    'backup.manage': false,
    'notification_rules.manage': false,
    'error_log.manage': false,
    'ingredients.manage': false,
    'recipes.manage': false,
    'recipe_costs.view': false,
    'owner_dashboard.view': false,
    'vouchers.manage': false,
  },
  obchodnik: {
    'settings.manage': false,
    'settings.manage_sensitive': false,
    'users.manage': false,
    'users.manage_admins': false,
    'faktury.manage': false,
    'email.templates.manage': false,
    'email.smtp_test': false,
    'venues.manage': false,
    'backup.manage': false,
    'notification_rules.manage': false,
    'error_log.manage': false,
    'ingredients.manage': false,
    'recipes.manage': false,
    'recipe_costs.view': false,
    'owner_dashboard.view': false,
    'vouchers.manage': true,
  },
  provoz: {
    'settings.manage': false,
    'settings.manage_sensitive': false,
    'users.manage': false,
    'users.manage_admins': false,
    'faktury.manage': false,
    'email.templates.manage': false,
    'email.smtp_test': false,
    'venues.manage': false,
    'backup.manage': false,
    'notification_rules.manage': false,
    'error_log.manage': false,
    'ingredients.manage': true,
    'recipes.manage': true,
    'recipe_costs.view': true,
    'owner_dashboard.view': false,
    'vouchers.manage': false,
  },
};

function getCapabilities(role) {
  return {
    ...(CAPABILITY_MAP.uzivatel || {}),
    ...(CAPABILITY_MAP[role] || {}),
  };
}

function hasCapability(user, capability) {
  if (!user || !capability) return false;
  return Boolean(getCapabilities(user.role)[capability]);
}

module.exports = {
  getCapabilities,
  hasCapability,
};
