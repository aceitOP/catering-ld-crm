'use strict';

let initState = {
  ready: false,
  initialized_at: null,
  migration_count: 0,
  migrated_versions: [],
  seed_mode: 'empty',
  seed_applied: false,
  seed_skipped_reason: 'not_started',
  baseline_marked: false,
};

function setInitState(nextState = {}) {
  initState = {
    ...initState,
    ...nextState,
  };
}

function getInitState() {
  return { ...initState };
}

module.exports = {
  setInitState,
  getInitState,
};
