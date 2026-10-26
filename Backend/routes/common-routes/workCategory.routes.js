const express = require('express');
const router = express.Router();
const { listActive } = require('../../services/workCategoryService');

// Public: the active work categories (nothing private), shown in the farmer's request forms and the workers' skill pickers
router.get('/', async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await listActive() });
  } catch (error) {
    console.error('Work categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to load the work categories' });
  }
});

module.exports = router;
