// Feature switches. Soil testing is switched off; set ENABLE_SOIL_TESTING=true in .env to bring it back.
const SOIL_TESTING_ENABLED = process.env.ENABLE_SOIL_TESTING === 'true';

const soilTestingGate = (req, res, next) => {
  if (SOIL_TESTING_ENABLED) return next();
  return res.status(410).json({ success: false, message: 'Soil testing is currently unavailable.' });
};

module.exports = { SOIL_TESTING_ENABLED, soilTestingGate };
