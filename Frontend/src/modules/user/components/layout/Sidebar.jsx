import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  HiX, 
  HiOutlineHome, 
  HiOutlineShoppingCart, 
  HiOutlineCalendar, 
  HiOutlineCog, 
  HiOutlineQuestionMarkCircle, 
  HiOutlineInformationCircle, 
  HiOutlineSupport, 
  HiOutlineLogout, 
  HiChevronDown, 
  HiOutlineVideoCamera, 
  HiOutlinePhotograph, 
  HiOutlineDocumentText, 
  HiOutlineCheckCircle,
  HiOutlineArrowRight
} from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';
import { themeColors } from '../../../../theme';
import { userAuthService } from '../../../../services/authService';
import authStorage from '../../../../utils/authStorage';
import { LogoutModal } from '../../../../components/common';
import { useCart } from '../../../../context/CartContext';
import SidebarWeatherPill from './SidebarWeatherPill';

const Sidebar = ({ isOpen, onClose }) => {
  const [user, setUser] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Get live cart count
  const cartContext = useCart();
  const cartCount = cartContext?.cartCount || 0;

  useEffect(() => {
    if (isOpen) {
      setUser(authStorage.getUserData('user') || null);
    }
  }, [isOpen]);

  // Prevent background scrolling when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await userAuthService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
      setUser(null);
      onClose();
      navigate('/user/login');
    }
  };

  const primaryMenuItems = [
    { name: 'Home', path: '/user', icon: HiOutlineHome },
    { 
      name: 'Cart', 
      path: '/user/cart', 
      icon: HiOutlineShoppingCart,
      badge: cartCount > 0 ? (cartCount > 9 ? '9+' : cartCount) : null
    },
    { name: 'My Bookings', path: '/user/my-bookings', icon: HiOutlineCalendar },
  ];

  const guideSubItems = [
    { name: 'Video Guide', path: '/user/how-to-use?type=video', icon: HiOutlineVideoCamera },
    { name: 'Image Guide', path: '/user/how-to-use?type=image', icon: HiOutlinePhotograph },
    { name: 'PDF Guide', path: '/user/how-to-use?type=pdf', icon: HiOutlineDocumentText },
  ];

  const helpMenuItems = [
    { name: 'About Us', path: '/user/about-groo', icon: HiOutlineInformationCircle },
    { name: 'FAQ', path: '/user/faq', icon: HiOutlineQuestionMarkCircle },
    { name: 'Help & Support', path: '/user/help-support', icon: HiOutlineSupport },
  ];

  const accountMenuItems = [
    { name: 'Settings', path: '/user/settings', icon: HiOutlineCog },
  ];

  const isItemActive = (path) => {
    if (path === '/user') {
      return location.pathname === '/user' || location.pathname === '/user/';
    }
    return location.pathname.startsWith(path);
  };

  const sidebarContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-xs"
          />

          {/* Sidebar Drawer */}
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed top-0 left-0 bottom-0 w-[78%] max-w-[320px] bg-white z-[60] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Compact Header Area */}
            <div 
              className="px-4 pt-7 pb-3.5 relative overflow-hidden text-white"
              style={{
                background: 'linear-gradient(145deg, #166534 0%, #15803d 50%, #16a34a 100%)',
              }}
            >
              {/* Subtle ambient lighting */}
              <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-white/10 blur-xl pointer-events-none" />
              <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-emerald-400/20 blur-lg pointer-events-none" />

              {/* Close Button */}
              <button 
                onClick={onClose}
                aria-label="Close menu"
                className="absolute top-2.5 right-2.5 p-1.5 bg-white/15 hover:bg-white/25 active:scale-90 backdrop-blur-md rounded-full text-white transition-all border border-white/20 cursor-pointer"
              >
                <HiX className="w-3.5 h-3.5" />
              </button>

              {/* User Profile Card */}
              <div 
                onClick={() => {
                  if (user) {
                    onClose();
                    navigate('/user/account');
                  }
                }}
                className={`relative z-10 flex items-center gap-3 ${user ? 'cursor-pointer group' : ''}`}
              >
                {/* Avatar with dual ring */}
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full p-[1.5px] bg-gradient-to-tr from-white/40 via-white/80 to-white/30 shadow-sm shadow-black/15">
                    <div className="w-full h-full bg-white rounded-full flex items-center justify-center overflow-hidden">
                      {user?.profilePhoto ? (
                        <img src={user.profilePhoto} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-base font-black text-emerald-800">
                          {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                  </div>
                  {user && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-emerald-900" />
                  )}
                </div>

                {/* Name & Phone */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <h2 className="text-sm font-bold text-white truncate tracking-tight group-hover:text-emerald-100 transition-colors">
                      {user?.name || 'Guest User'}
                    </h2>
                    {user && (
                      <HiOutlineArrowRight className="w-3 h-3 text-white/60 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                    )}
                  </div>
                  <p className="text-white/80 text-[11px] truncate font-medium">
                    {user?.phone || 'Login to access full features'}
                  </p>
                  {user && (
                    <div className="mt-0.5">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-white/15 backdrop-blur-sm text-[9px] font-semibold text-emerald-100 border border-white/15">
                        <HiOutlineCheckCircle className="w-2.5 h-2.5 text-emerald-300" />
                        Farmer
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Compact Menu Items List */}
            <div className="flex-1 overflow-y-auto py-1.5 px-2 custom-scrollbar bg-white">
              {/* Agro-Weather Advisory */}
              <SidebarWeatherPill onClose={onClose} />
              
              {/* Primary Navigation */}
              <div className="space-y-0.5">
                {primaryMenuItems.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.path);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all duration-150 group active:scale-[0.99] ${
                        active 
                          ? 'bg-emerald-50 text-emerald-900 font-semibold border border-emerald-100' 
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center transition-all ${
                          active
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-[13px] truncate">{item.name}</span>
                      </div>

                      {/* Badge (Cart count) */}
                      {item.badge !== null && item.badge !== undefined && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-600 text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Section Divider */}
              <div className="h-px bg-slate-100 my-1 mx-1.5" />
              <p className="text-[9.5px] font-bold tracking-wider uppercase text-slate-400 px-2.5 pt-0.5 pb-0.5">
                Explore & Guides
              </p>

              {/* Guides & Help Section */}
              <div className="space-y-0.5">
                {/* Accordion: How to use our app */}
                <div className="flex flex-col">
                  <button
                    onClick={() => setIsGuideOpen(!isGuideOpen)}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-xl text-slate-700 hover:bg-slate-50 transition-all group active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors">
                        <HiOutlineInformationCircle className="w-4 h-4" />
                      </div>
                      <span className="text-[13px] font-medium text-slate-700 group-hover:text-slate-900">
                        How to use our app
                      </span>
                    </div>
                    <HiChevronDown 
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                        isGuideOpen ? 'rotate-180 text-emerald-600' : ''
                      }`} 
                    />
                  </button>

                  <AnimatePresence>
                    {isGuideOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden pl-10 pr-1 py-0.5 space-y-0.5"
                      >
                        {guideSubItems.map((sub, sIdx) => {
                          const SubIcon = sub.icon;
                          return (
                            <Link
                              key={sIdx}
                              to={sub.path}
                              onClick={onClose}
                              className="flex items-center gap-2 py-1.5 px-2 text-[12px] text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/70 rounded-md font-medium transition-all"
                            >
                              <SubIcon className="w-3.5 h-3.5 text-slate-400" />
                              <span>{sub.name}</span>
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Other Help Items */}
                {helpMenuItems.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.path);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl transition-all duration-150 group active:scale-[0.99] ${
                        active 
                          ? 'bg-emerald-50 text-emerald-900 font-semibold border border-emerald-100' 
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center transition-all ${
                        active
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[13px] truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Section Divider */}
              <div className="h-px bg-slate-100 my-1 mx-1.5" />
              <p className="text-[9.5px] font-bold tracking-wider uppercase text-slate-400 px-2.5 pt-0.5 pb-0.5">
                Preferences
              </p>

              {/* Preferences Section */}
              <div className="space-y-0.5">
                {accountMenuItems.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.path);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl transition-all duration-150 group active:scale-[0.99] ${
                        active 
                          ? 'bg-emerald-50 text-emerald-900 font-semibold border border-emerald-100' 
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center transition-all ${
                        active
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[13px] truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>

            </div>

            {/* Compact Footer / Logout */}
            <div className="p-3 pt-2 bg-white border-t border-slate-100">
              {user ? (
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-red-50 hover:bg-red-100/90 text-red-600 border border-red-100 rounded-xl transition-all font-semibold text-xs active:scale-[0.98] cursor-pointer shadow-2xs"
                >
                  <HiOutlineLogout className="w-3.5 h-3.5 stroke-[2]" />
                  <span>Logout</span>
                </button>
              ) : (
                <Link
                  to="/user/login"
                  onClick={onClose}
                  className="flex items-center justify-center w-full px-3 py-2.5 text-white rounded-xl font-semibold text-xs shadow-sm shadow-emerald-700/20 active:scale-[0.98]"
                  style={{ background: themeColors.gradient }}
                >
                  Login / Sign Up
                </Link>
              )}
              <div className="mt-1.5 text-center">
                <span className="text-[10px] font-medium text-slate-400">
                  Agroyilt • Farmer Services v2.4
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {createPortal(sidebarContent, document.body)}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => !isLoggingOut && setShowLogoutModal(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
        userName={user?.name}
        role="Farmer"
      />
    </>
  );
};

export default Sidebar;
