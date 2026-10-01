const VendorBill = require('../../models/VendorBill');
const Booking = require('../../models/Booking');
const { generateInvoicePDF } = require('../../utils/invoiceGenerator');

const Settings = require('../../models/Settings');
const { BILL_STATUS } = require('../../utils/constants');

/**
 * Create or Update Vendor Bill
 * ────────────────────────────
 * Revenue Model:
 *   Vendor → 70% of total service BASE (excl GST)
 *   Vendor → 10% of total parts BASE  (excl GST)
 *   GST   → 100% retained by company
 *
 * VendorBill is the SINGLE source of truth for earnings.
 * Booking does NOT store vendorEarnings/adminCommission.
 *
 * POST /api/vendors/bookings/:bookingId/bill
 */
const createOrUpdateBill = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { services, parts, customItems, transportCharges } = req.body;
    const vendorId = req.user.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.vendorId.toString() !== vendorId) {
      return res.status(403).json({ success: false, message: 'Not authorized for this booking' });
    }

    // ── Fetch Settings (frozen snapshot) ──
    const settings = await Settings.findOne({ type: 'global' });
    
    // Use the new bookingCommissionPercentage (default 10%), or fallback to 100 - servicePayoutPercentage
    const commissionPct = settings?.bookingCommissionPercentage ?? (100 - (settings?.servicePayoutPercentage ?? 90));
    const serviceSplitPct = 100 - commissionPct;
    const partsSplitPct = settings?.partsPayoutPercentage ?? 10;
    
    // Check if equipment/agri service (5% rental GST standard)
    const isAgriService = !!(booking.rental_type || booking.equipmentId || (booking.bookedItems && booking.bookedItems.length > 0));
    const serviceGstPct = isAgriService ? (settings?.rentalGstPercentage ?? 5) : (settings?.serviceGstPercentage ?? 18);
    const partsGstPct = settings?.partsGstPercentage ?? 18;

    // ═══════════════════════════════════════
    // 1. ORIGINAL SERVICE (from booking)
    // ═══════════════════════════════════════
    const isPlanBooking = booking.paymentMethod === 'plan_benefit';
    const originalServiceBaseForBill = isPlanBooking ? 0 : (booking.basePrice || 0);
    const originalServiceBaseForEarnings = booking.basePrice || 0;
    const originalGST = isPlanBooking 
      ? 0 
      : (booking.tax !== undefined && booking.tax !== null && Number(booking.tax) > 0 
          ? Number(booking.tax) 
          : parseFloat(((originalServiceBaseForBill * serviceGstPct) / 100).toFixed(2)));
    const visitingCharges = Number(booking.visitingCharges) || 0;

    // ═══════════════════════════════════════
    // 2. VENDOR-ADDED SERVICES
    // ═══════════════════════════════════════
    const processedServices = [];
    let vendorServiceBase = 0;
    let vendorServiceGST = 0;

    if (services && Array.isArray(services)) {
      for (const item of services) {
        const name = item.name;
        const unitBasePrice = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 1;

        const base = unitBasePrice * quantity;
        const gst = parseFloat(((base * serviceGstPct) / 100).toFixed(2));
        const totalInclusive = parseFloat((base + gst).toFixed(2));

        processedServices.push({
          catalogId: item.catalogId,
          name,
          price: unitBasePrice,
          gstPercentage: serviceGstPct,
          quantity,
          gstAmount: gst,
          total: totalInclusive,
          isOriginal: false
        });

        vendorServiceBase += base;
        vendorServiceGST += gst;
      }
    }

    // ═══════════════════════════════════════
    // 3. PARTS
    // ═══════════════════════════════════════
    const processedParts = [];
    let totalPartsBase = 0;
    let partsGST = 0;

    if (parts && Array.isArray(parts)) {
      for (const item of parts) {
        const name = item.name;
        const unitBasePrice = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 1;
        const pGstPct = Number(item.gstPercentage) || partsGstPct;

        const base = unitBasePrice * quantity;
        const gst = parseFloat(((base * pGstPct) / 100).toFixed(2));

        processedParts.push({
          catalogId: item.catalogId,
          name,
          price: unitBasePrice,
          gstPercentage: pGstPct,
          quantity,
          gstAmount: gst,
          total: parseFloat((base + gst).toFixed(2))
        });

        totalPartsBase += base;
        partsGST += gst;
      }
    }

    // ═══════════════════════════════════════
    // 3.5 CUSTOM ITEMS (treated as Parts for revenue logic)
    // ═══════════════════════════════════════
    const processedCustomItems = []; // To store in bill

    if (customItems && Array.isArray(customItems)) {
      for (const item of customItems) {
        const name = item.name || 'Custom Item';
        const unitBasePrice = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 1;
        // Default custom items to parts GST % if not provided (usually from settings)
        const cGstPct = Number(item.gstPercentage) || partsGstPct;

        const base = unitBasePrice * quantity;
        const gst = parseFloat(((base * cGstPct) / 100).toFixed(2));

        processedCustomItems.push({
          name,
          price: unitBasePrice,
          gstPercentage: cGstPct,
          quantity,
          gstAmount: gst,
          total: parseFloat((base + gst).toFixed(2))
        });

        // Add to PARTS totals
        totalPartsBase += base;
        partsGST += gst;
      }
    }

    // ═══════════════════════════════════════
    // 4. AGGREGATION
    // ═══════════════════════════════════════
    const totalServiceBaseForBill = parseFloat((originalServiceBaseForBill + vendorServiceBase).toFixed(2));
    const totalServiceBaseForEarnings = parseFloat((originalServiceBaseForEarnings + vendorServiceBase).toFixed(2));
    totalPartsBase = parseFloat(totalPartsBase.toFixed(2));

    const totalGST = parseFloat((originalGST + vendorServiceGST + partsGST).toFixed(2));
    const finalTransportCharges = Number(transportCharges) || 0;
    const grandTotal = parseFloat((totalServiceBaseForBill + totalPartsBase + totalGST + visitingCharges + finalTransportCharges).toFixed(2));

    // ═══════════════════════════════════════
    // 5. REVENUE SPLIT (% applied on BASE only)
    // ═══════════════════════════════════════
    const vendorServiceEarning = parseFloat(((totalServiceBaseForEarnings * serviceSplitPct) / 100).toFixed(2));
    const vendorPartsEarning = parseFloat(((totalPartsBase * partsSplitPct) / 100).toFixed(2));
    const vendorTotalEarning = parseFloat((vendorServiceEarning + vendorPartsEarning).toFixed(2));
    const companyRevenue = parseFloat((grandTotal - vendorTotalEarning).toFixed(2));

    // ═══════════════════════════════════════
    // 6. ALL SERVICES (original + vendor-added)
    // ═══════════════════════════════════════
    const allServices = [
      {
        name: booking.serviceName || 'Original Service',
        price: originalServiceBaseForBill,
        gstPercentage: (booking.tax && originalServiceBaseForBill > 0) ? Math.round((Number(booking.tax) / originalServiceBaseForBill) * 100) : serviceGstPct,
        quantity: 1,
        gstAmount: originalGST,
        total: parseFloat((originalServiceBaseForBill + originalGST).toFixed(2)),
        isOriginal: true
      },
      ...processedServices
    ];

    // ═══════════════════════════════════════
    // 7. SAVE BILL
    // ═══════════════════════════════════════
    let bill = await VendorBill.findOne({ bookingId });

    const billData = {
      vendorId,
      services: allServices,
      parts: processedParts,
      customItems: processedCustomItems,
      originalServiceBase: originalServiceBaseForBill,
      vendorServiceBase: parseFloat(vendorServiceBase.toFixed(2)),
      totalServiceBase: totalServiceBaseForBill,
      totalPartsBase,
      originalGST,
      vendorServiceGST: parseFloat(vendorServiceGST.toFixed(2)),
      partsGST: parseFloat(partsGST.toFixed(2)),
      totalGST,
      visitingCharges,
      transportCharges: finalTransportCharges,
      grandTotal,
      payoutConfig: {
        serviceSplitPercentage: serviceSplitPct,
        partsSplitPercentage: partsSplitPct,
        serviceGstPercentage: serviceGstPct,
        partsGstPercentage: partsGstPct
      },
      vendorServiceEarning,
      vendorPartsEarning,
      vendorTotalEarning,
      companyRevenue,
      status: BILL_STATUS.GENERATED,
      generatedAt: new Date()
    };

    if (bill) {
      Object.assign(bill, billData);
      await bill.save();
    } else {
      bill = await VendorBill.create({ bookingId, ...billData });
    }

    // ═══════════════════════════════════════
    // 8. UPDATE BOOKING (no earnings!)
    // ═══════════════════════════════════════
    booking.finalAmount = grandTotal;
    booking.userPayableAmount = grandTotal;
    booking.vendorBillId = bill._id;
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Bill generated successfully',
      bill,
      financials: {
        grandTotal,
        vendorTotalEarning,
        companyRevenue,
        breakdown: {
          serviceBase: totalServiceBaseForBill,
          partsBase: totalPartsBase,
          totalGST
        }
      }
    });

  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate bill' });
  }
};

/**
 * Get Bill by Booking ID
 * GET /api/vendors/bookings/:bookingId/bill
 */
const getBillByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const bill = await VendorBill.findOne({ bookingId });

    if (!bill) {
      // Return 200 instead of 404 to gracefully tell the frontend that a bill is not yet created
      // This prevents Ugly `404 (Not Found)` network errors in the console from Axios on page load
      return res.status(200).json({ success: true, bill: null, message: 'Bill not found' });
    }

    res.status(200).json({ success: true, bill });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch bill' });
  }
};

/**
 * Download Invoice as PDF
 * GET /api/vendors/bookings/:bookingId/bill/download
 */
const downloadInvoice = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const bill = await VendorBill.findOne({ bookingId });
    const booking = await Booking.findById(bookingId).populate('userId');

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Invoice not generated yet' });
    }

    const fileName = `Invoice_${booking.bookingNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    generateInvoicePDF(bill, booking, res);
  } catch (error) {
    console.error('Download invoice error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
};

module.exports = {
  createOrUpdateBill,
  getBillByBookingId,
  downloadInvoice
};
