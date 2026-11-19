const Language = require('../models/Language');

/**
 * Built-in default Indian languages for AgroYilt
 * English is default; Hindi is enabled out of the box.
 */
const DEFAULT_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isActive: true, isDefault: true, sortOrder: 1, isSystem: true },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', isActive: true, isDefault: false, sortOrder: 2, isSystem: true },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳', isActive: false, isDefault: false, sortOrder: 3 },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳', isActive: false, isDefault: false, sortOrder: 4 },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳', isActive: false, isDefault: false, sortOrder: 5 },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳', isActive: false, isDefault: false, sortOrder: 6 },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳', isActive: false, isDefault: false, sortOrder: 7 },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳', isActive: false, isDefault: false, sortOrder: 8 },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳', isActive: false, isDefault: false, sortOrder: 9 },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳', isActive: false, isDefault: false, sortOrder: 10 }
];

/**
 * Ensure default languages exist in database
 */
const ensureDefaultLanguages = async () => {
  try {
    const count = await Language.countDocuments();
    if (count === 0) {
      await Language.insertMany(DEFAULT_LANGUAGES);
      console.log('✅ Initialized default languages (English, Hindi, etc.)');
      return;
    }

    // Ensure English and Hindi exist
    for (const def of DEFAULT_LANGUAGES.slice(0, 2)) {
      const exists = await Language.findOne({ code: def.code });
      if (!exists) {
        await Language.create(def);
      }
    }
  } catch (error) {
    console.error('Error ensuring default languages:', error);
  }
};

/**
 * Get active languages for Worker and User apps
 */
const getActiveLanguages = async () => {
  await ensureDefaultLanguages();
  let active = await Language.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 });
  if (!active || active.length === 0) {
    active = DEFAULT_LANGUAGES.filter(l => l.isActive);
  }
  return active;
};

/**
 * Get all languages for Admin management
 */
const getAllLanguages = async () => {
  await ensureDefaultLanguages();
  return Language.find().sort({ sortOrder: 1, createdAt: 1 });
};

/**
 * Toggle active status of a language
 */
const toggleLanguage = async (id, isActive) => {
  const lang = await Language.findById(id);
  if (!lang) {
    throw new Error('Language not found');
  }

  // Cannot disable default language
  if (lang.isDefault && !isActive) {
    throw new Error('Cannot disable the default language. Change default language first.');
  }

  lang.isActive = Boolean(isActive);
  await lang.save();
  return lang;
};

/**
 * Set default language
 */
const setDefaultLanguage = async (id, { syncToUsers = true } = {}) => {
  const target = await Language.findById(id);
  if (!target) {
    throw new Error('Language not found');
  }

  // Find the previous default language
  const prevDefault = await Language.findOne({ isDefault: true });
  const prevCode = prevDefault?.code || 'en';

  // Remove default from all other languages
  await Language.updateMany({ _id: { $ne: target._id } }, { $set: { isDefault: false } });

  // Set target as default and ensure it is active
  target.isDefault = true;
  target.isActive = true;
  await target.save();

  // Sync to all users/workers/vendors who were on the previous default or had no preference set
  if (syncToUsers) {
    try {
      const User = require('../models/User');
      const Worker = require('../models/Worker');
      const Vendor = require('../models/Vendor');

      const filter = {
        $or: [
          { 'settings.language': { $exists: false } },
          { 'settings.language': null },
          { 'settings.language': prevCode }
        ]
      };

      await Promise.all([
        User.updateMany(filter, { $set: { 'settings.language': target.code } }),
        Worker.updateMany(filter, { $set: { 'settings.language': target.code } }),
        Vendor.updateMany(filter, { $set: { 'settings.language': target.code } })
      ]);
    } catch (syncErr) {
      console.error('Error syncing default language to users:', syncErr);
    }
  }

  return target;
};

/**
 * Get the current system default language
 */
const getDefaultLanguage = async () => {
  await ensureDefaultLanguages();
  const defaultLang = await Language.findOne({ isDefault: true });
  if (defaultLang) return defaultLang;
  return Language.findOne({ code: 'en' }) || DEFAULT_LANGUAGES[0];
};

/**
 * Add a new custom language
 */
const addLanguage = async ({ code, name, nativeName, flag, isRTL, isActive = true }) => {
  const cleanCode = code.trim().toLowerCase();
  const existing = await Language.findOne({ code: cleanCode });
  if (existing) {
    throw new Error(`Language with code "${cleanCode}" already exists`);
  }

  const highestSort = await Language.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  const nextOrder = (highestSort?.sortOrder || 0) + 1;

  const newLang = await Language.create({
    code: cleanCode,
    name: name.trim(),
    nativeName: nativeName.trim(),
    flag: flag?.trim() || '🌐',
    isRTL: Boolean(isRTL),
    isActive: Boolean(isActive),
    isDefault: false,
    sortOrder: nextOrder,
    isSystem: false
  });

  return newLang;
};

/**
 * Delete a custom language
 */
const deleteLanguage = async (id) => {
  const lang = await Language.findById(id);
  if (!lang) {
    throw new Error('Language not found');
  }

  if (lang.isSystem) {
    throw new Error('System default languages cannot be deleted');
  }

  if (lang.isDefault) {
    throw new Error('Default language cannot be deleted');
  }

  await Language.findByIdAndDelete(id);
  return { success: true, message: `Language ${lang.name} deleted` };
};

module.exports = {
  DEFAULT_LANGUAGES,
  ensureDefaultLanguages,
  getActiveLanguages,
  getAllLanguages,
  getDefaultLanguage,
  toggleLanguage,
  setDefaultLanguage,
  addLanguage,
  deleteLanguage
};
