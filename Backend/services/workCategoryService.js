'use strict';

const WorkCategory = require('../models/WorkCategory');

/** The starting list: the names farmers and workers already use, with the older names workers saved them under as aliases. */
const DEFAULTS = [
  { name: 'Harvesting', icon: '🌾', title: 'Harvesting Work', description: 'Looking for farm workers for crop harvesting and field clearing.', aliases: ['Harvesting (Crop Cutting)', 'Drive Harvester'] },
  { name: 'Sowing', icon: '🌱', title: 'Sowing Work', description: 'Looking for farm workers for seed sowing and field planting.', aliases: ['Sowing / Seeding', 'Sowing & Planting'] },
  { name: 'Planting', icon: '🌿', title: 'Planting Work', description: 'Looking for farm workers for sapling planting and crop transplantation.', aliases: ['Sowing & Planting'] },
  { name: 'Irrigation', icon: '💧', title: 'Irrigation Work', description: 'Looking for farm workers for field irrigation and water channel management.', aliases: [] },
  { name: 'Weeding', icon: '🪴', title: 'Weeding Work', description: 'Looking for farm workers for manual weed removal and crop maintenance.', aliases: [] },
  { name: 'Fertilizing', icon: '🧪', title: 'Fertilizing Work', description: 'Looking for farm workers for fertilizer application and crop nutrition.', aliases: [] },
  { name: 'Pesticide Spraying', icon: '🧴', title: 'Pesticide Spraying', description: 'Looking for experienced workers for crop pesticide and insecticide spraying.', aliases: ['Crop Spraying'] },
  { name: 'Land Preparation', icon: '🚜', title: 'Land Preparation', description: 'Looking for farm workers for land tilling, levelling, and soil bed preparation.', aliases: ['Ploughing', 'Plowing', 'Plowing & Tillage'] },
  { name: 'Threshing', icon: '🌾', title: 'Threshing Work', description: 'Looking for farm workers for post-harvest crop threshing and grain separation.', aliases: [] },
  { name: 'Loading & Unloading', icon: '📦', title: 'Loading & Unloading', description: 'Looking for workers for farm produce loading, unloading, and cartage.', aliases: ['Loading / Unloading'] },
  { name: 'Tractor Operation', icon: '🚜', title: 'Tractor Operation', description: 'Need skilled operator for tractor ploughing and farm equipment handling.', aliases: ['Drive Tractor', 'Tractor Driving'] },
  { name: 'General Farm Labour', icon: '👨‍🌾', title: 'General Farm Labour', description: 'Looking for workers for general farm chores, maintenance, and field assistance.', aliases: ['General Farm Helper', 'General Labor'] },
  { name: 'Pruning & Trimming', icon: '✂️', title: 'Pruning & Trimming', description: 'Looking for workers for pruning, trimming and orchard upkeep.', aliases: [] },
  { name: 'Fruit & Vegetable Picking', icon: '🍎', title: 'Fruit & Vegetable Picking', description: 'Looking for workers for picking and sorting fruits and vegetables.', aliases: [] },
  { name: 'Cattle & Livestock Care', icon: '🐄', title: 'Cattle & Livestock Care', description: 'Looking for workers for feeding, milking and caring for cattle and livestock.', aliases: [] },
  { name: 'Polyhouse Work', icon: '🏡', title: 'Polyhouse Work', description: 'Looking for workers for polyhouse and greenhouse farming work.', aliases: [] },
  { name: 'Nursery Work', icon: '🌳', title: 'Nursery Work', description: 'Looking for workers for plant nursery work: seedlings, potting and watering.', aliases: [] }
];

const keyOf = (name) => String(name || '').trim().toLowerCase();

/** Saves the starting list the first time (never touches an existing list). */
const ensureDefaults = async () => {
  if (await WorkCategory.estimatedDocumentCount() > 0) return;
  try {
    await WorkCategory.insertMany(DEFAULTS.map((d, i) => ({ ...d, nameKey: keyOf(d.name), order: i + 1 })), { ordered: false });
  } catch (err) {
    if (!err || (err.code !== 11000 && !err.writeErrors)) throw err; // another request seeded it first
  }
};

const toPublic = (c) => ({
  id: c._id,
  name: c.name,
  icon: c.icon,
  title: c.title || c.name,
  description: c.description || '',
  aliases: c.aliases || [],
  order: c.order
});

/** Active categories, in order: what the forms show. */
const listActive = async () => {
  await ensureDefaults();
  const rows = await WorkCategory.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
  return rows.map(toPublic);
};

// ── alias map for request matching ─────────────────────────────────────────────────────────────
// A request for "Sowing" also reaches workers who saved "Sowing / Seeding". Read synchronously by the matching code,
// refreshed after every admin change and every few minutes (several servers may share the list).
let aliasMap = {};
let refreshedAt = 0;
const REFRESH_MS = 5 * 60 * 1000;

const refreshAliasMap = async () => {
  try {
    const rows = await WorkCategory.find({}).select('name aliases').lean();
    const next = {};
    rows.forEach((c) => { next[keyOf(c.name)] = (c.aliases || []).map(String); });
    aliasMap = next;
    refreshedAt = Date.now();
  } catch (err) {
    console.error('[workCategory] alias refresh failed:', err.message);
  }
};

/** Aliases by lower-cased category name. Returns what is cached and refreshes in the background when it is old. */
const getAliasMap = () => {
  if (Date.now() - refreshedAt > REFRESH_MS) {
    refreshedAt = Date.now(); // one refresh at a time
    refreshAliasMap();
  }
  return aliasMap;
};

// Load the aliases as soon as the database is connected, so the first request already matches renamed categories
require('mongoose').connection.once('open', () => { refreshAliasMap(); });

module.exports = { DEFAULTS, keyOf, ensureDefaults, listActive, toPublic, refreshAliasMap, getAliasMap };
