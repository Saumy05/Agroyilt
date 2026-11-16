const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  restoreService
} = require('../../controllers/adminControllers/serviceController');

const serviceValidation = [
  body('brandId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Valid Brand ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('basePrice').isNumeric().withMessage('Base Price must be a number'),
  body('gstPercentage').isNumeric().withMessage('GST Percentage must be a number')
];

router.get('/services', authenticate, isAdmin, getAllServices);
router.get('/services/:id', authenticate, isAdmin, getServiceById);
router.post('/services', authenticate, isAdmin, serviceValidation, createService);
router.put('/services/:id', authenticate, isAdmin, updateService);
router.delete('/services/:id', authenticate, isAdmin, deleteService);
router.patch('/services/:id/restore', authenticate, isAdmin, restoreService);
router.put('/services/:id/restore', authenticate, isAdmin, restoreService);

module.exports = router;
