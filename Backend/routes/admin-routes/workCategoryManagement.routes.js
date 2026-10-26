const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requireAnyPermission } = require('../../middleware/roleMiddleware');
const c = require('../../controllers/adminControllers/workCategoryController');

router.use(authenticate, isAdmin);

router.get('/', requireAnyPermission('workers.view'), c.list);
router.post('/', requireAnyPermission('workers.create'), c.create);
router.put('/:id', requireAnyPermission('workers.edit'), c.update);
router.delete('/:id', requireAnyPermission('workers.delete'), c.remove);

module.exports = router;
