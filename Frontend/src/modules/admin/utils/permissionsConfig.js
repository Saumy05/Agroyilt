/**
 * Permission keys grouped by module for a clean UI.
 * Mirrors PERMISSION_KEYS in Backend/models/Admin.js
 */
export const PERMISSION_GROUPS = [
  {
    group: 'Dashboard',
    icon: '📊',
    color: 'indigo',
    keys: [
      { key: 'dashboard.view', label: 'View Dashboard' }
    ]
  },
  {
    group: 'User Management (Farmers)',
    icon: '👤',
    color: 'blue',
    keys: [
      { key: 'users.view', label: 'View Users / Farmers' },
      { key: 'users.create', label: 'Create Farmers' },
      { key: 'users.edit', label: 'Edit Farmers' },
      { key: 'users.block', label: 'Block/Unblock Farmers' },
      { key: 'users.delete', label: 'Delete Farmers' }
    ]
  },
  {
    group: 'Vendor Management',
    icon: '🏪',
    color: 'orange',
    keys: [
      { key: 'vendors.view', label: 'View Vendors' },
      { key: 'vendors.create', label: 'Create Vendors' },
      { key: 'vendors.edit', label: 'Edit Vendors' },
      { key: 'vendors.approve', label: 'Approve/Reject Vendors' },
      { key: 'vendors.block', label: 'Block/Unblock Vendors' },
      { key: 'vendors.delete', label: 'Delete Vendors' }
    ]
  },
  {
    group: 'Worker Management',
    icon: '⚙️',
    color: 'green',
    keys: [
      { key: 'workers.view', label: 'View Workers' },
      { key: 'workers.create', label: 'Create Workers' },
      { key: 'workers.edit', label: 'Edit Workers' },
      { key: 'workers.approve', label: 'Approve/Reject Workers' },
      { key: 'workers.block', label: 'Block/Unblock Workers' },
      { key: 'workers.delete', label: 'Delete Workers' }
    ]
  },
  {
    group: 'Bookings',
    icon: '📋',
    color: 'teal',
    keys: [
      { key: 'bookings.view', label: 'View Bookings' },
      { key: 'bookings.edit', label: 'Edit Bookings' },
      { key: 'bookings.cancel', label: 'Cancel Bookings' }
    ]
  },
  {
    group: 'Machinery Approvals',
    icon: '🚜',
    color: 'yellow',
    keys: [
      { key: 'machinery.approvals.view', label: 'View Machinery Approvals' },
      { key: 'machinery.approvals.manage', label: 'Approve / Reject Machinery' }
    ]
  },
  {
    group: 'Machinery Management',
    icon: '🔧',
    color: 'cyan',
    keys: [
      { key: 'machinery.view', label: 'View Machinery' },
      { key: 'machinery.edit', label: 'Add / Edit Machinery' },
      { key: 'machinery.delete', label: 'Delete Machinery' }
    ]
  },
  {
    group: 'Agri Marketplace',
    icon: '🛒',
    color: 'emerald',
    keys: [
      { key: 'marketplace.view', label: 'View Agri Marketplace' },
      { key: 'marketplace.orders', label: 'Manage Marketplace Orders' },
      { key: 'marketplace.stores', label: 'Approve & Manage Stores' }
    ]
  },
  {
    group: 'Referrals System',
    icon: '🎁',
    color: 'pink',
    keys: [
      { key: 'referrals.view', label: 'View Referrals & Attributions' },
      { key: 'referrals.manage', label: 'Manage Referral Rewards & Settings' }
    ]
  },
  {
    group: 'Settlements & Payments',
    icon: '💰',
    color: 'emerald',
    keys: [
      { key: 'settlements.view', label: 'View Settlements' },
      { key: 'settlements.process', label: 'Process Settlements' },
      { key: 'payments.view', label: 'View Payments' },
      { key: 'payouts.view', label: 'View Payouts' },
      { key: 'payouts.approve', label: 'Approve Payouts' }
    ]
  },
  {
    group: 'Reports & Analytics',
    icon: '📈',
    color: 'purple',
    keys: [
      { key: 'reports.view', label: 'View Reports' },
      { key: 'reports.export', label: 'Export Reports' }
    ]
  },
  {
    group: 'Content & Catalog',
    icon: '📦',
    color: 'amber',
    keys: [
      { key: 'services.view', label: 'View Services' },
      { key: 'services.edit', label: 'Edit Services' },
      { key: 'categories.view', label: 'View Categories' },
      { key: 'categories.edit', label: 'Edit Categories' },
      { key: 'brands.view', label: 'View Brands' },
      { key: 'brands.edit', label: 'Edit Brands' },
      { key: 'products.view', label: 'View Products' },
      { key: 'products.edit', label: 'Edit Products' }
    ]
  },
  {
    group: 'Disputes Management',
    icon: '⚠️',
    color: 'red',
    keys: [
      { key: 'disputes.view', label: 'View Disputes' },
      { key: 'disputes.manage', label: 'Manage & Resolve Disputes' }
    ]
  },
  {
    group: 'Manage Website',
    icon: '🌐',
    color: 'sky',
    keys: [
      { key: 'website.view', label: 'View Website Content' },
      { key: 'website.edit', label: 'Manage Content (Blogs, FAQs, Policies)' }
    ]
  },
  {
    group: 'Reviews & Support',
    icon: '⭐',
    color: 'rose',
    keys: [
      { key: 'reviews.view', label: 'View Reviews' },
      { key: 'reviews.moderate', label: 'Moderate Reviews' },
      { key: 'support.view', label: 'View Support Queries' },
      { key: 'support.reply', label: 'Reply to Support Queries' }
    ]
  },
  {
    group: 'Soil Testing',
    icon: '🌱',
    color: 'lime',
    keys: [
      { key: 'soiltest.view', label: 'View Soil Tests' },
      { key: 'soiltest.edit', label: 'Manage Soil Tests' }
    ]
  }
];

/**
 * Get all permission keys as a flat array
 */
export const getAllPermissionKeys = () =>
  PERMISSION_GROUPS.flatMap(g => g.keys.map(k => k.key));

/**
 * Build a default permissions object (all false)
 */
export const buildDefaultPermissions = () => {
  const p = {};
  getAllPermissionKeys().forEach(k => { p[k] = false; });
  return p;
};

/**
 * Count how many permissions are enabled
 */
export const countEnabledPermissions = (permissions = {}) =>
  Object.values(permissions).filter(Boolean).length;

/**
 * Tailwind color map for groups
 */
export const groupColorMap = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700', check: 'accent-indigo-600' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',   check: 'accent-blue-600' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', check: 'accent-orange-600' },
  green:  { bg: 'bg-green-50',  border: 'border-green-100',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700',  check: 'accent-green-600' },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-100',   text: 'text-teal-700',   badge: 'bg-teal-100 text-teal-700',   check: 'accent-teal-600' },
  emerald:{ bg: 'bg-emerald-50',border: 'border-emerald-100',text: 'text-emerald-700',badge: 'bg-emerald-100 text-emerald-700', check: 'accent-emerald-600' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700', check: 'accent-purple-600' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700',  check: 'accent-amber-600' },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-100',   text: 'text-rose-700',   badge: 'bg-rose-100 text-rose-700',   check: 'accent-rose-600' },
  lime:   { bg: 'bg-lime-50',   border: 'border-lime-100',   text: 'text-lime-700',   badge: 'bg-lime-100 text-lime-700',   check: 'accent-lime-600' },
  yellow: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  badge: 'bg-amber-100 text-amber-800',  check: 'accent-amber-500' },
  cyan:   { bg: 'bg-cyan-50',   border: 'border-cyan-100',   text: 'text-cyan-700',   badge: 'bg-cyan-100 text-cyan-700',   check: 'accent-cyan-600' },
  pink:   { bg: 'bg-pink-50',   border: 'border-pink-100',   text: 'text-pink-700',   badge: 'bg-pink-100 text-pink-700',   check: 'accent-pink-600' },
  red:    { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700',    check: 'accent-red-600' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700', check: 'accent-violet-600' },
  sky:    { bg: 'bg-sky-50',    border: 'border-sky-100',    text: 'text-sky-700',    badge: 'bg-sky-100 text-sky-700',    check: 'accent-sky-600' }
};
