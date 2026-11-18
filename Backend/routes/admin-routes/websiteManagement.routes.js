const express = require('express');
const router = express.Router();
const websiteController = require('../../controllers/adminControllers/websiteManagementController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

// Landing Page Content
router.route('/landing-content')
  .get(websiteController.getLandingContent)
  .put(authenticate, isAdmin, websiteController.updateLandingContent);

// Blog CRUD
router.route('/blog')
  .get(websiteController.getBlogs)
  .post(websiteController.createBlog);

router.route('/blog/:id')
  .put(websiteController.updateBlog)
  .delete(websiteController.deleteBlog);

// Article CRUD
router.route('/article')
  .get(websiteController.getArticles)
  .post(websiteController.createArticle);

router.route('/article/:id')
  .put(websiteController.updateArticle)
  .delete(websiteController.deleteArticle);

// WebsiteReview CRUD
router.route('/review')
  .get(websiteController.getReviews)
  .post(websiteController.createReview);

router.route('/review/:id')
  .put(websiteController.updateReview)
  .delete(websiteController.deleteReview);

module.exports = router;
