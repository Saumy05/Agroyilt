const mongoose = require('mongoose');
const LandLease = require('../../models/LandLease');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const paidTotals = (lease) => {
  let collected = 0;
  let commission = 0;       // commission from paid installments only
  let totalCommission = 0; // commission across ALL active installments (expected)
  let pending = 0;
  [...(lease.installments || []), ...(lease.settlements || [])].forEach((i) => {
    if (i.status === 'paid') {
      collected += i.amount;
      commission += i.commission || 0;
    } else if (!['rejected', 'submitted'].includes(i.status)) {
      pending += i.amount;
    }
    // Accumulate expected commission for every non-rejected installment
    if (!['rejected'].includes(i.status)) {
      totalCommission += i.commission || 0;
    }
  });
  const r = (n) => Math.round(n * 100) / 100;
  return { collected: r(collected), commission: r(commission), totalCommission: r(totalCommission), pending: r(pending) };
};

const adminLandLeaseController = {
  // GET /api/admin/land-leases?status=&leaseType=&search=&page=&limit=
  list: async (req, res) => {
    try {
      const { status, leaseType, search, page = 1, limit = 20 } = req.query;
      const filter = {};
      if (['active', 'leased', 'inactive', 'pending_verification'].includes(status)) filter.status = status;
      if (['fixed-rent', 'crop-share'].includes(leaseType)) filter.leaseType = leaseType;
      if (search && search.trim()) {
        const regex = new RegExp(escapeRegex(search.trim()), 'i');
        filter.$or = [
          { title: regex },
          { khasraNumber: regex },
          { 'location.village': regex },
          { 'location.tehsil': regex },
          { 'location.city': regex },
          { 'location.district': regex }
        ];
      }

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

      const [rows, total] = await Promise.all([
        LandLease.find(filter)
          .select('title khasraNumber sizeInAcres leaseType status location ownerId currentTenantId agreement installments settlements offers createdAt')
          .populate('ownerId', 'name phone')
          .populate('currentTenantId', 'name phone')
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        LandLease.countDocuments(filter)
      ]);

      const data = rows.map((l) => ({
        _id: l._id,
        title: l.title,
        khasraNumber: l.khasraNumber,
        sizeInAcres: l.sizeInAcres,
        leaseType: l.leaseType,
        status: l.status,
        location: l.location,
        owner: l.ownerId ? { name: l.ownerId.name, phone: l.ownerId.phone } : null,
        tenant: l.currentTenantId ? { name: l.currentTenantId.name, phone: l.currentTenantId.phone } : null,
        offersCount: (l.offers || []).length,
        agreement: l.agreement,
        totals: paidTotals(l),
        createdAt: l.createdAt
      }));

      res.status(200).json({
        success: true,
        data,
        pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) }
      });
    } catch (error) {
      console.error('Admin land lease list error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch land leases' });
    }
  },

  // GET /api/admin/land-leases/stats - whole-platform numbers (not just the current page)
  stats: async (req, res) => {
    try {
      const [byStatus, money] = await Promise.all([
        LandLease.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        LandLease.aggregate([
          { $project: { items: { $concatArrays: [{ $ifNull: ['$installments', []] }, { $ifNull: ['$settlements', []] }] } } },
          { $unwind: '$items' },
          { $match: { 'items.status': 'paid' } },
          { $group: { _id: null, collected: { $sum: '$items.amount' }, commission: { $sum: '$items.commission' }, payments: { $sum: 1 } } }
        ])
      ]);

      const counts = { active: 0, leased: 0, inactive: 0, pending_verification: 0 };
      byStatus.forEach((s) => { counts[s._id] = s.count; });
      const m = money[0] || { collected: 0, commission: 0, payments: 0 };
      const r = (n) => Math.round(n * 100) / 100;

      res.status(200).json({
        success: true,
        data: {
          counts,
          totalListings: Object.values(counts).reduce((a, b) => a + b, 0),
          totalCollected: r(m.collected),
          totalCommission: r(m.commission),
          paymentsCount: m.payments
        }
      });
    } catch (error) {
      console.error('Admin land lease stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch land lease stats' });
    }
  },

  // GET /api/admin/land-leases/:id - full record with every installment, settlement and offer
  getById: async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid id' });
      }
      const lease = await LandLease.findById(req.params.id)
        .populate('ownerId', 'name phone email')
        .populate('currentTenantId', 'name phone email')
        .lean();
      if (!lease) return res.status(404).json({ success: false, message: 'Land lease not found' });

      res.status(200).json({ success: true, data: { ...lease, totals: paidTotals(lease) } });
    } catch (error) {
      console.error('Admin land lease detail error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch land lease' });
    }
  }
};

module.exports = adminLandLeaseController;
