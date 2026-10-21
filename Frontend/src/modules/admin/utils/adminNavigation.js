// Helper function to convert child name to route path
export const getChildRoute = (parentRoute, childName) => {
  const routeMap = {
    "/admin/users": {
      "All Farmers": "/admin/users/all",
      "Farmer Bookings": "/admin/users/bookings",
      "Farmer Analytics": "/admin/users/analytics",
      "Registration Fees": "/admin/users/registration-fees",
    },
    "/admin/workers": {
      "All Workers": "/admin/workers/all",
      "Worker Bookings": "/admin/workers/bookings",
      "Analytics": "/admin/workers/analytics",
      "Registration Fees": "/admin/workers/registration-fees",
    },
    "/admin/vendors": {
      "All Vendors": "/admin/vendors/all",
      "Vendor Bookings": "/admin/vendors/bookings",
      "Vendor Analytics": "/admin/vendors/analytics",
      "Registration Fees": "/admin/vendors/registration-fees",
    },
    "/admin/bookings": {
      "All Bookings": "/admin/bookings",
      "Booking Tracking": "/admin/bookings/tracking",
      "Booking Notifications": "/admin/bookings/notifications",
    },
    "/admin/equipment-catalog": {
      "Home": "/admin/equipment-catalog/home",
      "Manage Categories": "/admin/equipment-catalog/categories",
      "Manage Machinery Types": "/admin/equipment-catalog/sections",
      "Machinery Approvals": "/admin/equipment-approvals"
    },
    "/admin/payments": {
      "Payment Overview": "/admin/payments/overview",
      "Farmer Payments": "/admin/payments/users",
      "Worker Payments": "/admin/payments/workers",
      "Vendor Payments": "/admin/payments/vendors",
      "Admin Revenue": "/admin/payments/revenue",
      "Payment Reports": "/admin/payments/reports",
    },
    "/admin/reports": {
      "Revenue Report": "/admin/reports/revenue",
      "Booking Report": "/admin/reports/bookings",
      "Payment Report": "/admin/payments/reports",
      "Agriculture Insights": "/admin/reports/agri-insights",
    },
    "/admin/notifications": {
      "Push Notifications": "/admin/notifications/push",
      "Custom Messages": "/admin/notifications/messages",
      "Notification Settings": "/admin/notifications/settings",
    },
    "/admin/settings": {
      "General Settings": "/admin/settings/general",
      "Equipment Configuration": "/admin/settings/service-config",
      "System Settings": "/admin/settings/system",
    },
    "/admin/settlements": {
      "Pending": "/admin/settlements/pending",
      "Vendors with Due": "/admin/settlements/vendors",
      "History": "/admin/settlements/history",
      "Worker Dues": "/admin/settlements/worker-dues",
    },
    "/admin/manage-website": {
      "Blogs": "/admin/manage-website/blogs",
      "Articles": "/admin/manage-website/articles",
      "Reviews": "/admin/manage-website/reviews",
      "FAQ": "/admin/manage-website/faq",
      "About Us": "/admin/manage-website/about-us",
      "App Guide": "/admin/manage-website/app-guide",
    },
    "/admin/geographic-management": {
      "States": "/admin/geographic-management?tab=states",
      "Districts": "/admin/geographic-management?tab=districts",
      "Sub-Districts": "/admin/geographic-management?tab=subdistricts",
    },
  };

  return routeMap[parentRoute]?.[childName] || parentRoute;
};

// Map menu title to required permission for sub-admins
export const MENU_PERMISSION_MAP = {
  'Dashboard': 'dashboard.view',
  'Farmers': 'users.view',
  'Workers': 'workers.view',
  'Vendors': 'vendors.view',
  'Bookings': 'bookings.view',
  'Payments': 'payments.view',
  'Withdrawals': 'settlements.view',
  'Settlements': 'settlements.view',
  'Catalog Setup': 'services.view',
  'Machinery Approvals': 'machinery.approvals.view',
  'Machinery Listings': 'machinery.view',
  'Reports': 'reports.view',
  'Reviews': 'reviews.view',
  'Soil Testing': 'soiltest.view',
  'Land Leases': 'payments.view',
  'Disputes': 'disputes.view',
  'Help & Support': 'support.view',
  'Manage Website': 'website.view',
  'Kisan Suvidha & Mandi': 'website.view',
  'Referrals': 'referrals.view',
  'Admin Management': null, // strictly super_admin only
  'Roles': null, // strictly super_admin only
  'Geographic Management': null, // strictly super_admin only
  'Settings': 'settings.view'
};


// Filter menu items by role and granular permissions
export const filterMenuForAdmin = (menu, adminUser) => menu.filter(item => {
  if (item.allowedRoles && !item.allowedRoles.includes(adminUser.role)) {
    return false;
  }

  // Super Admin has full unrestricted access
  if (adminUser.role === 'super_admin') return true;

  const requiredPermission = MENU_PERMISSION_MAP[item.title];
  if (requiredPermission === null) {
    // Strictly super_admin only
    return false;
  }
  // A role without the permission does not see the item (an empty permission list used to show everything)
  if (requiredPermission) {
    return !!adminUser.permissions?.[requiredPermission];
  }

  return true;
});
