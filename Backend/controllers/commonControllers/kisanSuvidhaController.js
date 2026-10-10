const MandiPrice = require('../../models/MandiPrice');
const GovtScheme = require('../../models/GovtScheme');

// Default initial seed data (aligns with current UI)
const defaultMandiPrices = [
  { commodity: 'गेहूं (Wheat)', commodityEnglish: 'Wheat', market: 'करनाल APMC', state: 'हरियाणा', modalPrice: 2275, minPrice: 2200, maxPrice: 2320, change: '+₹25', isUp: true, quality: 'मिल क्वालिटी', order: 1 },
  { commodity: 'सरसों (Mustard)', commodityEnglish: 'Mustard', market: 'हिसार APMC', state: 'हरियाणा', modalPrice: 5450, minPrice: 5300, maxPrice: 5600, change: '+₹60', isUp: true, quality: '42% तेल', order: 2 },
  { commodity: 'धान 1121 (Basmati)', commodityEnglish: 'Paddy Basmati', market: 'कैथल APMC', state: 'हरियाणा', modalPrice: 3650, minPrice: 3500, maxPrice: 3800, change: '+₹40', isUp: true, quality: 'सुपर', order: 3 },
  { commodity: 'सोयाबीन (Soybean)', commodityEnglish: 'Soybean', market: 'इंदौर APMC', state: 'मध्य प्रदेश', modalPrice: 4650, minPrice: 4500, maxPrice: 4750, change: '-₹15', isUp: false, quality: 'पीला दाना', order: 4 },
  { commodity: 'कपास / नरमा (Cotton)', commodityEnglish: 'Cotton', market: 'सिरसा APMC', state: 'हरियाणा', modalPrice: 7100, minPrice: 6900, maxPrice: 7300, change: '+₹80', isUp: true, quality: 'मीडियम स्टेपल', order: 5 },
  { commodity: 'मक्का (Maize)', commodityEnglish: 'Maize', market: 'दाहोद APMC', state: 'गुजरात', modalPrice: 2090, minPrice: 2000, maxPrice: 2150, change: '+₹20', isUp: true, quality: 'हाइब्रिड', order: 6 },
  { commodity: 'चना (Gram)', commodityEnglish: 'Gram / Chana', market: 'जयपुर APMC', state: 'राजस्थान', modalPrice: 5850, minPrice: 5700, maxPrice: 6000, change: '+₹50', isUp: true, quality: 'देसी चना', order: 7 },
  { commodity: 'मूंग (Green Gram)', commodityEnglish: 'Moong', market: 'बीकानेर APMC', state: 'राजस्थान', modalPrice: 7900, minPrice: 7600, maxPrice: 8100, change: '+₹30', isUp: true, quality: 'चमकदार', order: 8 }
];

const defaultGovtSchemes = [
  {
    title: 'SMAM कृषि यंत्रीकरण योजना',
    tag: '40% - 50% सब्सिडी',
    category: 'उपकरण व मशीनरी',
    summary: 'ट्रैक्टर, कटर, रोटावेटर एवं लेजर लेवलर पर 40% से 50% सरकारी अनुदान।',
    eligibility: 'सभी लघु एवं सीमांत किसान, महिला कृषक एवं FPO समूह।',
    docs: ['आधार कार्ड', 'जमीन की फर्द (खसरा/खतौनी)', 'बैंक पासबुक', 'जाति प्रमाण पत्र (यदि लागू हो)'],
    portalUrl: 'https://agrimachinery.nic.in',
    portalName: 'agrimachinery.nic.in',
    order: 1
  },
  {
    title: 'किसान ड्रोन सब्सिडी योजना',
    tag: '₹5 लाख तक सहायता',
    category: 'ड्रोन तकनीक',
    summary: 'कृषि में कीटनाशक व नैनो यूरिया छिड़काव हेतु ड्रोन खरीद पर FPO/कस्टम हायरिंग केंद्रों को वित्तीय सहायता।',
    eligibility: 'पंजीकृत FPO, Custom Hiring Centres एवं प्रगतिशील किसान।',
    docs: ['FPO पंजीकरण प्रमाण', 'PAN कार्ड', 'बैंक खाता विवरण', 'ड्रोन पायलट प्रशिक्षण पत्र'],
    portalUrl: 'https://agricoop.nic.in',
    portalName: 'agricoop.nic.in',
    order: 2
  },
  {
    title: 'PM-किसान सम्मान निधि',
    tag: '₹6,000 / वर्ष',
    category: 'वित्तीय सहायता',
    summary: 'प्रत्येक 4 माह में ₹2,000 की 3 किस्तों में सीधे बैंक खाते (DBT) में अंतरण।',
    eligibility: 'खेती योग्य भूमि रखने वाले सभी पात्र किसान परिवार।',
    docs: ['आधार कार्ड (e-KYC सत्यापित)', 'बैंक खाता आधार लिंक', 'जमीन का भूलेख रिकॉर्ड'],
    portalUrl: 'https://pmkisan.gov.in',
    portalName: 'pmkisan.gov.in',
    order: 3
  },
  {
    title: 'PM कृषि सिंचाई योजना (PMKSY)',
    tag: '55% तक अनुदान',
    category: 'ड्रिप व स्प्रिंकलर',
    summary: 'खेतों में पानी बचाने हेतु ड्रिप एवं मिनी स्प्रिंकलर लगाने पर 45% से 55% का अनुदान।',
    eligibility: 'सिंचाई सुविधा वाले किसान जिनके पास कम से कम 0.5 एकड़ जमीन हो।',
    docs: ['बिजली कनेक्शन / बोरवेल रिकॉर्ड', 'आधार कार्ड', 'जमीन का नक्शा', 'बैंक पासबुक'],
    portalUrl: 'https://pmksy.gov.in',
    portalName: 'pmksy.gov.in',
    order: 4
  },
  {
    title: 'प्रधानमंत्री फसल बीमा योजना (PMFBY)',
    tag: 'सुरक्षित फसल गारंटी',
    category: 'फसल बीमा',
    summary: 'प्राकृतिक आपदाओं, कीटों व रोगों से फसल नुकसान होने पर न्यूनतम प्रीमियम पर संपूर्ण क्षतिपूर्ति।',
    eligibility: 'अधिसूचित क्षेत्रों में अधिसूचित फसल उगाने वाले सभी किसान।',
    docs: ['बुवाई प्रमाण पत्र', 'भूमि कब्जा प्रमाण पत्र / LPC', 'आधार कार्ड', 'बैंक पासबुक'],
    portalUrl: 'https://pmfby.gov.in',
    portalName: 'pmfby.gov.in',
    order: 5
  }
];

// Helper to auto-seed if collection is empty
const ensureInitialData = async () => {
  try {
    const mandiCount = await MandiPrice.countDocuments();
    if (mandiCount === 0) {
      await MandiPrice.insertMany(defaultMandiPrices);
    }

    const schemeCount = await GovtScheme.countDocuments();
    if (schemeCount === 0) {
      await GovtScheme.insertMany(defaultGovtSchemes);
    }
  } catch (err) {
    console.error('Error ensuring Kisan Suvidha initial data:', err);
  }
};

/**
 * Public: Get Kisan Suvidha Data (Both Mandi Prices & Schemes)
 */
exports.getPublicKisanSuvidhaData = async (req, res) => {
  try {
    await ensureInitialData();

    const [mandiPrices, schemes] = await Promise.all([
      MandiPrice.find({ isActive: true }).sort({ order: 1, updatedAt: -1 }),
      GovtScheme.find({ isActive: true }).sort({ order: 1, createdAt: 1 })
    ]);

    res.status(200).json({
      success: true,
      data: {
        mandiPrices: mandiPrices.length > 0 ? mandiPrices : defaultMandiPrices,
        schemes: schemes.length > 0 ? schemes : defaultGovtSchemes,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching Kisan Suvidha public data:', error);
    // Graceful fallback to default in-memory data
    res.status(200).json({
      success: true,
      data: {
        mandiPrices: defaultMandiPrices,
        schemes: defaultGovtSchemes,
        lastUpdated: new Date()
      }
    });
  }
};

/**
 * Admin: Get all data including inactive records
 */
exports.getAdminKisanSuvidhaData = async (req, res) => {
  try {
    await ensureInitialData();

    const [mandiPrices, schemes] = await Promise.all([
      MandiPrice.find().sort({ order: 1, updatedAt: -1 }),
      GovtScheme.find().sort({ order: 1, createdAt: 1 })
    ]);

    res.status(200).json({
      success: true,
      mandiPrices,
      schemes
    });
  } catch (error) {
    console.error('Admin get Kisan Suvidha error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Kisan Suvidha data'
    });
  }
};

/**
 * Admin: Mandi Price Operations
 */
exports.createMandiPrice = async (req, res) => {
  try {
    const {
      commodity,
      commodityEnglish,
      market,
      state,
      district,
      modalPrice,
      minPrice,
      maxPrice,
      priceUnit,
      change,
      isUp,
      quality,
      isActive,
      order
    } = req.body;

    if (!commodity || !market || !modalPrice) {
      return res.status(400).json({
        success: false,
        message: 'Commodity, Market and Modal Price are required'
      });
    }

    const newPrice = new MandiPrice({
      commodity,
      commodityEnglish: commodityEnglish || '',
      market,
      state: state || 'Haryana',
      district: district || '',
      modalPrice: Number(modalPrice),
      minPrice: minPrice ? Number(minPrice) : 0,
      maxPrice: maxPrice ? Number(maxPrice) : 0,
      priceUnit: priceUnit || 'क्विं.',
      change: change || '+₹0',
      isUp: isUp !== undefined ? Boolean(isUp) : true,
      quality: quality || 'सामान्य',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      order: order ? Number(order) : 0
    });

    await newPrice.save();

    res.status(201).json({
      success: true,
      message: 'Mandi price record created successfully',
      mandiPrice: newPrice
    });
  } catch (error) {
    console.error('Create mandi price error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMandiPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await MandiPrice.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Mandi price updated successfully',
      mandiPrice: updated
    });
  } catch (error) {
    console.error('Update mandi price error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMandiPrice = async (req, res) => {
  try {
    const { id } = req.params;
    await MandiPrice.findByIdAndDelete(id);
    res.status(200).json({
      success: true,
      message: 'Mandi price deleted successfully'
    });
  } catch (error) {
    console.error('Delete mandi price error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Admin: Govt Scheme Operations
 */
exports.createGovtScheme = async (req, res) => {
  try {
    const {
      title,
      tag,
      category,
      summary,
      eligibility,
      docs,
      portalUrl,
      portalName,
      isActive,
      order
    } = req.body;

    if (!title || !summary) {
      return res.status(400).json({
        success: false,
        message: 'Title and Summary are required'
      });
    }

    const newScheme = new GovtScheme({
      title,
      tag: tag || 'सरकारी अनुदान',
      category: category || 'कृषि योजना',
      summary,
      eligibility: eligibility || '',
      docs: Array.isArray(docs) ? docs : (docs ? docs.split(',').map(s => s.trim()) : []),
      portalUrl: portalUrl || '',
      portalName: portalName || '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      order: order ? Number(order) : 0
    });

    await newScheme.save();

    res.status(201).json({
      success: true,
      message: 'Government scheme added successfully',
      scheme: newScheme
    });
  } catch (error) {
    console.error('Create govt scheme error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateGovtScheme = async (req, res) => {
  try {
    const { id } = req.params;
    const body = { ...req.body };
    if (typeof body.docs === 'string') {
      body.docs = body.docs.split(',').map(s => s.trim()).filter(Boolean);
    }

    const updated = await GovtScheme.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Government scheme updated successfully',
      scheme: updated
    });
  } catch (error) {
    console.error('Update govt scheme error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteGovtScheme = async (req, res) => {
  try {
    const { id } = req.params;
    await GovtScheme.findByIdAndDelete(id);
    res.status(200).json({
      success: true,
      message: 'Scheme deleted successfully'
    });
  } catch (error) {
    console.error('Delete govt scheme error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Admin: Seed or Reset Defaults
 */
exports.resetKisanSuvidhaDefaults = async (req, res) => {
  try {
    await MandiPrice.deleteMany({});
    await GovtScheme.deleteMany({});

    const seededMandi = await MandiPrice.insertMany(defaultMandiPrices);
    const seededSchemes = await GovtScheme.insertMany(defaultGovtSchemes);

    res.status(200).json({
      success: true,
      message: 'Reset and restored official default Kisan Suvidha data',
      mandiPrices: seededMandi,
      schemes: seededSchemes
    });
  } catch (error) {
    console.error('Reset Kisan Suvidha error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
