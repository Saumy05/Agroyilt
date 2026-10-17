import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiHome,
  FiUsers,
  FiBriefcase,
  FiUser,
  FiUserCheck,
  FiShoppingBag,
  FiGrid,
  FiDollarSign,
  FiCreditCard,
  FiArrowUpRight,
  FiRepeat,
  FiFileText,
  FiBell,
  FiSettings,
  FiChevronDown,
  FiX,
  FiPackage,
  FiTrash2,
  FiStar,
  FiActivity,
  FiAlertTriangle,
  FiGlobe,
  FiTruck,
  FiGift,
  FiShield,
  FiMapPin,
  FiMap,
  FiKey,
  FiPieChart,
  FiTrendingUp,
  FiSearch,
} from "react-icons/fi";
import adminMenu from "../../config/adminMenu.json";
import dashboardService from "../../services/dashboardService";
import authStorage from "../../../../utils/authStorage";
import { useBrand } from "../../../../context/BrandContext";
import { getChildRoute, filterMenuForAdmin } from "../../utils/adminNavigation";
import { ADMIN_COUNTS_REFRESH } from "../../utils/adminCounts";

// Icon mapping for menu items
const iconMap = {
  Dashboard: FiHome,
  Farmers: FiUsers,
  Workers: FiUserCheck,
  Vendors: FiBriefcase,
  Bookings: FiShoppingBag,
  "User Catalog": FiGrid,
  Payments: FiCreditCard,
  Withdrawals: FiArrowUpRight,
  Settlements: FiRepeat,
  Reports: FiPieChart,
  Notifications: FiBell,
  Reviews: FiStar,
  Settings: FiSettings,
  "Soil Testing": FiActivity,
  "Land Leases": FiMap,
  Disputes: FiAlertTriangle,
  "Equipment Catalog": FiGrid,
  "Machinery Management": FiPackage,
  "Manage Website": FiGlobe,
  "Kisan Suvidha & Mandi": FiTrendingUp,
  "Machinery Approvals": FiTruck,
  Referrals: FiGift,
  "Admin Management": FiShield,
  Roles: FiKey,
  "Geographic Management": FiMapPin,
  "My Salary": FiCreditCard,
  "Help & Support": FiAlertTriangle,
};

const AdminSidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { appLogo, appName } = useBrand();
  const [expandedItems, setExpandedItems] = useState({});
  const [isMobile, setIsMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [adminUser, setAdminUser] = useState({ name: 'Admin', email: '', role: 'admin' });
  const [counts, setCounts] = useState({});

  // Load admin user from storage
  useEffect(() => {
    try {
      const stored = authStorage.getUserData('admin') || {};
      if (stored.name || stored.email) {
        setAdminUser({
          name: stored.name || 'Admin',
          email: stored.email || '',
          role: stored.role || 'admin',
          scopeType: stored.scopeType || 'GLOBAL',
          cityName: stored.cityName || '',
          districtName: stored.districtName || '',
          subDistrictName: stored.subDistrictName || '',
          permissions: stored.permissions || {}
        });
      }
    } catch (e) {
      console.error('Failed to parse admin data:', e);
    }
  }, []);

  // Filter menu items by role and granular permissions
  const filteredMenu = useMemo(
    () => filterMenuForAdmin(adminMenu, adminUser),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminUser.role, adminUser.permissions]
  );

  // Sidebar search: match parent titles or child names; matching children auto-expand
  const visibleMenu = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filteredMenu;
    return filteredMenu
      .map((item) => {
        if (item.title.toLowerCase().includes(q)) return item;
        const kids = (item.children || []).filter((c) => c.toLowerCase().includes(q));
        return kids.length ? { ...item, children: kids, forceOpen: true } : null;
      })
      .filter(Boolean);
  }, [filteredMenu, query]);

  // Fetch pending counts for badges
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await dashboardService.getSidebarCounts();
        if (response.success && response.data) {
          setCounts(response.data);
        }
      } catch (error) {
        console.error("Error fetching sidebar counts:", error);
      }
    };

    fetchCounts();
    // Refresh every 30 seconds, and right away when a page changes a queue (approve / reject / claim)
    const interval = setInterval(fetchCounts, 30000);
    window.addEventListener(ADMIN_COUNTS_REFRESH, fetchCounts);
    return () => {
      clearInterval(interval);
      window.removeEventListener(ADMIN_COUNTS_REFRESH, fetchCounts);
    };
  }, []);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-close sidebar on mobile when route changes
  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    // Only close if screen is small (mobile)
    if (window.innerWidth < 1024) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]); // Remove onClose to prevent re-triggering when parent re-renders

  // Auto-expand menu items when their route is active
  useEffect(() => {
    // 1. Try to find parent by explicit child route match first
    let activeItem = filteredMenu.find((item) => {
      return item.children?.some(child => {
        const childRoute = getChildRoute(item.route, child);
        return location.pathname === childRoute || 
               (childRoute !== item.route && location.pathname.startsWith(childRoute + '/'));
      });
    });

    // 2. Fall back to prefix matching if no explicit child route matched
    if (!activeItem) {
      activeItem = filteredMenu.find((item) => {
        if (item.route === "/admin/dashboard") {
          return location.pathname === "/admin/dashboard";
        }
        const isChildRoute =
          location.pathname.startsWith(item.route) &&
          location.pathname !== item.route;
        return isChildRoute;
      });
    }

    if (activeItem && activeItem.children && activeItem.children.length > 0) {
      setExpandedItems((prev) => {
        if (prev[activeItem.title]) {
          return prev;
        }
        return {
          [activeItem.title]: true,
        };
      });
    }
  }, [location.pathname, filteredMenu]);

  // Check if a menu item is active
  const isActive = (item) => {
    const route = item.route;
    if (route === "/admin/dashboard") {
      return location.pathname === "/admin/dashboard";
    }

    // If item has children, check if any child is active
    if (item.children && item.children.length > 0) {
      return item.children.some(child => {
        const childRoute = getChildRoute(item.route, child);
        return location.pathname === childRoute || 
               (childRoute !== item.route && location.pathname.startsWith(childRoute + '/'));
      });
    }

    // Special case for Equipment Catalog to prevent false active state on sub-routes
    if (route === "/admin/equipment-catalog") {
      if (location.pathname.startsWith("/admin/equipment-catalog/vendor-")) {
        return false;
      }
    }

    // Strict prefix check: either exact match OR followed by a slash
    return location.pathname === route || location.pathname.startsWith(route + '/');
  };

  // Toggle expanded state for menu items with children
  const toggleExpand = (title, closeOthers = true) => {
    setExpandedItems((prev) => {
      if (closeOthers) {
        return {
          [title]: !prev[title],
        };
      } else {
        return {
          ...prev,
          [title]: !prev[title],
        };
      }
    });
  };

  // Handle menu item click
  const handleMenuItemClick = (route, parentTitle = null) => {
    if (parentTitle) {
      setExpandedItems((prev) => {
        return {
          [parentTitle]: true,
        };
      });
    }
    setQuery("");
    navigate(route);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  // Render menu item
  const renderMenuItem = (item) => {
    const Icon = iconMap[item.title] || FiHome;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.title] || item.forceOpen;
    const active = isActive(item);

    return (
      <div key={item.route} className="mb-0.5">
        {/* Main Menu Item */}
        <div
          className={`
            flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer group
            ${active
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25 font-bold"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
            }
          `}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.title, true);
            } else {
              handleMenuItemClick(item.route);
            }
          }}>
          <Icon
            className={`text-lg flex-shrink-0 transition-transform group-hover:scale-110 ${active ? "text-white" : "text-slate-400 group-hover:text-white"
              }`}
          />
          <span className="font-bold flex-1 text-sm tracking-tight">{item.title}</span>

          {/* Badge Display */}
          {counts[item.badgeKey] > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse mr-2">
              {counts[item.badgeKey] > 99 ? '99+' : counts[item.badgeKey]}
            </span>
          )}

          {hasChildren && (
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}>
              <FiChevronDown className="text-slate-400 text-xs" />
            </motion.div>
          )}
        </div>

        {/* Children Items */}
        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden">
              <div className="ml-4 mt-1 pl-3.5 border-l-2 border-slate-700 space-y-0.5">
                {item.children.map((child, index) => {
                  const childRoute = getChildRoute(item.route, child);
                  const isChildActive =
                    location.pathname === childRoute ||
                    (childRoute !== item.route &&
                      location.pathname.startsWith(childRoute));

                  return (
                    <div
                      key={index}
                      onClick={() =>
                        handleMenuItemClick(childRoute, item.title)
                      }
                      className={`
                        px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer flex justify-between items-center font-medium
                        ${isChildActive
                          ? "bg-blue-600/30 text-white font-bold border border-blue-500/40"
                          : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                        }
                      `}>
                      <span>{child}</span>
                      {counts[item.childBadges?.[child]] > 0 && (
                        <span className="bg-red-500 text-white text-[10px] h-4 min-w-[18px] px-1.5 flex items-center justify-center rounded-full font-black">
                          {counts[item.childBadges[child]] > 99 ? '99+' : counts[item.childBadges[child]]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Sidebar content
  const sidebarContent = (
    <div className="h-full w-full flex flex-col bg-slate-800">
      {/* Header Section */}
      <div className="px-4 pt-4 pb-5 border-b border-slate-700/80 bg-slate-900">
        {/* Brand logo */}
        <div
          className="flex items-center gap-3 pb-4 mb-4 border-b border-slate-700/60 cursor-pointer"
          onClick={() => handleMenuItemClick("/admin/dashboard")}>
          <img
            src={appLogo}
            alt={appName}
            className="h-10 w-10 rounded-lg object-contain bg-white/95 p-1 flex-shrink-0"
          />
          <span className="font-black text-white text-lg tracking-tight truncate">
            {appName}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #2874F0 0%, #4787F7 100%)',
              }}
            >
              <FiUser className="text-white text-xl" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-white text-sm truncate">
                {adminUser.name}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                  adminUser.role === 'super_admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {adminUser.role === 'super_admin' ? '⭐ Super Admin' : 'Admin'}
                </span>
                {adminUser.role !== 'super_admin' && (
                  <span className="text-[10px] text-slate-300 truncate max-w-[130px]" title={adminUser.cityName ? `${adminUser.cityName}${adminUser.districtName ? ` • ${adminUser.districtName}` : ''}` : 'Scoped Admin'}>
                    📍 {adminUser.cityName || 'Scoped'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Close Button - Mobile Only */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0 lg:hidden"
            aria-label="Close sidebar">
            <FiX className="text-xl text-slate-300" />
          </button>
        </div>
      </div>

      {/* Menu Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && visibleMenu.length === 1 && !visibleMenu[0].children?.length) {
                handleMenuItemClick(visibleMenu[0].route);
              }
            }}
            placeholder="Search menu..."
            aria-label="Search menu"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-slate-900/60 border border-slate-700 text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white">
              <FiX className="text-sm" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 scrollbar-admin lg:pb-3 space-y-0.5">
        {query && visibleMenu.length === 0 && (
          <p className="px-3.5 py-6 text-center text-xs text-slate-400">No menu items match "{query}"</p>
        )}
        {visibleMenu.map((item, index) => {
          const showCategoryHeader =
            item.category &&
            (index === 0 || visibleMenu[index - 1].category !== item.category);

          return (
            <div key={item.route || index}>
              {showCategoryHeader && (
                <div className="px-3.5 pt-4 pb-1.5 text-[10px] font-black text-slate-400/90 uppercase tracking-widest flex items-center gap-2">
                  <span>{item.category}</span>
                </div>
              )}
              {renderMenuItem(item)}
            </div>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile: Overlay Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[99998] lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 w-[280px] z-[99999] lg:hidden shadow-2xl"
          >
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop Fixed */}
      <div
        className="hidden lg:flex fixed left-0 top-0 bottom-0 z-30"
        style={{ width: '278px' }}
      >
        {sidebarContent}
      </div>
    </>
  );
};

export default AdminSidebar;

