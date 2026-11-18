const Blog = require('../../models/Blog');
const Article = require('../../models/Article');
const WebsiteReview = require('../../models/WebsiteReview');
const LandingContent = require('../../models/LandingContent');

// Blog Controllers
exports.getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: blogs.length, data: blogs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createBlog = async (req, res) => {
  try {
    if (!req.body.slug && req.body.title) {
        req.body.slug = req.body.title.toLowerCase().split(' ').join('-') + '-' + Date.now();
    }
    const blog = await Blog.create(req.body);
    res.status(201).json({ success: true, data: blog });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateBlog = async (req, res) => {
  try {
    const blog = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found" });
    res.status(200).json({ success: true, data: blog });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found" });
    res.status(200).json({ success: true, message: "Blog deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Article Controllers
exports.getArticles = async (req, res) => {
  try {
    const articles = await Article.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: articles.length, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createArticle = async (req, res) => {
  try {
    if (!req.body.slug && req.body.title) {
        req.body.slug = req.body.title.toLowerCase().split(' ').join('-') + '-' + Date.now();
    }
    const article = await Article.create(req.body);
    res.status(201).json({ success: true, data: article });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateArticle = async (req, res) => {
  try {
    const article = await Article.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });
    res.status(200).json({ success: true, data: article });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteArticle = async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });
    res.status(200).json({ success: true, message: "Article deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// WebsiteReview Controllers
exports.getReviews = async (req, res) => {
  try {
    const reviews = await WebsiteReview.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: reviews.length, data: reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createReview = async (req, res) => {
  try {
    const review = await WebsiteReview.create(req.body);
    res.status(201).json({ success: true, data: review });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const review = await WebsiteReview.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    res.status(200).json({ success: true, data: review });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const review = await WebsiteReview.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    res.status(200).json({ success: true, message: "Review deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Landing Page Content Controllers ──────────────────────────────────────────

// @desc    Get Landing Page Content (Public & Admin)
// @route   GET /api/public/website/landing-content
// @route   GET /api/admin/website/landing-content
exports.getLandingContent = async (req, res) => {
  try {
    let content = await LandingContent.findOne().lean();
    if (!content) {
      content = {
        hero: {},
        about: {},
        problemSolution: {},
        services: {},
        workflow: {},
        videoTutorials: {},
        ecosystem: {},
        features: {},
        testimonials: {},
        companyDeepDive: {},
        faq: {},
        cta: {},
        footer: {},
        navbar: {}
      };
    }
    res.status(200).json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update Landing Page Content (Admin)
// @route   PUT /api/admin/website/landing-content
exports.updateLandingContent = async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (req.user && req.user._id) {
      updateData.lastUpdatedBy = req.user._id;
    }

    let content = await LandingContent.findOne();
    if (content) {
      const sections = [
        'hero', 'about', 'problemSolution', 'services', 'workflow',
        'videoTutorials', 'ecosystem', 'features', 'testimonials',
        'companyDeepDive', 'faq', 'cta', 'footer', 'navbar'
      ];

      sections.forEach(sec => {
        if (updateData[sec] !== undefined) {
          content[sec] = updateData[sec];
          content.markModified(sec);
        }
      });

      if (updateData.lastUpdatedBy) {
        content.lastUpdatedBy = updateData.lastUpdatedBy;
      }

      await content.save();
    } else {
      content = await LandingContent.create(updateData);
    }

    res.status(200).json({
      success: true,
      message: 'Landing page content updated successfully',
      data: content
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
