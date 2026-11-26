const languageService = require('../../services/languageService');
const { isLanguageSupported } = require('../../services/translationService');

/**
 * Public: Get active languages
 * GET /api/public/languages
 */
exports.getActiveLanguages = async (req, res) => {
  try {
    const active = await languageService.getActiveLanguages();
    // Offer only languages the app can actually be translated into
    const supported = await Promise.all(active.map(l => isLanguageSupported(l.code)));
    const languages = active.filter((_, i) => supported[i]);
    const defaultLanguage = languages.find(l => l.isDefault) || languages[0] || null;
    return res.status(200).json({
      success: true,
      languages,
      defaultLanguage
    });
  } catch (error) {
    console.error('Error fetching active languages:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch active languages',
      error: error.message
    });
  }
};

/**
 * Admin: Get all languages (active and inactive)
 * GET /api/admin/languages
 */
exports.getAllLanguages = async (req, res) => {
  try {
    const languages = await languageService.getAllLanguages();
    return res.status(200).json({
      success: true,
      languages
    });
  } catch (error) {
    console.error('Error fetching all languages for admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch languages',
      error: error.message
    });
  }
};

/**
 * Admin: Toggle language active status
 * PATCH /api/admin/languages/:id/toggle
 */
exports.toggleLanguage = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const language = await languageService.toggleLanguage(id, isActive);
    return res.status(200).json({
      success: true,
      message: `Language ${language.name} is now ${language.isActive ? 'active' : 'inactive'}`,
      language
    });
  } catch (error) {
    console.error('Error toggling language:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to toggle language status'
    });
  }
};

/**
 * Admin: Set default language
 * PATCH /api/admin/languages/:id/default
 */
exports.setDefaultLanguage = async (req, res) => {
  try {
    const { id } = req.params;
    const language = await languageService.setDefaultLanguage(id);
    return res.status(200).json({
      success: true,
      message: `${language.name} is now the default language`,
      language
    });
  } catch (error) {
    console.error('Error setting default language:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to set default language'
    });
  }
};

/**
 * Admin: Add new language
 * POST /api/admin/languages
 */
exports.addLanguage = async (req, res) => {
  try {
    const { code, name, nativeName, flag, isRTL, isActive } = req.body;
    if (!code || !name || !nativeName) {
      return res.status(400).json({
        success: false,
        message: 'code, name, and nativeName are required'
      });
    }

    const language = await languageService.addLanguage({
      code,
      name,
      nativeName,
      flag,
      isRTL,
      isActive
    });

    return res.status(201).json({
      success: true,
      message: `Language ${language.name} added successfully`,
      language
    });
  } catch (error) {
    console.error('Error adding language:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to add language'
    });
  }
};

/**
 * Admin: Delete custom language
 * DELETE /api/admin/languages/:id
 */
exports.deleteLanguage = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await languageService.deleteLanguage(id);
    return res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error deleting language:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to delete language'
    });
  }
};
