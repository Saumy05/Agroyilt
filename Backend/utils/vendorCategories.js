const mongoose = require('mongoose');
const Category = require('../models/Category');

// Categories a vendor can offer at registration: active main equipment categories managed by the admin
// (no parent = not an implement; bookingType WORKER = labour categories are for workers, not vendors).
const MAIN_EQUIPMENT_QUERY = {
  status: 'active',
  bookingType: { $ne: 'WORKER' },
  $and: [
    { $or: [{ parentCategory: null }, { parentCategory: { $exists: false } }] },
    { $or: [{ parentCategories: { $exists: false } }, { parentCategories: { $size: 0 } }] }
  ]
};

const getMainEquipmentCategories = () =>
  Category.find(MAIN_EQUIPMENT_QUERY)
    .select('title slug homeIconUrl homeOrder fulfillmentMode')
    .sort({ homeOrder: 1, title: 1 })
    .lean();

const uniq = (arr) => [...new Set(arr)];

/**
 * Turn whatever the client sent (category ids and/or names) into a consistent pair:
 *  - serviceCategoryIds: ids of real categories (rename-proof)
 *  - service: current category titles + any non-category entries already in the list
 * Ids win when present; otherwise names are matched to categories (case-insensitive).
 */
const resolveVendorServices = async ({ ids, titles } = {}) => {
  const idList = uniq((Array.isArray(ids) ? ids : []).map(String).filter(id => mongoose.Types.ObjectId.isValid(id)));
  const titleList = uniq((Array.isArray(titles) ? titles : titles ? [titles] : [])
    .map(t => (typeof t === 'string' ? t.trim() : '')).filter(Boolean));

  const [byId, byTitle] = await Promise.all([
    idList.length ? Category.find({ _id: { $in: idList } }).select('title').lean() : [],
    titleList.length
      ? Category.find({ title: { $in: titleList } }).collation({ locale: 'en', strength: 2 }).select('title').lean()
      : []
  ]);

  const matchedTitles = new Set(byTitle.map(c => c.title.toLowerCase()));
  const extras = titleList.filter(t => !matchedTitles.has(t.toLowerCase()));
  const chosen = idList.length ? byId : byTitle;

  return {
    serviceCategoryIds: chosen.map(c => c._id),
    service: uniq([...chosen.map(c => c.title), ...extras])
  };
};

// Current category names for a vendor (ids resolved to today's titles, so admin renames keep working)
const getVendorCategoryNames = async (vendor) => {
  const names = Array.isArray(vendor?.service) ? [...vendor.service] : [];
  if (vendor?.serviceCategoryIds?.length) {
    const cats = await Category.find({ _id: { $in: vendor.serviceCategoryIds } }).select('title').lean();
    names.push(...cats.map(c => c.title));
  }
  return uniq(names);
};

module.exports = { getMainEquipmentCategories, resolveVendorServices, getVendorCategoryNames };
