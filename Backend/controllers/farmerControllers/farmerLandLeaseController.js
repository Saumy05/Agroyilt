const LandLease = require('../../models/LandLease');
const User = require('../../models/User');
const mongoose = require('mongoose');
const Settings = require('../../models/Settings');
const { buildAgreement, commissionSplit, round2 } = require('../../services/landLeaseScheduleService');
const { payItem } = require('../../services/landLeasePaymentService');
const { notifyLease } = require('../../services/landLeaseNotifyService');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper to ensure a dedicated verified demo landowner account exists
const getOrCreateDemoLandowner = async () => {
  try {
    let demoOwner = await User.findOne({
      $or: [
        { phone: '9800000001' },
        { email: 'demo.landowner@agroyilt.com' }
      ]
    });

    if (!demoOwner) {
      demoOwner = await User.create({
        name: 'रामकरण गुर्जर (सत्यापित भूस्वामी)',
        phone: '9800000001',
        email: 'demo.landowner@agroyilt.com',
        role: 'user',
        isPhoneVerified: true
      });
    }
    return demoOwner._id;
  } catch (err) {
    console.error('Error ensuring demo landowner:', err.message);
    const fallbackUser = await User.findOne({ role: 'user' });
    return fallbackUser ? fallbackUser._id : null;
  }
};

// Seed realistic agricultural lands if empty, and detach sample lands from personal accounts
const seedInitialLandsIfNeeded = async (userId) => {
  // Demo owner + sample lands are for local testing only; never create them on a real database
  if (process.env.NODE_ENV === 'production') return;
  try {
    const sampleKhasras = ['142/18', '89/3', '210/4-5', '55/1'];
    const demoOwnerId = await getOrCreateDemoLandowner();

    // Re-assign sample lands away from current user if they were seeded under their account
    if (demoOwnerId && userId) {
      await LandLease.updateMany(
        { khasraNumber: { $in: sampleKhasras }, ownerId: userId },
        { $set: { ownerId: demoOwnerId } }
      );
    }

    const count = await LandLease.countDocuments();
    if (count > 0) return;

    const ownerId = demoOwnerId || userId;
    if (!ownerId) return;

    const sampleLands = [
      {
        ownerId,
        title: 'उपजाऊ 12 एकड़ नहरी भूमि (Fertile Canal-Fed Farmland)',
        description: 'काली गहरी दोमट मिट्टी, 24 घंटे इंदिरा गांधी नहर से पानी की सुविधा। गेहूं, सरसों और कपास की बंपर पैदावार हेतु उपयुक्त। पक्की सड़क से सीधे जुड़ाव।',
        sizeInAcres: 12,
        khasraNumber: '142/18',
        location: {
          addressLine1: 'ग्राम पंचायत खारी, सूरतगढ़ रोड',
          city: 'Sri Ganganagar',
          district: 'Sri Ganganagar',
          state: 'Rajasthan',
          pincode: '335001',
          lat: 29.9038,
          lng: 73.8772,
          fullAddress: 'Village Khari, Suratgarh Road, Sri Ganganagar, Rajasthan'
        },
        geoLocation: {
          type: 'Point',
          coordinates: [73.8772, 29.9038]
        },
        leaseType: 'fixed-rent',
        pricePerAcre: 35000,
        soilType: 'Alluvial Soil (दोमट मिट्टी)',
        irrigationSource: 'Canal / नहर + Tubewell',
        electricity: true,
        fencing: true,
        roadAccess: 'Paved Road / पक्की सड़क',
        suitableCrops: ['Wheat / गेहूं', 'Mustard / सरसों', 'Cotton / कपास', 'Gram / चना'],
        images: [
          'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80',
          'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1000&q=80'
        ],
        availableFrom: new Date(),
        availableTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'active',
        verificationStatus: 'approved'
      },
      {
        ownerId,
        title: '8 एकड़ ट्यूबवेल व सोलर पंप युक्त खेत (8 Acre Farmland with Solar Pump)',
        description: 'हाइवे से 500 मीटर अंदर, 7.5 HP सोलर पंप लगा हुआ, 3 इंच पानी की धार। सोयाबीन, लहसुन व प्याज की खेती के लिए सबसे उत्तम। तारबंदी की हुई है।',
        sizeInAcres: 8,
        khasraNumber: '89/3',
        location: {
          addressLine1: 'तहसील लाडपुरा, कैथून रोड',
          city: 'Kota',
          district: 'Kota',
          state: 'Rajasthan',
          pincode: '325001',
          lat: 25.18,
          lng: 75.83,
          fullAddress: 'Kaithun Road, Ladpura, Kota, Rajasthan'
        },
        geoLocation: {
          type: 'Point',
          coordinates: [75.83, 25.18]
        },
        leaseType: 'crop-share',
        sharePercentage: 50,
        soilType: 'Black Cotton Soil (काली दोमट)',
        irrigationSource: 'Tubewell / बोरवेल (Solar)',
        electricity: true,
        fencing: true,
        roadAccess: 'Gravel Road / खड़ंजा रास्ता',
        suitableCrops: ['Soybean / सोयाबीन', 'Garlic / लहसुन', 'Paddy / धान', 'Wheat / गेहूं'],
        images: [
          'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1000&q=80'
        ],
        availableFrom: new Date(),
        availableTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'active',
        verificationStatus: 'approved'
      },
      {
        ownerId,
        title: '15 एकड़ समतल कृषि भूमि (15 Acre Levelled Agriculture Land)',
        description: 'दो बोरवेल चालू हालत में। 3-फेज कृषि बिजली कनेक्शन उपलब्ध। पिछले 5 वर्षों से जैविक और हरी खाद उपयोग की गई है। बटाई अथवा वार्षिक पट्टे पर उपलब्ध।',
        sizeInAcres: 15,
        khasraNumber: '210/4-5',
        location: {
          addressLine1: 'ग्राम भादसोड़ा, मंडफिया रोड',
          city: 'Chittorgarh',
          district: 'Chittorgarh',
          state: 'Rajasthan',
          pincode: '312024',
          lat: 24.88,
          lng: 74.63,
          fullAddress: 'Village Bhadsora, Chittorgarh, Rajasthan'
        },
        geoLocation: {
          type: 'Point',
          coordinates: [74.63, 24.88]
        },
        leaseType: 'fixed-rent',
        pricePerAcre: 28000,
        soilType: 'Sandy Loam (बलुई दोमट)',
        irrigationSource: 'Tubewell / बोरवेल',
        electricity: true,
        fencing: false,
        roadAccess: 'Paved Road / पक्की सड़क',
        suitableCrops: ['Maize / मक्का', 'Groundnut / मूंगफली', 'Mustard / सरसों'],
        images: [
          'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?auto=format&fit=crop&w=1000&q=80'
        ],
        availableFrom: new Date(),
        availableTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'active',
        verificationStatus: 'approved'
      },
      {
        ownerId,
        title: '6 एकड़ ड्रिप इरिगेशन युक्त सब्जी फार्म (6 Acre Drip Irrigated Veg Farm)',
        description: 'पूर्णतः ड्रिप सिंचाई से सुसज्जित भूमि। टमाटर, मिर्च, तरबूज व सब्जियों की खेती के लिए तैयार। फार्म हाउस व लेबर क्वार्टर भी उपलब्ध।',
        sizeInAcres: 6,
        khasraNumber: '55/1',
        location: {
          addressLine1: 'NH-48 के पास, आमेर',
          city: 'Jaipur',
          district: 'Jaipur',
          state: 'Rajasthan',
          pincode: '302028',
          lat: 26.98,
          lng: 75.85,
          fullAddress: 'Near NH-48, Amer, Jaipur, Rajasthan'
        },
        geoLocation: {
          type: 'Point',
          coordinates: [75.85, 26.98]
        },
        leaseType: 'crop-share',
        sharePercentage: 60,
        soilType: 'Alluvial Soil (दोमट मिट्टी)',
        irrigationSource: 'Drip System / ड्रिप + Borewell',
        electricity: true,
        fencing: true,
        roadAccess: 'Highway Touch / हाइवे टच',
        suitableCrops: ['Vegetables / सब्जियां', 'Watermelon / तरबूज', 'Chilli / मिर्च'],
        images: [
          'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=1000&q=80'
        ],
        availableFrom: new Date(),
        availableTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'active',
        verificationStatus: 'approved'
      }
    ];

    await LandLease.insertMany(sampleLands);
    console.log('✅ Seeded initial LandLease records');
  } catch (err) {
    console.error('Error seeding sample LandLease data:', err.message);
  }
};

// Freeze the agreed terms (and the fixed-rent installment schedule) on the lease being accepted
const applyAgreement = async (lease, offer) => {
  const settings = await Settings.findOne({ type: 'global' }).select('landLeaseCommissionPercentage').lean();
  const commission = settings?.landLeaseCommissionPercentage ?? 2;
  const { agreement, installments } = buildAgreement(lease, offer, commission);
  lease.agreement = agreement;
  lease.installments = installments;
};

const farmerLandLeaseController = {
  // 1. List Land (Post Farmland for lease)
  listLand: async (req, res) => {
    try {
      const {
        title,
        description,
        sizeInAcres,
        khasraNumber,
        location,
        leaseType,
        pricePerAcre,
        sharePercentage,
        availableFrom,
        availableTo,
        documents,
        images,
        soilType,
        irrigationSource,
        electricity,
        fencing,
        roadAccess,
        suitableCrops,
        lat,
        lng
      } = req.body;

      const ownerId = req.user.id;

      if (!title || !sizeInAcres || !khasraNumber || !leaseType || !availableFrom || !availableTo) {
        return res.status(400).json({
          success: false,
          message: 'Please provide all required fields (title, size, khasra number, lease type, dates)'
        });
      }

      if (!['fixed-rent', 'crop-share'].includes(leaseType)) {
        return res.status(400).json({
          success: false,
          message: 'अमान्य पट्टा प्रकार (Invalid lease type)'
        });
      }

      if (!(Number(sizeInAcres) > 0)) {
        return res.status(400).json({
          success: false,
          message: 'भूमि का आकार शून्य से अधिक होना चाहिए (Land size must be greater than 0)'
        });
      }

      if (leaseType === 'fixed-rent' && !(Number(pricePerAcre) > 0)) {
        return res.status(400).json({
          success: false,
          message: 'कृपया प्रति एकड़ किराया दर्ज करें (Price per acre is required for fixed-rent)'
        });
      }

      if (leaseType === 'crop-share') {
        const share = Number(sharePercentage);
        if (!(share > 0 && share <= 100)) {
          return res.status(400).json({
            success: false,
            message: 'हिस्सेदारी 1 से 100 प्रतिशत के बीच होनी चाहिए (Share must be between 1 and 100%)'
          });
        }
      }

      const latitude = lat || location?.lat || 26.9124;
      const longitude = lng || location?.lng || 75.8577;

      const landLease = new LandLease({
        ownerId,
        title: title.trim(),
        description: description?.trim() || `${sizeInAcres} एकड़ कृषि भूमि पट्टे / ठेके हेतु उपलब्ध।`,
        sizeInAcres: Number(sizeInAcres),
        khasraNumber: khasraNumber.trim(),
        location: {
          addressLine1: location?.addressLine1 || '',
          village: location?.village || '',
          tehsil: location?.tehsil || '',
          city: location?.city || location?.tehsil || location?.village || '',
          district: location?.district || location?.city || '',
          state: location?.state || 'Rajasthan',
          pincode: location?.pincode || '',
          lat: latitude,
          lng: longitude,
          fullAddress: location?.fullAddress || [
            location?.village ? `ग्राम ${location.village}` : '',
            location?.tehsil ? `तहसील ${location.tehsil}` : '',
            location?.district || location?.city,
            location?.state || 'Rajasthan'
          ].filter(Boolean).join(', ')
        },
        geoLocation: {
          type: 'Point',
          coordinates: [Number(longitude), Number(latitude)]
        },
        leaseType,
        pricePerAcre: leaseType === 'fixed-rent' ? Number(pricePerAcre) : null,
        sharePercentage: leaseType === 'crop-share' ? Number(sharePercentage) : null,
        availableFrom: new Date(availableFrom),
        availableTo: new Date(availableTo),
        documents: documents || [],
        images: images && images.length > 0 ? images : [
          'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80'
        ],
        soilType: soilType || 'Alluvial Soil (दोमट मिट्टी)',
        irrigationSource: irrigationSource || 'Tubewell / बोरवेल',
        electricity: electricity !== undefined ? electricity : true,
        fencing: fencing !== undefined ? fencing : false,
        roadAccess: roadAccess || 'Paved Road / पक्की सड़क',
        suitableCrops: suitableCrops || ['Wheat / गेहूं', 'Mustard / सरसों'],
        status: 'active',
        verificationStatus: 'approved'
      });

      await landLease.save();

      res.status(201).json({
        success: true,
        message: 'कृषि भूमि सफलतापूर्वक सूचीबद्ध की गई (Land listed successfully for lease)',
        data: landLease
      });
    } catch (error) {
      console.error('Error listing land:', error);
      res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
    }
  },

  // 2. Browse Land Leases (with search, filters, pagination)
  browseLandLeases: async (req, res) => {
    try {
      await seedInitialLandsIfNeeded(req.user?.id);

      const {
        type,
        search,
        minAcres,
        maxAcres,
        minPrice,
        maxPrice,
        soilType,
        irrigationSource,
        excludeOwn,
        page = 1,
        limit = 30
      } = req.query;

      let filter = {
        status: { $in: ['active', 'leased'] }
      };

      // Filter out user's own listings if excludeOwn is requested
      if (excludeOwn === 'true' && req.user?.id) {
        filter.ownerId = { $ne: req.user.id };
      }

      if (type && type !== 'all') {
        filter.leaseType = type;
      }

      if (minAcres || maxAcres) {
        filter.sizeInAcres = {};
        if (minAcres) filter.sizeInAcres.$gte = Number(minAcres);
        if (maxAcres) filter.sizeInAcres.$lte = Number(maxAcres);
      }

      if (minPrice || maxPrice) {
        filter.pricePerAcre = {};
        if (minPrice) filter.pricePerAcre.$gte = Number(minPrice);
        if (maxPrice) filter.pricePerAcre.$lte = Number(maxPrice);
      }

      if (soilType) {
        filter.soilType = new RegExp(escapeRegex(soilType), 'i');
      }

      if (irrigationSource) {
        filter.irrigationSource = new RegExp(escapeRegex(irrigationSource), 'i');
      }

      if (search && search.trim()) {
        const regex = new RegExp(escapeRegex(search.trim()), 'i');
        filter.$or = [
          { title: regex },
          { description: regex },
          { 'location.village': regex },
          { 'location.tehsil': regex },
          { 'location.city': regex },
          { 'location.district': regex },
          { 'location.state': regex },
          { 'location.fullAddress': regex },
          { khasraNumber: regex }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [leases, total] = await Promise.all([
        LandLease.find(filter)
          .populate('ownerId', 'name phone profilePhoto')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        LandLease.countDocuments(filter)
      ]);

      const formatted = leases.map(item => {
        const isOwner = String(item.ownerId?._id || item.ownerId) === String(req.user?.id);
        return {
          ...item,
          isOwner,
          owner: {
            name: item.ownerId?.name || 'Verified Landowner',
            phone: isOwner ? item.ownerId?.phone : '',
            profilePhoto: item.ownerId?.profilePhoto || ''
          }
        };
      });

      res.status(200).json({
        success: true,
        data: formatted,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Error browsing land leases:', error);
      res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
    }
  },

  // 3. Get Single Land Lease Details
  getLandLeaseById: async (req, res) => {
    try {
      const { id } = req.params;
      const lease = await LandLease.findById(id)
        .populate('ownerId', 'name phone profilePhoto')
        .populate('currentTenantId', 'name phone')
        .lean();

      if (!lease) {
        return res.status(404).json({ success: false, message: 'भूमि विवरण उपलब्ध नहीं है (Land not found)' });
      }

      const isOwner = String(lease.ownerId?._id || lease.ownerId) === String(req.user?.id);

      // Only show full offers to the owner
      if (!isOwner) {
        delete lease.offers;
      }

      res.status(200).json({
        success: true,
        data: {
          ...lease,
          isOwner,
          owner: {
            name: lease.ownerId?.name || 'Verified Landowner',
            phone: isOwner ? lease.ownerId?.phone : '',
            profilePhoto: lease.ownerId?.profilePhoto || ''
          }
        }
      });
    } catch (error) {
      console.error('Error getting land lease details:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 4. Get My Land Leases (both myListings and myOffers)
  getMyLandLeases: async (req, res) => {
    try {
      const userId = req.user.id;

      // Listings owned by this user
      const myListings = await LandLease.find({ ownerId: userId })
        .sort({ createdAt: -1 })
        .populate('currentTenantId', 'name phone')
        .lean();

      // Lands where this user has made an offer or is the current tenant
      const myAppliedLands = await LandLease.find({
        $or: [
          { 'offers.farmerId': userId },
          { currentTenantId: userId }
        ]
      })
        .populate('ownerId', 'name phone')
        .sort({ updatedAt: -1 })
        .lean();

      // Extract specific offer info for each applied land
      const myOffers = myAppliedLands.map(land => {
        const myOffer = (land.offers || []).find(
          o => String(o.farmerId) === String(userId)
        );
        return {
          landId: land._id,
          title: land.title,
          sizeInAcres: land.sizeInAcres,
          location: land.location,
          leaseType: land.leaseType,
          pricePerAcre: land.pricePerAcre,
          sharePercentage: land.sharePercentage,
          status: land.status,
          images: land.images,
          ownerName: land.ownerId?.name || 'Landowner',
          myOffer: myOffer || null,
          isCurrentTenant: String(land.currentTenantId) === String(userId)
        };
      });

      res.status(200).json({
        success: true,
        data: {
          myListings,
          myOffers
        }
      });
    } catch (error) {
      console.error('Error fetching my land leases:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 5. Negotiate / Submit Offer for Lease
  negotiateLease: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        proposedPrice,
        proposedShare,
        durationMonths = 12,
        proposedCrops,
        message
      } = req.body;

      const lease = await LandLease.findById(id);
      if (!lease) {
        return res.status(404).json({ success: false, message: 'भूमि उपलब्ध नहीं है (Land not found)' });
      }

      if (String(lease.ownerId) === String(req.user.id)) {
        return res.status(400).json({
          success: false,
          message: 'आप अपनी ही भूमि पर प्रस्ताव नहीं भेज सकते (Cannot offer on your own land)'
        });
      }

      if (lease.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'यह भूमि वर्तमान में पट्टे के लिए उपलब्ध नहीं है (Land is not available)'
        });
      }

      const alreadyDecided = (lease.offers || []).find(
        o => String(o.farmerId) === String(req.user.id) && ['rejected', 'accepted'].includes(o.status)
      );
      if (alreadyDecided) {
        return res.status(400).json({
          success: false,
          message: alreadyDecided.status === 'accepted'
            ? 'आपका प्रस्ताव पहले ही स्वीकार हो चुका है (Your offer was already accepted)'
            : 'मालिक ने आपका प्रस्ताव अस्वीकार कर दिया है (The owner has declined your offer)'
        });
      }

      const bid = lease.leaseType === 'fixed-rent' ? Number(proposedPrice || lease.pricePerAcre) : Number(proposedShare || lease.sharePercentage);
      if (!(bid > 0) || (lease.leaseType === 'crop-share' && bid > 100)) {
        return res.status(400).json({ success: false, message: 'अमान्य प्रस्ताव राशि या हिस्सा (Invalid offer amount or share)' });
      }
      const months = Number(durationMonths);
      if (!(months >= 1 && months <= 120)) {
        return res.status(400).json({ success: false, message: 'अवधि 1 से 120 माह के बीच होनी चाहिए (Duration must be 1-120 months)' });
      }

      // Check if user already has a pending offer
      const existingOfferIndex = (lease.offers || []).findIndex(
        o => String(o.farmerId) === String(req.user.id) && o.status === 'pending'
      );

      const offerObj = {
        farmerId: req.user.id,
        farmerName: req.user.name || 'Interested Farmer',
        farmerPhone: req.user.phone || '',
        proposedPrice: lease.leaseType === 'fixed-rent' ? bid : null,
        proposedShare: lease.leaseType === 'crop-share' ? bid : null,
        durationMonths: months,
        proposedCrops: proposedCrops || '',
        message: message || '',
        status: 'pending',
        createdAt: new Date()
      };

      if (existingOfferIndex > -1) {
        // Update existing offer
        lease.offers[existingOfferIndex] = offerObj;
      } else {
        lease.offers.push(offerObj);
      }

      await lease.save();

      notifyLease(lease.ownerId, 'land_lease_offer', `🌾 नया पट्टा प्रस्ताव: ${offerObj.farmerName}`,
        `${offerObj.farmerName} ने "${lease.title}" पर प्रस्ताव भेजा है।`, lease._id);

      res.status(200).json({
        success: true,
        message: 'प्रस्ताव सफलतापूर्वक भेजा गया (Offer sent successfully to landowner)',
        data: offerObj
      });
    } catch (error) {
      console.error('Error negotiating lease:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 6. Accept Offer (Landowner accepts a specific tenant offer)
  acceptOffer: async (req, res) => {
    try {
      const { id } = req.params;
      const { offerId } = req.body;

      const lease = await LandLease.findOne({ _id: id, ownerId: req.user.id });
      if (!lease) {
        return res.status(404).json({
          success: false,
          message: 'भूमि नहीं मिली या आप इसके मालिक नहीं हैं (Land not found or unauthorized)'
        });
      }

      const offer = lease.offers.id(offerId);
      if (!offer) {
        return res.status(404).json({ success: false, message: 'प्रस्ताव नहीं मिला (Offer not found)' });
      }

      if (lease.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'यह भूमि पहले ही पट्टे पर दी जा चुकी है या उपलब्ध नहीं है (Land is not available for lease)'
        });
      }

      if (offer.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'यह प्रस्ताव अब लंबित नहीं है (Offer is no longer pending)'
        });
      }

      // Set offer status to accepted
      offer.status = 'accepted';

      // Reject all other pending offers (remember who, so only they get the notification)
      const newlyRejected = [];
      lease.offers.forEach(o => {
        if (String(o._id) !== String(offerId) && o.status === 'pending') {
          o.status = 'rejected';
          newlyRejected.push(o.farmerId);
        }
      });

      await applyAgreement(lease, offer);
      lease.status = 'leased';
      lease.currentTenantId = offer.farmerId;
      await lease.save();

      notifyLease(offer.farmerId, 'land_lease_offer_accepted', '✅ प्रस्ताव स्वीकार (Offer accepted)',
        `"${lease.title}" का पट्टा आपके नाम हो गया। किस्तें "भुगतान" में देखें।`, lease._id);
      newlyRejected.forEach(farmerId => {
        notifyLease(farmerId, 'land_lease_offer_rejected', 'प्रस्ताव अस्वीकार (Offer declined)',
          `"${lease.title}" किसी और किसान को दे दी गई।`, lease._id);
      });

      res.status(200).json({
        success: true,
        message: 'प्रस्ताव स्वीकार कर लिया गया व पट्टा पंजीकृत हुआ (Offer accepted & lease confirmed)',
        data: lease
      });
    } catch (error) {
      console.error('Error accepting offer:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 6b. Reject Offer (Landowner rejects a specific tenant offer)
  rejectOffer: async (req, res) => {
    try {
      const { id } = req.params;
      const { offerId } = req.body;

      const lease = await LandLease.findOne({ _id: id, ownerId: req.user.id });
      if (!lease) {
        return res.status(404).json({
          success: false,
          message: 'भूमि नहीं मिली या आप इसके मालिक नहीं हैं (Land not found or unauthorized)'
        });
      }

      const offer = offerId ? lease.offers.id(offerId) : null;
      if (!offer) {
        return res.status(404).json({ success: false, message: 'प्रस्ताव नहीं मिला (Offer not found)' });
      }

      if (offer.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'यह प्रस्ताव अब लंबित नहीं है (Offer is no longer pending)'
        });
      }

      offer.status = 'rejected';
      await lease.save();

      notifyLease(offer.farmerId, 'land_lease_offer_rejected', 'प्रस्ताव अस्वीकार (Offer declined)',
        `मालिक ने "${lease.title}" पर आपका प्रस्ताव अस्वीकार कर दिया।`, lease._id);

      res.status(200).json({
        success: true,
        message: 'प्रस्ताव अस्वीकार कर दिया गया (Offer rejected)',
        data: lease
      });
    } catch (error) {
      console.error('Error rejecting offer:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 7. Accept Lease Terms (Direct acceptance by tenant ID)
  acceptLeaseTerms: async (req, res) => {
    try {
      const { id } = req.params;
      const { tenantId } = req.body;

      const lease = await LandLease.findOne({ _id: id, ownerId: req.user.id });
      if (!lease) {
        return res.status(404).json({ success: false, message: 'Lease not found or you are not the owner' });
      }

      if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
        return res.status(400).json({ success: false, message: 'Valid tenant ID is required' });
      }

      if (lease.status !== 'active') {
        return res.status(400).json({ success: false, message: 'Land is not available for lease' });
      }

      const tenantOffer = lease.offers.find(
        o => String(o.farmerId) === String(tenantId) && o.status === 'pending'
      );
      if (!tenantOffer) {
        return res.status(400).json({ success: false, message: 'No pending offer from this tenant' });
      }

      await applyAgreement(lease, tenantOffer);
      tenantOffer.status = 'accepted';
      lease.offers.forEach(o => {
        if (o !== tenantOffer && o.status === 'pending') o.status = 'rejected';
      });

      lease.status = 'leased';
      lease.currentTenantId = tenantId;
      await lease.save();

      res.status(200).json({
        success: true,
        message: 'Lease terms accepted. Agreement generated.',
        data: lease
      });
    } catch (error) {
      console.error('Error accepting lease terms:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 7b. Payment summary (agreement, installments, settlements) - owner and tenant only
  getPayments: async (req, res) => {
    try {
      const me = String(req.user.id);
      const access = await LandLease.findById(req.params.id).select('ownerId currentTenantId').lean();
      if (!access) return res.status(404).json({ success: false, message: 'Land lease not found' });

      const isOwner = String(access.ownerId) === me;
      if (!isOwner && String(access.currentTenantId || '') !== me) {
        return res.status(403).json({ success: false, message: 'Not allowed' });
      }

      const lease = await LandLease.findById(req.params.id)
        .select('title leaseType sizeInAcres ownerId currentTenantId status agreement installments settlements')
        .populate('ownerId', 'name')
        .populate('currentTenantId', 'name')
        .lean();

      const sum = (arr, status) => arr.filter(i => i.status === status).reduce((t, i) => t + i.amount, 0);
      res.status(200).json({
        success: true,
        data: {
          ...lease,
          role: isOwner ? 'owner' : 'tenant',
          totals: {
            paid: sum(lease.installments, 'paid') + sum(lease.settlements, 'paid'),
            pendingRent: lease.installments.filter(i => i.status !== 'paid').reduce((t, i) => t + i.amount, 0)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching lease payments:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 7c. Tenant pays a monthly rent installment from the wallet
  payInstallment: async (req, res) => {
    try {
      const result = await payItem({
        leaseId: req.params.id, tenantId: req.user.id, kind: 'installment', itemId: req.params.itemId
      });
      if (!result.ok) {
        return res.status(result.code || 400).json({
          success: false,
          message: result.reason,
          insufficient: result.insufficient || false,
          balance: result.balance,
          required: result.required
        });
      }
      res.status(200).json({ success: true, message: 'किराया सफलतापूर्वक चुकाया गया (Rent paid successfully)', data: result.lease });
    } catch (error) {
      console.error('Error paying installment:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 7d. Crop-share: tenant submits the harvest value, the owner's share is calculated from the agreed %
  submitSettlement: async (req, res) => {
    try {
      const { cropName = '', harvestValue, note = '' } = req.body;
      const value = round2(harvestValue);

      if (!(value > 0)) {
        return res.status(400).json({ success: false, message: 'फसल का कुल मूल्य दर्ज करें (Enter the total harvest value)' });
      }

      const lease = await LandLease.findOne({ _id: req.params.id, currentTenantId: req.user.id, status: 'leased' });
      if (!lease) {
        return res.status(404).json({ success: false, message: 'Active lease not found for you' });
      }
      if (lease.leaseType !== 'crop-share') {
        return res.status(400).json({ success: false, message: 'Settlements are only for crop-share leases' });
      }
      if (lease.settlements.some(st => ['submitted', 'confirmed', 'processing'].includes(st.status))) {
        return res.status(409).json({
          success: false,
          message: 'पिछला हिसाब अभी लंबित है (Finish the open settlement first)'
        });
      }

      const share = lease.agreement?.agreedShare ?? lease.sharePercentage;
      const amount = round2((value * share) / 100);
      lease.settlements.push({
        cropName: String(cropName).trim(),
        harvestValue: value,
        sharePercentage: share,
        amount,
        ...commissionSplit(amount, lease.agreement?.commissionPercentage),
        note: String(note).trim(),
        status: 'submitted'
      });
      await lease.save();

      notifyLease(lease.ownerId, 'land_lease_settlement', '🌾 फसल हिसाब भेजा गया (Harvest settlement)',
        `"${lease.title}" पर आपके हिस्से ₹${amount} का हिसाब पुष्टि के लिए आया है।`, lease._id);

      res.status(201).json({
        success: true,
        message: 'हिसाब मालिक को भेजा गया (Settlement sent to the owner for confirmation)',
        data: lease.settlements[lease.settlements.length - 1]
      });
    } catch (error) {
      console.error('Error submitting settlement:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 7e. Owner confirms or rejects a submitted settlement
  reviewSettlement: (decision) => async (req, res) => {
    try {
      const lease = await LandLease.findOne({ _id: req.params.id, ownerId: req.user.id });
      if (!lease) {
        return res.status(404).json({ success: false, message: 'Land not found or unauthorized' });
      }

      const settlement = lease.settlements.id(req.params.itemId);
      if (!settlement) {
        return res.status(404).json({ success: false, message: 'Settlement not found' });
      }
      if (settlement.status !== 'submitted') {
        return res.status(400).json({ success: false, message: 'यह हिसाब अब लंबित नहीं है (Settlement is no longer awaiting review)' });
      }

      settlement.status = decision;
      await lease.save();

      notifyLease(lease.currentTenantId, 'land_lease_settlement',
        decision === 'confirmed' ? '✅ हिसाब स्वीकार (Settlement confirmed)' : 'हिसाब अस्वीकार (Settlement rejected)',
        decision === 'confirmed'
          ? `मालिक ने "${lease.title}" का ₹${settlement.amount} का हिसाब स्वीकार किया। अब भुगतान करें।`
          : `मालिक ने "${lease.title}" का हिसाब अस्वीकार किया। सही मूल्य के साथ दोबारा भेजें।`, lease._id);

      res.status(200).json({
        success: true,
        message: decision === 'confirmed'
          ? 'हिसाब स्वीकार किया गया, किसान अब भुगतान करेगा (Settlement confirmed)'
          : 'हिसाब अस्वीकार किया गया (Settlement rejected)',
        data: settlement
      });
    } catch (error) {
      console.error('Error reviewing settlement:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 7f. Tenant pays a confirmed settlement from the wallet
  paySettlement: async (req, res) => {
    try {
      const result = await payItem({
        leaseId: req.params.id, tenantId: req.user.id, kind: 'settlement', itemId: req.params.itemId
      });
      if (!result.ok) {
        return res.status(result.code || 400).json({
          success: false,
          message: result.reason,
          insufficient: result.insufficient || false,
          balance: result.balance,
          required: result.required
        });
      }
      res.status(200).json({ success: true, message: 'बटाई का हिस्सा चुकाया गया (Crop-share paid successfully)', data: result.lease });
    } catch (error) {
      console.error('Error paying settlement:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // 8. Delete / Withdraw Land Listing
  deleteLand: async (req, res) => {
    try {
      const { id } = req.params;
      const lease = await LandLease.findOne({ _id: id, ownerId: req.user.id });

      if (!lease) {
        return res.status(404).json({ success: false, message: 'Land not found or unauthorized' });
      }

      if (lease.status === 'leased' || lease.currentTenantId) {
        return res.status(400).json({
          success: false,
          message: 'सक्रिय पट्टे वाली भूमि को हटाया नहीं जा सकता (Cannot delete currently leased land)'
        });
      }

      await LandLease.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: 'भूमि सूची सफलतापूर्वक हटा दी गई (Land listing removed successfully)'
      });
    } catch (error) {
      console.error('Error deleting land:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

module.exports = farmerLandLeaseController;
