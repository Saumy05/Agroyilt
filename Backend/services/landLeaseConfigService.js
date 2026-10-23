'use strict';

const Settings = require('../models/Settings');

const TYPES = [
  { type: 'fixed-rent', flag: 'landLeaseFixedRentEnabled' },
  { type: 'crop-share', flag: 'landLeaseCropShareEnabled' }
];

/** The lease types the admin has switched on (both, unless switched off in Admin > Settings). */
const enabledLeaseTypes = async () => {
  const s = await Settings.findOne({ type: 'global' }).select(TYPES.map(t => t.flag).join(' ')).lean();
  return TYPES.filter(t => s?.[t.flag] !== false).map(t => t.type);
};

const TYPE_LABEL = { 'fixed-rent': 'Fixed rent', 'crop-share': 'Crop share (batai)' };
const disabledMessage = (type) => `${TYPE_LABEL[type] || 'This lease type'} leases are not available right now.`;

module.exports = { enabledLeaseTypes, disabledMessage };
