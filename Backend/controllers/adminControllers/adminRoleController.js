const mongoose = require('mongoose');
const Admin = require('../../models/Admin');
const AdminRole = require('../../models/AdminRole');
const AdminAuditLog = require('../../models/AdminAuditLog');
const { PERMISSION_KEYS } = require('../../models/Admin');

/**
 * Admin roles: saved sets of permissions (super admin only).
 * A role is a template. Assigning it copies the permissions onto the admin; editing it can push the change to members.
 */

const STARTER_ROLES = [
  {
    name: 'Support Agent',
    description: 'Answers tickets and looks into disputes.',
    permissionKeys: ['dashboard.view', 'users.view', 'vendors.view', 'workers.view', 'bookings.view', 'disputes.view', 'support.view', 'support.reply', 'reviews.view']
  },
  {
    name: 'Support Supervisor',
    description: 'Everything an agent has, plus resolving disputes and bookings.',
    permissionKeys: ['dashboard.view', 'users.view', 'vendors.view', 'workers.view', 'bookings.view', 'bookings.edit', 'bookings.cancel', 'disputes.view', 'disputes.manage', 'support.view', 'support.reply', 'reviews.view', 'reviews.moderate', 'reports.view']
  },
  {
    name: 'Site Manager',
    description: 'Onboards and approves vendors, workers and machinery in their area.',
    permissionKeys: ['dashboard.view', 'users.view', 'users.create', 'users.edit', 'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.approve', 'workers.view', 'workers.create', 'workers.edit', 'workers.approve', 'bookings.view', 'machinery.approvals.view', 'machinery.approvals.manage', 'machinery.view', 'disputes.view']
  },
  {
    name: 'Finance',
    description: 'Settlements, payouts and payments.',
    permissionKeys: ['dashboard.view', 'settlements.view', 'settlements.process', 'payments.view', 'payouts.view', 'payouts.approve', 'reports.view', 'reports.export']
  },
  {
    name: 'Content Manager',
    description: 'Services, catalogue and website content.',
    permissionKeys: ['dashboard.view', 'services.view', 'services.edit', 'categories.view', 'categories.edit', 'brands.view', 'brands.edit', 'products.view', 'products.edit', 'website.view', 'website.edit']
  }
];

const actor = (admin) => ({ adminId: admin._id, adminName: admin.name, adminEmail: admin.email, adminRole: admin.role });
const audit = (req, action, role, description, metadata = {}) =>
  AdminAuditLog.log({
    ...actor(req.user), action, module: 'ADMIN_MANAGEMENT', targetId: role._id, targetModel: 'AdminRole',
    targetName: role.name, description, metadata, req
  }).catch((e) => console.warn('[AuditLog] Error:', e.message));

const cleanKeys = (keys) => [...new Set((Array.isArray(keys) ? keys : []).filter((k) => PERMISSION_KEYS.includes(k)))];
const toFlat = (keys) => {
  const flat = Admin.defaultPermissions();
  keys.forEach((k) => { flat[k] = true; });
  return flat;
};
const sameSet = (adminPerms, keys) => {
  const have = PERMISSION_KEYS.filter((k) => adminPerms?.[k] === true);
  return have.length === keys.length && have.every((k) => keys.includes(k));
};
const respondError = (res, error, fallback) => {
  if (error?.code === 11000) return res.status(409).json({ success: false, message: 'A role with this name already exists.' });
  if (error?.name === 'ValidationError') return res.status(400).json({ success: false, message: error.message });
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
};

/** Copy a role's permissions onto every non-super member. Returns how many admins changed. */
const applyRoleToMembers = async (role) => {
  const members = await Admin.find({ roleId: role._id, role: { $ne: 'super_admin' } });
  let changed = 0;
  for (const m of members) {
    if (sameSet(m.permissions, role.permissionKeys)) continue;
    m.permissions = toFlat(role.permissionKeys);
    m.markModified('permissions');
    await m.save();
    changed += 1;
  }
  return { members: members.length, changed };
};

// GET /api/admin/roles
const listRoles = async (req, res) => {
  try {
    const [roles, counts] = await Promise.all([
      AdminRole.find().sort({ name: 1 }).lean(),
      Admin.aggregate([{ $match: { roleId: { $ne: null } } }, { $group: { _id: '$roleId', n: { $sum: 1 } } }])
    ]);
    const byId = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    res.json({ success: true, data: roles.map((r) => ({ ...r, memberCount: byId[String(r._id)] || 0 })) });
  } catch (error) { respondError(res, error, 'Failed to load roles'); }
};

// GET /api/admin/roles/:id  (role + members, flagging members whose ticks differ from the role)
const getRole = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Role not found' });
    const role = await AdminRole.findById(req.params.id).lean();
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    const members = await Admin.find({ roleId: role._id }).select('name email role isActive permissions').lean();
    res.json({
      success: true,
      data: {
        ...role,
        members: members.map((m) => ({
          _id: m._id, name: m.name, email: m.email, isActive: m.isActive,
          customised: m.role !== 'super_admin' && !sameSet(m.permissions, role.permissionKeys)
        }))
      }
    });
  } catch (error) { respondError(res, error, 'Failed to load role'); }
};

// POST /api/admin/roles
const createRole = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Role name is required' });
    const role = await AdminRole.create({
      name, description: req.body.description, permissionKeys: cleanKeys(req.body.permissionKeys),
      createdBy: req.user._id, updatedBy: req.user._id
    });
    await audit(req, 'CREATE_ROLE', role, `Created role "${role.name}" with ${role.permissionKeys.length} permissions`, { permissionKeys: role.permissionKeys });
    res.status(201).json({ success: true, data: role });
  } catch (error) { respondError(res, error, 'Failed to create role'); }
};

// PUT /api/admin/roles/:id   body: { name, description, permissionKeys, applyToMembers }
const updateRole = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Role not found' });
    const role = await AdminRole.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    const before = [...role.permissionKeys];
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ success: false, message: 'Role name is required' });
      role.name = name;
    }
    if (req.body.description !== undefined) role.description = req.body.description;
    if (req.body.permissionKeys !== undefined) role.permissionKeys = cleanKeys(req.body.permissionKeys);
    role.updatedBy = req.user._id;
    await role.save();

    const added = role.permissionKeys.filter((k) => !before.includes(k));
    const removed = before.filter((k) => !role.permissionKeys.includes(k));
    let applied = null;
    if (req.body.applyToMembers === true) applied = await applyRoleToMembers(role);

    await audit(req, 'UPDATE_ROLE', role,
      `Updated role "${role.name}". Added: ${added.join(', ') || 'none'}. Removed: ${removed.join(', ') || 'none'}.${applied ? ` Applied to ${applied.changed} member(s).` : ''}`,
      { added, removed, applied });
    res.json({ success: true, data: role, applied });
  } catch (error) { respondError(res, error, 'Failed to update role'); }
};

// DELETE /api/admin/roles/:id  (blocked while anyone still has the role)
const deleteRole = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Role not found' });
    const role = await AdminRole.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    const members = await Admin.countDocuments({ roleId: role._id });
    if (members > 0) {
      return res.status(409).json({ success: false, message: `${members} admin(s) still have this role. Move them to another role first.` });
    }
    await role.deleteOne();
    await audit(req, 'DELETE_ROLE', role, `Deleted role "${role.name}"`);
    res.json({ success: true, message: 'Role deleted' });
  } catch (error) { respondError(res, error, 'Failed to delete role'); }
};

// POST /api/admin/roles/seed-starters  (idempotent: adds only the missing ones)
const seedStarterRoles = async (req, res) => {
  try {
    const created = [];
    for (const r of STARTER_ROLES) {
      const exists = await AdminRole.findOne({ name: r.name }).collation({ locale: 'en', strength: 2 });
      if (exists) continue;
      created.push(await AdminRole.create({ ...r, createdBy: req.user._id, updatedBy: req.user._id }));
    }
    if (created.length) await audit(req, 'CREATE_ROLE', created[0], `Created starter roles: ${created.map((c) => c.name).join(', ')}`);
    res.status(201).json({ success: true, message: created.length ? `${created.length} starter role(s) added` : 'Starter roles already exist', data: created });
  } catch (error) { respondError(res, error, 'Failed to add starter roles'); }
};

module.exports = { listRoles, getRole, createRole, updateRole, deleteRole, seedStarterRoles, STARTER_ROLES };
