const Service = require('../../models/Service');
const Brand = require('../../models/Brand');
const { validationResult } = require('express-validator');
const { SERVICE_STATUS } = require('../../utils/constants');

/**
 * Get all services (with filter by brandId)
 * GET /api/admin/services
 */
const getAllServices = async (req, res) => {
  try {
    const { status, brandId, categoryId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (brandId) query.brandId = brandId;
    if (categoryId) query.categoryId = categoryId;

    const services = await Service.find(query)
      .populate('brandId', 'title')
      .populate('categoryId', 'title')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: services.length,
      services
    });
  } catch (error) {
    console.error('Get all services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services'
    });
  }
};

/**
 * Get single service by ID
 * GET /api/admin/services/:id
 */
const getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('brandId', 'title')
      .populate('categoryId', 'title');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.status(200).json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service'
    });
  }
};

/**
 * Create new service
 * POST /api/admin/services
 */
const createService = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      brandId,
      categoryId,
      title,
      basePrice,
      gstPercentage,
      description,
      status,
      iconUrl,
      hourly_price,
      land_price,
      land_unit,
      daily_price,
      pricing_context,
      parentSourceId,
      distance_pricing
    } = req.body;

    // Verify brand exists if brandId is supplied
    if (brandId) {
      const brand = await Brand.findById(brandId);
      if (!brand) {
        return res.status(404).json({
          success: false,
          message: 'Brand not found'
        });
      }
    }

    // Try to create service
    // If slug collision happens within same brand, mongoose throws duplicate key error
    const service = await Service.create({
      brandId,
      categoryId,
      title,
      basePrice: basePrice || hourly_price || daily_price || land_price || 0,
      gstPercentage: gstPercentage || 18,
      description,
      status: status || SERVICE_STATUS.ACTIVE,
      iconUrl,
      hourly_price: hourly_price || 0,
      land_price: land_price || 0,
      land_unit: land_unit || 'acre',
      daily_price: daily_price || 0,
      pricing_context: pricing_context || 'any',
      parentSourceId: parentSourceId || null,
      ...(distance_pricing ? { distance_pricing: sanitizeDistancePricing(distance_pricing) } : {})
    });

    res.status(201).json({
      success: true,
      message: 'Service Template created successfully. Defined prices will act as caps for vendors.',
      isPriceCap: true,
      service
    });
  } catch (error) {
    // Handle duplicate slug error specifically
    if (error.code === 11000 && error.keyPattern && error.keyPattern.slug) {
      return res.status(409).json({
        success: false,
        message: 'A service with this name already exists for this brand.'
      });
    }

    console.error('Create service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service'
    });
  }
};

/**
 * Update service
 * PUT /api/admin/services/:id
 */
const sanitizeDistancePricing = (d = {}) => {
  const n = (v) => Math.max(0, Number(v) || 0);
  return { enabled: Boolean(d.enabled), baseKm: n(d.baseKm), baseCharge: n(d.baseCharge), perKmRate: n(d.perKmRate) };
};

const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // If brandId is being updated, verify it exists
    if (updates.brandId) {
      const brand = await Brand.findById(updates.brandId);
      if (!brand) {
        return res.status(404).json({
          success: false,
          message: 'Brand not found'
        });
      }
    }

    // Update fields
    if (updates.title) service.title = updates.title;
    if (updates.categoryId) service.categoryId = updates.categoryId;
    if (updates.basePrice !== undefined) service.basePrice = updates.basePrice;
    if (updates.gstPercentage !== undefined) service.gstPercentage = updates.gstPercentage;
    if (updates.description !== undefined) service.description = updates.description;
    if (updates.status) service.status = updates.status;
    if (updates.iconUrl !== undefined) service.iconUrl = updates.iconUrl;
    if (updates.brandId) service.brandId = updates.brandId;
    
    // Rental Pricing Fields
    if (updates.hourly_price !== undefined) service.hourly_price = updates.hourly_price;
    if (updates.land_price !== undefined) service.land_price = updates.land_price;
    if (updates.land_unit !== undefined) service.land_unit = updates.land_unit;
    if (updates.daily_price !== undefined) service.daily_price = updates.daily_price;
    if (updates.pricing_context !== undefined) service.pricing_context = updates.pricing_context;
    if (updates.parentSourceId !== undefined) service.parentSourceId = updates.parentSourceId || null;
    if (updates.distance_pricing !== undefined) service.distance_pricing = sanitizeDistancePricing(updates.distance_pricing);
    
    // Sync basePrice if it's not explicitly sent but rental rates are
    if (updates.basePrice === undefined) {
       service.basePrice = service.hourly_price || service.daily_price || service.land_price || service.basePrice;
    }

    // Slugs are auto-updated if title changes via pre-save hook? 
    // Wait, the pre-save hook only runs if slug is empty or we explicitly modify it?
    // In Mongoose schemas, I usually rely on logic. 
    // My previous Service.js schema had logic: if (this.isModified('title') && !this.slug)
    // This implies slug is created once.
    // If user changes title, slug might remain old? 
    // If they want to regenerate usage, they should clear slug?
    // Service.js has: if (this.isModified('title') && !this.slug)
    // So updating title WON'T update slug unless slug is cleared.
    // This is generally safer for URLs.

    await service.save();

    res.status(200).json({
      success: true,
      message: 'Service Template updated successfully. Defined prices will act as caps for vendors.',
      isPriceCap: true,
      service
    });
  } catch (error) {
    // Handle duplicate slug error specifically
    if (error.code === 11000 && error.keyPattern && error.keyPattern.slug) {
      return res.status(409).json({
        success: false,
        message: 'A service with this name already exists for this brand.'
      });
    }

    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service'
    });
  }
};

/**
 * Delete service
 * DELETE /api/admin/services/:id
 */
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    // Hard delete as requested
    const service = await Service.findByIdAndDelete(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Service deleted permanently'
    });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service'
    });
  }
};

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService
};
