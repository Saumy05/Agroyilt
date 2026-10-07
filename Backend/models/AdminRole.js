const mongoose = require('mongoose');
const { PERMISSION_KEYS } = require('./Admin');

/**
 * AdminRole — a named, reusable set of admin permissions ("Support Agent", "Site Manager").
 *
 * It is a template: assigning a role copies its permissions onto the admin (Admin.permissions stays the single
 * source the rest of the system reads). Editing a role can optionally push the change to its members.
 * Stored as a list of enabled keys; Admin.permissions keeps literal dotted keys that Mongo queries cannot match.
 */
const adminRoleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  permissionKeys: {
    type: [String],
    default: [],
    validate: {
      validator: (keys) => keys.every((k) => PERMISSION_KEYS.includes(k)),
      message: 'Unknown permission key'
    }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

// Role names are unique regardless of case
adminRoleSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('AdminRole', adminRoleSchema);
