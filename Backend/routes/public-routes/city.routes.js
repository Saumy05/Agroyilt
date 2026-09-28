const express = require('express');
const router = express.Router();

/**
 * @route   GET /api/public/cities
 * @desc    Deprecated endpoint - Geographic hierarchy migrated to State -> District -> Sub-District
 * @access  Public
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    count: 0,
    cities: [],
    message: 'Operational locations have migrated to State -> District -> Sub-District system.'
  });
});

module.exports = router;
