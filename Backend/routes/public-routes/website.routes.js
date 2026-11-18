const express = require('express');
const router = express.Router();
const websiteController = require('../../controllers/adminControllers/websiteManagementController');

// Public endpoints to fetch content
router.get('/blogs', websiteController.getBlogs);
router.get('/articles', websiteController.getArticles);
router.get('/reviews', websiteController.getReviews);
router.get('/landing-content', websiteController.getLandingContent);

module.exports = router;
