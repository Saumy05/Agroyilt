const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAllLanguages,
  toggleLanguage,
  setDefaultLanguage,
  addLanguage,
  deleteLanguage
} = require('../../controllers/commonControllers/languageController');

// All routes require authenticated Admin
router.use(authenticate, isAdmin);

// GET /api/admin/languages - Get all languages (active and inactive)
router.get('/languages', getAllLanguages);

// POST /api/admin/languages - Add a new custom language
router.post('/languages', addLanguage);

// PATCH /api/admin/languages/:id/toggle - Toggle active status
router.patch('/languages/:id/toggle', toggleLanguage);

// PATCH /api/admin/languages/:id/default - Set as default language
router.patch('/languages/:id/default', setDefaultLanguage);

// DELETE /api/admin/languages/:id - Delete a custom language
router.delete('/languages/:id', deleteLanguage);

module.exports = router;
