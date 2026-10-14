// Feature switches. Soil testing is switched off; set VITE_ENABLE_SOIL_TESTING=true to bring it back
// (and ENABLE_SOIL_TESTING=true on the backend).
export const SOIL_TESTING_ENABLED = import.meta.env.VITE_ENABLE_SOIL_TESTING === 'true';
