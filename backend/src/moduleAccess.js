const { query } = require('./db');
const { MODULE_MAP, buildModuleStateFromSettings } = require('./moduleConfig');

async function getModuleState() {
  const settingKeys = Object.values(MODULE_MAP).map((module) => module.settingKey);
  const { rows } = await query(
    `SELECT klic, hodnota
     FROM nastaveni
     WHERE klic = ANY($1::text[])`,
    [settingKeys]
  );

  const settings = rows.reduce((acc, row) => {
    acc[row.klic] = row.hodnota;
    return acc;
  }, {});

  return buildModuleStateFromSettings(settings);
}

const requireAppModule = (moduleKey) => async (req, res, next) => {
  const module = MODULE_MAP[moduleKey];
  if (!module) return next();

  try {
    const modules = await getModuleState();
    if (!modules[moduleKey]) {
      return res.status(403).json({ error: `Modul "${module.label}" není v této instalaci aktivní` });
    }
    req.appModules = modules;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { getModuleState, requireAppModule };
