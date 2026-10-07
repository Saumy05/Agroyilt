const Settings = require('../../models/Settings');
const Vendor = require('../../models/Vendor');

// Get Global Settings
exports.getSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne({ type: 'global' });

    // If no settings exist yet, create default
    if (!settings) {
      settings = await Settings.create({ type: 'global' });
    }

    res.status(200).json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

// Update Global Settings
exports.updateSettings = async (req, res, next) => {
  try {
    const {
      visitedCharges,
      serviceGstPercentage,
      partsGstPercentage,
      servicePayoutPercentage,
      partsPayoutPercentage,
      // Agriculture / Machine Renting Specific
      rentalGstPercentage,
      rentalPayoutPercentage,
      tdsPercentage,
      platformFeePercentage,
      vendorCashLimit,
      cancellationPenalty,
      bookingCommissionPercentage,
      razorpayKeyId,
      razorpayKeySecret,
      razorpayWebhookSecret,
      cloudinaryCloudName,
      cloudinaryApiKey,
      cloudinaryApiSecret,
      // Billing Settings
      companyName, companyGSTIN, companyPAN, companyAddress, companyCity, companyState, companyPincode, companyPhone, companyEmail, invoicePrefix, sacCode,
      // Support Settings
      supportEmail, supportPhone, supportWhatsapp,
      // Branding Settings
      appName, appTagline, appLogo, appFavicon,
      // Worker Hiring & Commission Rules
      workerCommissionPercentage,
      workerPlatformChargePercentage,
      maxIndependentWorkerRequest,
      workerSearchRadiusKm,
      workerAlertTimeoutSeconds,
      // Worker Late Arrival Penalty & Extension Settings
      workerPenaltyEnabled,
      workerPenaltyType,
      workerPenaltyAmount,
      workerPenaltyPerMinute,
      workerPenaltyFreeMinutes,
      workerPenaltyMaxAmount,
      workerPenaltyPercentage,
      extensionExpiryMinutes,
      // Worker dues & cash
      maxWorkerDues,
      workerCashPaymentEnabled,
      workerJourneyWindowMinutes,
      workerEarlyStartMinutes,
      // Support desk
      supportMaxOpenClaims,
      // Withdrawal settings
      minWithdrawalAmount,
      minWithdrawalAmountPaise
    } = req.body;

    let settings = await Settings.findOne({ type: 'global' });

    if (!settings) {
      settings = await Settings.create({
        type: 'global',
        visitedCharges,
        serviceGstPercentage,
        partsGstPercentage,
        servicePayoutPercentage,
        partsPayoutPercentage,
        tdsPercentage,
        platformFeePercentage,
        vendorCashLimit, // Add this
        cancellationPenalty,
        bookingCommissionPercentage,
        razorpayKeyId,
        razorpayKeySecret,
        razorpayWebhookSecret,
        cloudinaryCloudName,
        cloudinaryApiKey,
        cloudinaryApiSecret,
        appName, appTagline, appLogo, appFavicon
      });
    } else {
      // Update fields if provided
      if (visitedCharges !== undefined) settings.visitedCharges = visitedCharges;
      if (serviceGstPercentage !== undefined) settings.serviceGstPercentage = serviceGstPercentage;
      if (partsGstPercentage !== undefined) settings.partsGstPercentage = partsGstPercentage;
      if (servicePayoutPercentage !== undefined) settings.servicePayoutPercentage = servicePayoutPercentage;
      if (partsPayoutPercentage !== undefined) settings.partsPayoutPercentage = partsPayoutPercentage;
      // Agriculture Renting
      if (rentalGstPercentage !== undefined) settings.rentalGstPercentage = rentalGstPercentage;
      if (rentalPayoutPercentage !== undefined) settings.rentalPayoutPercentage = rentalPayoutPercentage;
      if (tdsPercentage !== undefined) settings.tdsPercentage = tdsPercentage;
      if (platformFeePercentage !== undefined) settings.platformFeePercentage = platformFeePercentage;
      if (vendorCashLimit !== undefined) settings.vendorCashLimit = vendorCashLimit; // Add this
      if (cancellationPenalty !== undefined) settings.cancellationPenalty = cancellationPenalty;
      // Vendor Commission drives every vendor payout (utils/vendorPayout)
      if (bookingCommissionPercentage !== undefined) {
        const val = Number(bookingCommissionPercentage);
        if (isNaN(val) || val < 0 || val > 100) {
          return res.status(400).json({ success: false, message: 'Vendor commission must be between 0 and 100.' });
        }
        settings.bookingCommissionPercentage = val;
      }
      if (razorpayKeyId !== undefined) settings.razorpayKeyId = razorpayKeyId;
      if (razorpayKeySecret !== undefined) settings.razorpayKeySecret = razorpayKeySecret;
      if (razorpayWebhookSecret !== undefined) settings.razorpayWebhookSecret = razorpayWebhookSecret;
      if (cloudinaryCloudName !== undefined) settings.cloudinaryCloudName = cloudinaryCloudName;
      if (cloudinaryApiKey !== undefined) settings.cloudinaryApiKey = cloudinaryApiKey;
      if (cloudinaryApiSecret !== undefined) settings.cloudinaryApiSecret = cloudinaryApiSecret;

      // Billing update
      if (companyName !== undefined) settings.companyName = companyName;
      if (companyGSTIN !== undefined) settings.companyGSTIN = companyGSTIN;
      if (companyPAN !== undefined) settings.companyPAN = companyPAN;
      if (companyAddress !== undefined) settings.companyAddress = companyAddress;
      if (companyCity !== undefined) settings.companyCity = companyCity;
      if (companyState !== undefined) settings.companyState = companyState;
      if (companyPincode !== undefined) settings.companyPincode = companyPincode;
      if (companyPhone !== undefined) settings.companyPhone = companyPhone;
      if (companyEmail !== undefined) settings.companyEmail = companyEmail;
      if (invoicePrefix !== undefined) settings.invoicePrefix = invoicePrefix;
      if (sacCode !== undefined) settings.sacCode = sacCode;

      // Support update
      if (supportEmail !== undefined) settings.supportEmail = supportEmail;
      if (supportPhone !== undefined) settings.supportPhone = supportPhone;
      if (supportWhatsapp !== undefined) settings.supportWhatsapp = supportWhatsapp;

      // Branding update
      if (appName !== undefined && typeof appName === 'string' && appName.trim()) {
        settings.appName = appName.trim();
      }
      if (appTagline !== undefined && typeof appTagline === 'string') {
        settings.appTagline = appTagline.trim();
      }
      if (appLogo !== undefined && typeof appLogo === 'string' && appLogo.trim()) {
        settings.appLogo = appLogo.trim();
      }
      if (appFavicon !== undefined && typeof appFavicon === 'string' && appFavicon.trim()) {
        settings.appFavicon = appFavicon.trim();
      }

      // Worker Hiring & Commission Rules
      if (workerCommissionPercentage !== undefined) {
        const val = Number(workerCommissionPercentage);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          settings.workerCommissionPercentage = val;
        }
      }
      if (workerPlatformChargePercentage !== undefined) {
        const val = Number(workerPlatformChargePercentage);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          settings.workerPlatformChargePercentage = val;
        }
      }
      if (maxIndependentWorkerRequest !== undefined) {
        const val = parseInt(maxIndependentWorkerRequest, 10);
        if (isNaN(val) || val < 1) {
          return res.status(400).json({ success: false, message: 'maxIndependentWorkerRequest must be a positive integer >= 1' });
        }
        settings.maxIndependentWorkerRequest = val;
      }
      if (workerSearchRadiusKm !== undefined) {
        const val = Number(workerSearchRadiusKm);
        if (isNaN(val) || val < 1) {
          return res.status(400).json({ success: false, message: 'workerSearchRadiusKm must be a positive number >= 1' });
        }
        settings.workerSearchRadiusKm = val;
      }
      if (workerAlertTimeoutSeconds !== undefined) {
        const val = parseInt(workerAlertTimeoutSeconds, 10);
        if (isNaN(val) || val < 10 || val > 300) {
          return res.status(400).json({ success: false, message: 'workerAlertTimeoutSeconds must be between 10 and 300 seconds.' });
        }
        settings.workerAlertTimeoutSeconds = val;
      }

      // Worker Late Arrival Penalty & Extension Settings
      if (workerPenaltyEnabled !== undefined) settings.workerPenaltyEnabled = Boolean(workerPenaltyEnabled);
      if (workerPenaltyType !== undefined) settings.workerPenaltyType = workerPenaltyType;
      if (workerPenaltyAmount !== undefined) settings.workerPenaltyAmount = Math.max(0, Number(workerPenaltyAmount) || 0);
      if (workerPenaltyPerMinute !== undefined) settings.workerPenaltyPerMinute = Math.max(0, Number(workerPenaltyPerMinute) || 0);
      if (workerPenaltyFreeMinutes !== undefined) settings.workerPenaltyFreeMinutes = Math.max(0, Number(workerPenaltyFreeMinutes) || 0);
      if (workerPenaltyMaxAmount !== undefined) settings.workerPenaltyMaxAmount = Math.max(0, Number(workerPenaltyMaxAmount) || 0);
      if (workerPenaltyPercentage !== undefined) settings.workerPenaltyPercentage = Math.min(100, Math.max(0, Number(workerPenaltyPercentage) || 0));
      if (extensionExpiryMinutes !== undefined) settings.extensionExpiryMinutes = Math.max(1, Number(extensionExpiryMinutes) || 30);
      // Dues above this block a worker from new jobs (see services/workerDuesService.syncDuesRestriction)
      if (maxWorkerDues !== undefined) settings.maxWorkerDues = Math.max(0, Number(maxWorkerDues) || 0);
      if (workerCashPaymentEnabled !== undefined) settings.workerCashPaymentEnabled = Boolean(workerCashPaymentEnabled);
      // How long before the booked start a worker may Start Journey / enter the Start OTP (services/workerScheduleService)
      if (workerJourneyWindowMinutes !== undefined) settings.workerJourneyWindowMinutes = Math.min(1440, Math.max(0, Number(workerJourneyWindowMinutes) || 0));
      if (workerEarlyStartMinutes !== undefined) settings.workerEarlyStartMinutes = Math.min(1440, Math.max(0, Number(workerEarlyStartMinutes) || 0));
      // Open tickets one support agent may hold (services/supportClaimService)
      if (supportMaxOpenClaims !== undefined) settings.supportMaxOpenClaims = Math.min(50, Math.max(1, Math.floor(Number(supportMaxOpenClaims)) || 5));

      // Minimum withdrawal limit configuration
      if (minWithdrawalAmount !== undefined) {
        const val = Number(minWithdrawalAmount);
        if (!isNaN(val) && val >= 1) {
          settings.minWithdrawalAmountPaise = Math.round(val * 100);
        }
      }
      if (minWithdrawalAmountPaise !== undefined) {
        const val = Number(minWithdrawalAmountPaise);
        if (!isNaN(val) && val >= 100) {
          settings.minWithdrawalAmountPaise = Math.round(val);
        }
      }

      await settings.save();

      // A new dues limit applies to every worker now, not only at their next dues change
      if (maxWorkerDues !== undefined) {
        const Worker = require('../../models/Worker');
        const max = settings.maxWorkerDues;
        await Worker.updateMany(
          { outstandingDues: { $gt: max }, isRestricted: { $ne: true } },
          { $set: { isRestricted: true, restrictionReason: `Outstanding dues exceeded allowed limit (₹${max})` } }
        );
        await Worker.updateMany(
          { isRestricted: true, outstandingDues: { $lte: max }, $or: [{ restrictionReason: null }, { restrictionReason: /^Outstanding dues/ }] },
          { $set: { isRestricted: false, restrictionReason: null } }
        );
      }

      // Emit real-time branding update via Socket.io ONLY AFTER database save succeeds
      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('branding:updated', {
            appName: settings.appName,
            appTagline: settings.appTagline,
            appLogo: settings.appLogo,
            appFavicon: settings.appFavicon
          });
        }
      } catch (socketErr) {
        console.error('[SETTINGS] Error emitting branding:updated socket event:', socketErr);
      }
    }

    // Propagate vendorCashLimit to all existing vendors if it was changed
    if (vendorCashLimit !== undefined) {
      console.log(`Updating all vendors with new cash limit: ${vendorCashLimit}`);
      await Vendor.updateMany(
        {}, // Filter: all vendors
        { $set: { 'wallet.cashLimit': vendorCashLimit } }
      );
    }

    res.status(200).json({
      success: true,
      message: 'System settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};
// Get Public Settings (Visited Charges, GST, Branding)
exports.getPublicSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne({ type: 'global' }).select('visitedCharges serviceGstPercentage partsGstPercentage rentalGstPercentage supportEmail supportPhone supportWhatsapp cancellationPenalty bookingCommissionPercentage appName appTagline appLogo appFavicon workerAlertTimeoutSeconds');

    // Default if not found (fallback values)
    if (!settings) {
      settings = { visitedCharges: 29, serviceGstPercentage: 18, partsGstPercentage: 18, rentalGstPercentage: 5, appName: 'AgroYilt', appLogo: '/AgroyiltLogo.png', appFavicon: '/AgroyiltLogo.png', workerAlertTimeoutSeconds: 60 };
    }

    res.status(200).json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error fetching public settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

// GET /api/public/logo - Dynamic Public Logo Endpoint
// Resolves to the current admin-configured logo from MongoDB Settings.appLogo
exports.getPublicLogo = async (req, res) => {
  try {
    const settings = await Settings.findOne({ type: 'global' }).select('appLogo');
    let logoUrl = settings?.appLogo?.trim();

    if (!logoUrl) {
      logoUrl = '/AgroyiltLogo.png';
    }

    // Cache control: allow caching for short time (60s), allow CDN/stale-while-revalidate, NEVER immutable
    res.set({
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      'Pragma': 'public'
    });

    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return res.redirect(302, logoUrl);
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'https://agroyilt.com').replace(/\/$/, '');
    const cleanPath = logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`;
    return res.redirect(302, `${frontendUrl}${cleanPath}`);
  } catch (error) {
    console.error('[SETTINGS] Error resolving public logo:', error);
    res.set({
      'Cache-Control': 'public, max-age=60',
      'Pragma': 'public'
    });
    return res.redirect(302, 'https://agroyilt.com/AgroyiltLogo.png');
  }
};

// GET /api/public/favicon - Dynamic Public Favicon Endpoint
// Priority: Settings.appFavicon > Settings.appLogo > default AgroYilt logo
exports.getPublicFavicon = async (req, res) => {
  try {
    const settings = await Settings.findOne({ type: 'global' }).select('appFavicon appLogo');
    let favUrl = settings?.appFavicon?.trim() || settings?.appLogo?.trim() || '/AgroyiltLogo.png';

    res.set({
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      'Pragma': 'public'
    });

    if (favUrl.startsWith('http://') || favUrl.startsWith('https://')) {
      return res.redirect(302, favUrl);
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'https://agroyilt.com').replace(/\/$/, '');
    const cleanPath = favUrl.startsWith('/') ? favUrl : `/${favUrl}`;
    return res.redirect(302, `${frontendUrl}${cleanPath}`);
  } catch (error) {
    console.error('[SETTINGS] Error resolving public favicon:', error);
    res.set({
      'Cache-Control': 'public, max-age=60',
      'Pragma': 'public'
    });
    return res.redirect(302, 'https://agroyilt.com/AgroyiltLogo.png');
  }
};

