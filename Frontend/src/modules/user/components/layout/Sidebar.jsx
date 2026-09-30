import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { 
  HiX, 
  HiOutlineHome, 
  HiOutlineClipboardList, 
  HiOutlineCreditCard,
  HiOutlineGift,
  HiOutlineUser,
  HiOutlineCog,
  HiOutlineQuestionMarkCircle,
  HiOutlineInformationCircle,
  HiOutlineShieldCheck,
  HiOutlineLogout
} from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';
import { themeColors } from '../../../../theme';
import { userAuthService } from '../../../../services/authService';
import authStorage from '../../../../utils/authStorage';
import { LogoutModal } from '../../../../components/common';

const Sidebar = ({ isOpen, onClose }) => {
  const [user, setUser] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

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

  const menuItems = [
    { name: 'Home', path: '/user/dashboard', icon: HiOutlineHome },
    { name: 'About Us', path: '/user/about-groo', icon: HiOutlineInformationCircle },
    { 
      name: 'How to use our app', 
      icon: HiOutlineInformationCircle,
      path: '/user/how-to-use',
      children: [
        { name: 'Video Guide', path: '/user/how-to-use?type=video' },
        { name: 'Image Guide', path: '/user/how-to-use?type=image' },
        { name: 'PDF Guide', path: '/user/how-to-use?type=pdf' },
      ]
    },
    { name: 'FAQ', path: '/user/faq', icon: HiOutlineQuestionMarkCircle },
    { name: 'Help & Support', path: '/user/help-support', icon: HiOutlineQuestionMarkCircle },
    { name: 'Settings', path: '/user/settings', icon: HiOutlineCog },
  ];

  const sidebarContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
          />

          {/* Sidebar */}
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-0 left-0 bottom-0 w-3/4 max-w-sm bg-white z-[60] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Elegant Header Area */}
            <div 
              className="px-6 pt-12 pb-8 relative overflow-hidden"
              style={{ background: themeColors.gradient }}
            >
              {/* Subtle abstract shapes for premium look */}
              <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl"></div>
                <div className="absolute bottom-0 left-[-20%] w-32 h-32 rounded-full bg-white blur-2xl"></div>
              </div>

              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-white/20 backdrop-blur-md rounded-full hover:bg-white/30 transition-all border border-white/20"
              >
                <HiX className="w-4 h-4 text-white" />
              </button>

              <div className="relative z-10 flex flex-col gap-5">
                <div className="w-16 h-16 rounded-full bg-white/20 p-[2px] shadow-lg shadow-black/10">
                  <div className="w-full h-full bg-white rounded-full flex items-center justify-center overflow-hidden">
                    {user?.profilePhoto ? (
                      <img src={user.profilePhoto} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <span 
                        className="text-2xl font-bold text-transparent bg-clip-text"
                        style={{ backgroundImage: themeColors.gradient }}
                      >
                        {user?.name?.charAt(0) ?.toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-wide">{user?.name || 'Guest User'}</h2>
                  <p className="text-white/80 text-sm mt-1 font-medium tracking-wide">{user?.phone || 'Login to access features'}</p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto py-6 px-4 custom-scrollbar bg-white">
              <div className="space-y-1.5">
                {menuItems.map((item, index) => {
                  if (item.type === 'divider') {
                    return <div key={`divider-${index}`} className="h-px bg-slate-100 my-5 mx-2" />;
                  }

                  const Icon = item.icon;
                  
                  if (item.children) {
                    return (
                      <div key={index} className="flex flex-col">
                        <button
                          onClick={() => {
                            const el = document.getElementById(`submenu-${index}`);
                            if (el) {
                              el.classList.toggle('hidden');
                              const arrow = document.getElementById(`arrow-${index}`);
                              if (arrow) arrow.classList.toggle('rotate-180');
                            }
                          }}
                          className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl text-slate-600 hover:bg-[#F1F8E9] hover:text-[#2E7D32] transition-all active:scale-[0.98] group"
                        >
                          <div className="flex items-center gap-4">
                            <Icon className="w-5 h-5 text-slate-400 group-hover:text-[#2E7D32] transition-colors" />
                            <span className="font-medium text-[15px]">{item.name}</span>
                          </div>
                          <svg id={`arrow-${index}`} className="w-4 h-4 text-slate-400 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <div id={`submenu-${index}`} className="hidden pl-12 pr-3 py-1 space-y-1">
                          {item.children.map((child, cIdx) => (
                            <Link
                              key={cIdx}
                              to={child.path}
                              onClick={onClose}
                              className="block py-2 text-[14px] text-slate-500 hover:text-[#2E7D32] font-medium transition-colors"
                            >
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={index}
                      to={item.path}
                      onClick={onClose}
                      className="flex items-center gap-4 px-3 py-3.5 rounded-xl text-slate-600 hover:bg-[#F1F8E9] hover:text-[#2E7D32] transition-all active:scale-[0.98] group"
                    >
                      <Icon className="w-5 h-5 text-slate-400 group-hover:text-[#2E7D32] transition-colors" />
                      <span className="font-medium text-[15px]">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Footer / Logout */}
            <div className="p-5 bg-white border-t border-slate-100">
              {user ? (
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3.5 bg-red-50/80 text-red-600 hover:bg-red-100/80 rounded-xl transition-colors font-semibold active:scale-[0.98] cursor-pointer"
                >
                  <HiOutlineLogout className="w-5 h-5 stroke-[2]" />
                  Logout
                </button>
              ) : (
                <Link
                  to="/user/login"
                  onClick={onClose}
                  className="flex items-center justify-center w-full px-4 py-3.5 text-white rounded-xl font-semibold shadow-lg shadow-[#2E7D32]/25 active:scale-[0.98]"
                  style={{ background: themeColors.gradient }}
                >
                  Login / Sign Up
                </Link>
              )}
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
