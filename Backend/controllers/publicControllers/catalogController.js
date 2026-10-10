const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const Service = require('../../models/Service');
const HomeContent = require('../../models/HomeContent');

/**
 * Public Catalog Controllers
 * These endpoints are accessible without authentication for user app
 */

/**
 * Get all active categories for user app
 * GET /api/public/categories
 */
const getPublicCategories = async (req, res) => {
  try {
    const { cityId, stateId, districtId, subDistrictId, type, showOnHome, all, mode } = req.query;
    const mongoose = require('mongoose');

    let query = { status: 'active' };
    if (showOnHome !== undefined) {
      query.showOnHome = showOnHome === 'true';
    } else if (all !== 'true') {
      query.showOnHome = true;
    }
    // Optional filter: mode=rental -> rental categories only; mode=service -> everything not marked rental
    if (mode === 'rental') query.fulfillmentMode = 'rental';
    else if (mode === 'service') query.fulfillmentMode = { $ne: 'rental' };
    const globalScopes = ['GLOBAL', 'GLOBAL_INDIA'];

    const hasLocation = Boolean(stateId || districtId || subDistrictId || cityId);

    if (hasLocation) {
      const scopeConditions = [
        { scope: { $in: globalScopes } }
      ];

      if (stateId && mongoose.Types.ObjectId.isValid(stateId)) {
        scopeConditions.push({ scope: 'STATE', stateId: new mongoose.Types.ObjectId(stateId) });
      }
      if (districtId && mongoose.Types.ObjectId.isValid(districtId)) {
        scopeConditions.push({ scope: 'DISTRICT', districtId: new mongoose.Types.ObjectId(districtId) });
      }
      if (subDistrictId && mongoose.Types.ObjectId.isValid(subDistrictId)) {
        scopeConditions.push({ scope: 'SUB_DISTRICT', subDistrictId: new mongoose.Types.ObjectId(subDistrictId) });
      }
      if (cityId) {
        let cityObjectId;
        try {
          cityObjectId = new mongoose.Types.ObjectId(cityId);
        } catch (e) {
          cityObjectId = cityId;
        }
        scopeConditions.push({ scope: 'CITY_SPECIFIC', city: cityObjectId });
      }

      query.$or = scopeConditions;
    } else {
      query.scope = { $in: globalScopes };
    }

    // Calculate total count
    let homeCatsCount = await Category.countDocuments(query);

    let categories = await Category.find(query)
      .select('title slug homeIconUrl homeBadge hasSaleBadge homeOrder showOnHome parentCategory parentCategories isAlwaysMain trackingType requiresDriver sectionType bookingType fulfillmentMode')
      .populate('parentCategories', 'title slug')
      .sort({ homeOrder: 1, createdAt: -1 })
      .lean();

    const initialCategories = categories.map(cat => ({
      id: cat._id?.toString() || '',
      title: cat.title || '',
      slug: cat.slug || '',
      icon: cat.homeIconUrl || '',
      badge: cat.homeBadge || '',
      hasSaleBadge: !!cat.hasSaleBadge,
      showOnHome: !!cat.showOnHome,
      homeOrder: cat.homeOrder || 0,
      parentCategory: cat.parentCategory || null,
      parentCategories: Array.isArray(cat.parentCategories)
        ? cat.parentCategories.map(p => ({
            id: p._id?.toString() || p.toString(),
            title: p.title || '',
            slug: p.slug || ''
          }))
        : [],
      isAlwaysMain: !!cat.isAlwaysMain,
      trackingType: cat.trackingType || 'none',
      requiresDriver: cat.requiresDriver || false,
      sectionType: cat.sectionType || 'General',
      fulfillmentMode: cat.fulfillmentMode || 'service',
      bookingType: cat.bookingType || (/labour|labor|worker|manpower|service|shramik|majdoor/i.test(cat.title || '') ? 'WORKER' : 'VENDOR')
    }));

    // Fetch brands for these categories
    const categoryIds = categories.map(c => c._id).filter(id => id);

    const brandQuery = {
      categoryIds: { $in: categoryIds },
      status: 'active'
    };
    if (cityId) {
      brandQuery.cityIds = cityId;
    }

    const brands = await Brand.find(brandQuery).select('title categoryIds').lean();

    // Fetch services (equipments) for these categories
    const serviceQuery = {
      categoryId: { $in: categoryIds },
      status: 'active'
    };
    const services = await Service.find(serviceQuery).select('title categoryId').lean();

    // Map brands and services to categories
    const categoriesWithBrands = initialCategories.map(cat => {
      const catBrands = brands.filter(b => 
        b.categoryIds && Array.isArray(b.categoryIds) && b.categoryIds.some(id => id.toString() === cat.id)
      ).map(b => b.title);
      
      const catServices = services.filter(s => 
        s.categoryId && s.categoryId.toString() === cat.id
      ).map(s => s.title);
      
      return { ...cat, subBrands: catBrands, subServices: catServices };
    });

    res.status(200).json({
      success: true,
      categories: categoriesWithBrands
    });
  } catch (error) {
    console.error('Get public categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories. Please try again.'
    });
  }
};

/**
 * Get all active brands for user app (Formerly Services)
 * GET /api/public/brands
 */
const getPublicBrands = async (req, res) => {
  try {
    const { categoryId, categorySlug, search, cityId } = req.query;

    // Build query
    const query = { status: 'active' };
    if (categoryId) query.categoryIds = categoryId;
    if (cityId) {
      const mongoose = require('mongoose');
      let cityObjectId;
      try {
        cityObjectId = new mongoose.Types.ObjectId(cityId);
      } catch (e) {
        cityObjectId = cityId; // fallback if invalid ObjectId format
      }
      
      query.cityIds = cityObjectId;
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = { $regex: escapedSearch, $options: 'i' };
    }

    let brands = await Brand.find(query)
      .select('title slug iconUrl logo imageUrl badge categoryIds basePrice discountPrice sections')
      .sort({ createdAt: -1 })
      .lean();

    // If categorySlug is provided, filter by category
    if (categorySlug) {
      const catQuery = { slug: categorySlug, status: 'active' };
      if (cityId) {
        const mongoose = require('mongoose');
        let cityObjectId;
        try {
          cityObjectId = new mongoose.Types.ObjectId(cityId);
        } catch (e) {
          cityObjectId = cityId;
        }
        catQuery.$or = [
          { scope: 'GLOBAL' },
          { scope: 'CITY_SPECIFIC', city: cityObjectId }
        ];
      } else {
        catQuery.scope = 'GLOBAL';
      }

      let category = await Category.findOne(catQuery).lean();

      if (!category && cityId) {
        category = await Category.findOne({ slug: categorySlug, status: 'active' }).lean();
      }

      if (category) {
        brands = brands.filter(b =>
          Array.isArray(b.categoryIds) &&
          b.categoryIds.some(id => id.toString() === category._id.toString())
        );
      }
    }

    res.status(200).json({
      success: true,
      brands: brands.map(brand => ({
        id: brand._id.toString(),
        title: brand.title,
        slug: brand.slug,
        icon: brand.iconUrl || '',
        logo: brand.logo || brand.iconUrl || '',
        imageUrl: brand.imageUrl || brand.iconUrl || '',
        badge: brand.badge || '',
        price: brand.basePrice || 0, // Legacy support
        originalPrice: brand.discountPrice ? (brand.basePrice + brand.discountPrice) : (brand.basePrice || 0),
        categoryId: brand.categoryIds && brand.categoryIds.length > 0 ? brand.categoryIds[0].toString() : null,
        categoryIds: (brand.categoryIds || []).map(id => id.toString()),
        sections: brand.sections || []
      }))
    });
  } catch (error) {
    console.error('Get public brands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brands. Please try again.'
    });
  }
};

/**
 * Get brand by slug for user app
 * GET /api/public/brands/slug/:slug
 */
const getPublicBrandBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const brand = await Brand.findOne({ slug, status: 'active' })
      .populate('categoryIds', 'title slug')
      .lean();

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    // Remove _id from nested objects
    const cleanBrand = JSON.parse(JSON.stringify(brand));
    const removeIds = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(item => {
          if (item && typeof item === 'object') {
            const { _id, ...rest } = item;
            return removeIds(rest);
          }
          return item;
        });
      } else if (obj && typeof obj === 'object') {
        const { _id, ...rest } = obj;
        return Object.keys(rest).reduce((acc, key) => {
          acc[key] = removeIds(rest[key]);
          return acc;
        }, {});
      }
      return obj;
    };

    // Fetch services associated with this brand
    const brandServices = await Service.find({ brandId: brand._id, status: 'active' }).lean();

    // Map services to a default section structure for the frontend
    const servicesSection = {
      title: brand.title,
      subtitle: 'Available Services',
      cards: brandServices.map(svc => ({
        id: svc._id.toString(),
        title: svc.title,
        subtitle: svc.description || '',
        price: svc.basePrice,
        hourly_price: svc.hourly_price || svc.basePrice || 0,
        land_price: svc.land_price || 0,
        land_unit: svc.land_unit || 'acre',
        daily_price: svc.daily_price || 0,
        rating: "4.8", // Default rating
        reviews: "1k+", // Default reviews
        imageUrl: svc.iconUrl || brand.iconUrl || '',
        features: svc.description ? [svc.description] : [],
        duration: "60 min" // Default duration
      }))
    };

    const formattedBrand = {
      id: brand._id.toString(),
      title: brand.title,
      slug: brand.slug,
      icon: brand.iconUrl || '',
      logo: brand.logo || '',
      badge: brand.badge || '',
      basePrice: brand.basePrice, // Legacy
      category: brand.categoryIds && brand.categoryIds[0] ? {
        id: brand.categoryIds[0]._id.toString(),
        title: brand.categoryIds[0].title,
        slug: brand.categoryIds[0].slug
      } : null,
      categories: (brand.categoryIds || []).map(cat => ({
        id: cat._id.toString(),
        title: cat.title,
        slug: cat.slug
      })),
      page: brand.page ? removeIds(brand.page) : {
        banners: brand.iconUrl ? [{ imageUrl: brand.iconUrl, text: brand.title }] : [],
        paymentOffers: [],
        paymentOffersEnabled: false
      },
      sections: brandServices.length > 0 ? [servicesSection] : []
    };

    res.status(200).json({
      success: true,
      brand: formattedBrand
    });
  } catch (error) {
    console.error('Get public brand by slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brand. Please try again.'
    });
  }
};

/**
 * Get services based on brand
 * GET /api/public/services
 */
const getPublicServices = async (req, res) => {
  try {
    const { brandId, brandSlug, categoryId, category, parentSourceId, pricing_context, search } = req.query;
    const catId = categoryId || category;

    const query = { status: { $ne: 'deleted' } };

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { title: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    if (brandId) {
      query.brandId = brandId;
    } else if (brandSlug) {
      const brand = await Brand.findOne({ slug: brandSlug });
      if (brand) {
        query.brandId = brand._id;
      } else {
        return res.status(200).json({ success: true, services: [] });
      }
    }

    if (catId) {
      const mongoose = require('mongoose');
      let catIdObj;
      try {
        catIdObj = new mongoose.Types.ObjectId(catId);
      } catch (e) {
        catIdObj = catId;
      }
      query.$or = [
        { categoryId: catId },
        { categoryId: catIdObj }
      ];
    }

    if (parentSourceId) {
      query.parentSourceId = parentSourceId;
    }

    if (pricing_context) {
      // Include services tagged with the specific context OR 'any' (which means valid for all contexts)
      query.pricing_context = { $in: [pricing_context, 'any'] };
    }

    const services = await Service.find(query).sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      services: services.map(svc => ({
        id: svc._id.toString(),
        title: svc.title,
        slug: svc.slug,
        icon: svc.iconUrl,
        basePrice: svc.basePrice,
        hourly_price: svc.hourly_price || svc.basePrice || 0,
        land_price: svc.land_price || 0,
        land_unit: svc.land_unit || 'acre',
        daily_price: svc.daily_price || 0,
        pricing_context: svc.pricing_context || 'any',
        parentSourceId: svc.parentSourceId ? svc.parentSourceId.toString() : null,
        categoryId: svc.categoryId ? svc.categoryId.toString() : null,
        brandId: svc.brandId ? svc.brandId.toString() : null,
        gstPercentage: svc.gstPercentage,
        description: svc.description
      }))
    });
  } catch (error) {
    console.error('Get public services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services'
    });
  }
};

/**
 * Get home content
 */
const getPublicHomeContent = async (req, res) => {
  try {
    const { cityId } = req.query;
    let homeContent = await HomeContent.getHomeContent(cityId);

    // FALLBACK LOGIC: Check if the city-specific content is essentially empty or missing
    const isDocEmpty = (doc) => {
      if (!doc) return true;
      return (!doc.banners || doc.banners.length === 0) &&
             (!doc.promos || doc.promos.length === 0) &&
             (!doc.curated || doc.curated.length === 0) &&
             (!doc.noteworthy || doc.noteworthy.length === 0) &&
             (!doc.booked || doc.booked.length === 0) &&
             (!doc.categorySections || doc.categorySections.length === 0) &&
             (!doc.premiumOfferings || doc.premiumOfferings.length === 0);
    };

    if (cityId && isDocEmpty(homeContent)) {
      const defaultContent = await HomeContent.findOne({ cityId: null });
      if (defaultContent && !isDocEmpty(defaultContent)) {
        homeContent = defaultContent;
      }
    }

    if (!homeContent) {
      return res.status(200).json({
        success: true,
        homeContent: {
          banners: [],
          promos: [],
          curated: [],
          noteworthy: [],
          booked: [],
          premiumOfferings: [],
          categorySections: []
        }
      });
    }

    // Used for backwards compatibility, we might need to update this to refer to Brands?
    // For now keeping as is, but assuming targetServiceId will point to Brand ID essentially.

    const contentObj = homeContent.toObject();

    const formattedContent = {
      banners: (contentObj.banners || []).map(item => ({
        ...item,
        id: item._id ? item._id.toString() : item.id,
        targetCategoryId: item.targetCategoryId?.toString() || null,
        targetServiceId: item.targetServiceId?.toString() || null,
      })),
      promos: (contentObj.promos || []).map(item => ({
        ...item,
        id: item._id ? item._id.toString() : item.id,
        targetCategoryId: item.targetCategoryId?.toString() || null,
        targetServiceId: item.targetServiceId?.toString() || null,
      })),
      curated: (contentObj.curated || []).map(item => ({
        ...item,
        id: item._id ? item._id.toString() : item.id,
        targetCategoryId: item.targetCategoryId?.toString() || null,
        targetServiceId: item.targetServiceId?.toString() || null,
      })),
      noteworthy: (contentObj.noteworthy || []).map(item => ({
        ...item,
        id: item._id ? item._id.toString() : item.id,
        targetCategoryId: item.targetCategoryId?.toString() || null,
        targetServiceId: item.targetServiceId?.toString() || null,
      })),
      booked: (contentObj.booked || []).map(item => ({
        ...item,
        id: item._id ? item._id.toString() : item.id,
        targetCategoryId: item.targetCategoryId?.toString() || null,
        targetServiceId: item.targetServiceId?.toString() || null,
      })),
      premiumOfferings: (contentObj.premiumOfferings || [])
        .filter(item => {
          const t = (item.title || '').toLowerCase();
          const sub = (item.subtitle || '').toLowerCase();
          const r = (item.route || '').toLowerCase();
          const isSoil = t.includes('soil') || sub.includes('soil') || r.includes('soil');
          const isMarket = t.includes('market') || sub.includes('market') || sub.includes('store') || r.includes('agri-store') || r.includes('agri-marketplace');
          return !isSoil && !isMarket;
        })
        .map(item => ({
          ...item,
          id: item._id ? item._id.toString() : item.id,
        })),
      categorySections: (contentObj.categorySections || []).map(section => ({
        ...section,
        id: section._id ? section._id.toString() : section.id,
        seeAllTargetCategoryId: section.seeAllTargetCategoryId?.toString() || null,
        seeAllTargetServiceId: section.seeAllTargetServiceId?.toString() || null,
        cards: (section.cards || []).map(card => ({
          ...card,
          id: card._id ? card._id.toString() : card.id,
          targetCategoryId: card.targetCategoryId?.toString() || null,
          targetServiceId: card.targetServiceId?.toString() || null,
        }))
      })),
      isBannersVisible: contentObj.isBannersVisible ?? true,
      isPromosVisible: contentObj.isPromosVisible ?? true,
      isCuratedVisible: contentObj.isCuratedVisible ?? true,
      isNoteworthyVisible: contentObj.isNoteworthyVisible ?? true,
      isBookedVisible: contentObj.isBookedVisible ?? true,
      isPremiumOfferingsVisible: contentObj.isPremiumOfferingsVisible ?? true,
      isCategorySectionsVisible: contentObj.isCategorySectionsVisible ?? true,
      isCategoriesVisible: contentObj.isCategoriesVisible ?? true
    };

    res.status(200).json({
      success: true,
      homeContent: formattedContent
    });

  } catch (error) {
    console.error('Get public home content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch home content. Please try again.'
    });
  }
};

/**
 * Get active independent workers for catalog/category
 * GET /api/public/workers
 */
const getPublicWorkers = async (req, res) => {
  try {
    const { categoryId, category } = req.query;
    const Worker = require('../../models/Worker');
    const Category = require('../../models/Category');

    const catId = categoryId || category;
    let query = { isActive: true };

    if (catId) {
      let catDoc = await Category.findById(catId).catch(() => null);
      if (!catDoc) {
        catDoc = await Category.findOne({ title: catId }).catch(() => null);
      }
      const categoryTitle = catDoc ? catDoc.title : catId;

      query.$or = [
        { serviceCategories: categoryTitle },
        { serviceCategories: { $regex: new RegExp(categoryTitle, 'i') } }
      ];
    }

    const workers = await Worker.find(query)
      .select('name phone profilePhoto rating totalJobs completedJobs address status hourlyRate dailyRate landRate customRates serviceCategories skills')
      .sort({ rating: -1, completedJobs: -1 })
      .lean();

    res.status(200).json({
      success: true,
      workers: workers.map(w => ({
        id: w._id.toString(),
        _id: w._id.toString(),
        name: w.name,
        profilePhoto: w.profilePhoto || '',
        rating: w.rating || 4.8,
        totalJobs: w.totalJobs || 0,
        completedJobs: w.completedJobs || 0,
        address: w.address || {},
        status: w.status || 'OFFLINE',
        hourlyRate: w.hourlyRate || 0,
        dailyRate: w.dailyRate || 0,
        landRate: w.landRate || 0,
        customRates: w.customRates || [],
        serviceCategories: w.serviceCategories || [],
        skills: w.skills || []
      }))
    });
  } catch (error) {
    console.error('Get public workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workers'
    });
  }
};

module.exports = {
  getPublicCategories,
  getPublicBrands,
  getPublicBrandBySlug,
  getPublicServices,
  getPublicHomeContent,
  getPublicWorkers
};
