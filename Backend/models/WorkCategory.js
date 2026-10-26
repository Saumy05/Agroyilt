const mongoose = require('mongoose');

/**
 * A kind of farm work a farmer can ask for and a worker can offer ("Weeding", "Harvesting"...).
 * One admin-managed list used by the farmer's request forms, the worker's profile, team members and the admin's Add Worker.
 * Workers and requests store the category NAME, so a renamed category keeps its old name as an alias and nobody stops matching.
 */
const workCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  nameKey: { type: String, required: true, unique: true }, // lower-cased name: no two categories with the same name
  icon: { type: String, default: '🌾', trim: true, maxlength: 8 },
  title: { type: String, trim: true, maxlength: 80 }, // filled into the farmer's request title
  description: { type: String, trim: true, maxlength: 300 }, // filled into the farmer's request description
  // Other names workers saved this work under (older lists, renamed categories). A request for this category reaches them too.
  aliases: [{ type: String, trim: true, maxlength: 60 }],
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

workCategorySchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('WorkCategory', workCategorySchema);
