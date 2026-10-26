const mongoose = require('mongoose');
const WorkCategory = require('../../models/WorkCategory');
const Worker = require('../../models/Worker');
const svc = require('../../services/workCategoryService');
const { auditAdminAction } = require('../../utils/adminScopeHelper');

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v));

const cleanAliases = (list, ownName) => {
  const seen = new Set([svc.keyOf(ownName)]);
  return (Array.isArray(list) ? list : String(list || '').split(','))
    .map((a) => String(a).trim().slice(0, 60))
    .filter((a) => a && !seen.has(svc.keyOf(a)) && seen.add(svc.keyOf(a)));
};

const fields = (body) => {
  const out = {};
  if (body.name !== undefined) out.name = String(body.name).trim().slice(0, 60);
  if (body.icon !== undefined) out.icon = String(body.icon).trim().slice(0, 8) || '🌾';
  if (body.title !== undefined) out.title = String(body.title).trim().slice(0, 80);
  if (body.description !== undefined) out.description = String(body.description).trim().slice(0, 300);
  if (body.order !== undefined && Number.isFinite(Number(body.order))) out.order = Number(body.order);
  if (body.isActive !== undefined) out.isActive = body.isActive === true || body.isActive === 'true';
  return out;
};

const workCategoryController = {
  // GET /api/admin/work-categories: every category (also switched-off ones) with how many workers list it
  list: async (req, res) => {
    try {
      await svc.ensureDefaults();
      const rows = await WorkCategory.find({}).sort({ order: 1, name: 1 }).lean();
      const counts = await Promise.all(rows.map((c) => Worker.countDocuments({
        skills: { $in: [c.name, ...(c.aliases || [])].map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
      })));
      res.status(200).json({ success: true, data: rows.map((c, i) => ({ ...c, workerCount: counts[i] })) });
    } catch (error) {
      console.error('Work categories list error:', error);
      res.status(500).json({ success: false, message: 'Failed to load the work categories' });
    }
  },

  // POST /api/admin/work-categories
  create: async (req, res) => {
    try {
      const data = fields(req.body);
      if (!data.name) return res.status(400).json({ success: false, message: 'Enter the category name.' });
      const nameKey = svc.keyOf(data.name);
      if (await WorkCategory.exists({ nameKey })) return res.status(409).json({ success: false, message: 'A category with this name already exists.' });
      const last = await WorkCategory.findOne().sort({ order: -1 }).select('order').lean();
      const created = await WorkCategory.create({
        ...data,
        nameKey,
        title: data.title || data.name,
        aliases: cleanAliases(req.body.aliases, data.name),
        order: data.order ?? ((last?.order || 0) + 1)
      });
      await svc.refreshAliasMap();
      await auditAdminAction(req, 'CREATE_WORK_CATEGORY', 'WORKER_MANAGEMENT', `Added work category "${created.name}"`, created._id, 'WorkCategory', created.name);
      res.status(201).json({ success: true, data: created });
    } catch (error) {
      console.error('Work category create error:', error);
      res.status(500).json({ success: false, message: 'Failed to add the category' });
    }
  },

  // PUT /api/admin/work-categories/:id
  update: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Category not found' });
      const category = await WorkCategory.findById(req.params.id);
      if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

      const data = fields(req.body);
      const oldName = category.name;
      if (data.name !== undefined) {
        if (!data.name) return res.status(400).json({ success: false, message: 'The category name cannot be empty.' });
        const nameKey = svc.keyOf(data.name);
        if (nameKey !== category.nameKey && await WorkCategory.exists({ nameKey })) {
          return res.status(409).json({ success: false, message: 'A category with this name already exists.' });
        }
        category.nameKey = nameKey;
      }
      Object.assign(category, data);

      // Workers and requests keep the old name they saved: it stays as an alias so they still match after a rename
      const aliasInput = req.body.aliases !== undefined ? req.body.aliases : category.aliases;
      const aliases = cleanAliases(aliasInput, category.name);
      if (svc.keyOf(oldName) !== svc.keyOf(category.name) && !aliases.some((a) => svc.keyOf(a) === svc.keyOf(oldName))) aliases.push(oldName);
      category.aliases = aliases;

      await category.save();
      await svc.refreshAliasMap();
      await auditAdminAction(req, 'UPDATE_WORK_CATEGORY', 'WORKER_MANAGEMENT', `Updated work category "${category.name}"${oldName !== category.name ? ` (was "${oldName}")` : ''}`, category._id, 'WorkCategory', category.name);
      res.status(200).json({ success: true, data: category });
    } catch (error) {
      console.error('Work category update error:', error);
      res.status(500).json({ success: false, message: 'Failed to update the category' });
    }
  },

  // DELETE /api/admin/work-categories/:id: workers keep what they saved; switching a category off is usually better
  remove: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Category not found' });
      const category = await WorkCategory.findByIdAndDelete(req.params.id);
      if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
      await svc.refreshAliasMap();
      await auditAdminAction(req, 'DELETE_WORK_CATEGORY', 'WORKER_MANAGEMENT', `Deleted work category "${category.name}"`, category._id, 'WorkCategory', category.name);
      res.status(200).json({ success: true, message: 'Category deleted' });
    } catch (error) {
      console.error('Work category delete error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete the category' });
    }
  }
};

module.exports = workCategoryController;
