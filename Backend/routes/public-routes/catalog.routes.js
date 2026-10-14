const express = require('express');
const router = express.Router();
const {
  getVendorSignupCategories,
  getPublicCategories,
  getPublicBrands,
  getPublicBrandBySlug,
  getPublicServices,
  getPublicHomeContent,
  getPublicWorkers
} = require('../../controllers/publicControllers/catalogController');

// Public routes - no authentication required
router.get('/categories', getPublicCategories);
router.get('/vendor-categories', getVendorSignupCategories);
router.get('/brands', getPublicBrands); // Formerly services
router.get('/brands/slug/:slug', getPublicBrandBySlug);
router.get('/services', getPublicServices); // New services
router.get('/workers', getPublicWorkers); // Independent Workers
router.get('/home-content', getPublicHomeContent);

router.get('/inspect-all', async (req, res) => {
    try {
        const Category = require('../../models/Category');
        const cat = await Category.findOne({ title: 'Drone Spraying' });
        res.json({ catId: cat?._id });
    } catch(err) {
        res.status(500).json({error: err.message});
    }
});

module.exports = router;
