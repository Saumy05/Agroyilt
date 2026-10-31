import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { vendorDashboardService } from '../modules/vendor/services/dashboardService';
import maintenanceService from '../modules/vendor/services/maintenanceService';
import { isWithinInterval, parseISO } from 'date-fns';
import { registerFCMToken } from '../services/pushNotificationService';
import { playAlertRing } from '../utils/notificationSound';
import authStorage from '../utils/authStorage';
import { formatRentalReturn } from '../utils/rentalReturn';

const VendorDashboardContext = createContext(null);

const DEFAULT_STATS = {
  todayEarnings: 0,
  activeJobs: 0,
  pendingAlerts: 0,
  totalEarnings: 0,
  completedJobs: 0,
  rating: 0,
  complianceAlerts: [],
  machinesInMaintenance: 0,
};

export const VendorDashboardProvider = ({ children }) => {
  // Helper to safely load initial cached stats
  const getInitialStats = () => {
    try {
      const cached = localStorage.getItem('vendorDashboardStats');
      if (cached && cached !== 'undefined' && cached !== 'null') {
        const parsed = JSON.parse(cached);
        // Basic validation to ensure it's an object with keys
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse cached stats', e);
    }
    return null;
  };

  const getInitialRecentJobs = () => {
    try {
      const cached = localStorage.getItem('vendorDashboardRecentJobs');
      if (cached && cached !== 'undefined' && cached !== 'null') {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error('Failed to parse cached recent jobs', e);
    }
    return [];
  };

  const getInitialProfile = () => {
    try {
      const profile = authStorage.getUserData('vendor') || {};
      return {
        name: profile.name || 'Vendor Name',
        businessName: profile.businessName || 'Business Name',
        photo: profile.profilePhoto || null,
        service: profile.service || []
      };
    } catch (e) {
      return { name: 'Vendor Name', businessName: 'Business Name', photo: null, service: [] };
    }
  };

  // Safely determine initial cache state
  const cachedStats = getInitialStats();
  const hasValidCache = cachedStats !== null;

  const [stats, setStats] = useState(cachedStats || DEFAULT_STATS);
  const [vendorProfile, setVendorProfile] = useState(getInitialProfile);
  const [recentJobs, setRecentJobs] = useState(getInitialRecentJobs);
  const [pendingBookings, setPendingBookings] = useState([]);
  
  // Start with loading = false ONLY if we have a valid cache object
  const [loading, setLoading] = useState(!hasValidCache);
  const [error, setError] = useState(null);
  const [activeAlertBookings, setActiveAlertBookings] = useState([]);
  
  const hasLoadedOnceRef = useRef(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(hasValidCache);

  // Load ignored IDs from localStorage so they survive page refresh
  const ignoredBookingIds = useRef(new Set(
    (() => {
      try {
        const stored = JSON.parse(localStorage.getItem('vendorIgnoredBookingIds') || '[]');
        // Only keep IDs that are less than 30 minutes old to auto-clean
        const recent = stored.filter(entry => Date.now() - entry.ts < 30 * 60 * 1000);
        if (recent.length !== stored.length) {
          localStorage.setItem('vendorIgnoredBookingIds', JSON.stringify(recent));
        }
        return recent.map(entry => entry.id);
      } catch { return []; }
    })()
  ));
  const lastFetchedVendorId = useRef(null);
  const updateTimeoutRef = useRef(null);

  // Helper to get current vendor ID
  const getCurrentVendorId = () => {
    try {
      const vendorData = authStorage.getUserData('vendor') || {};
      return String(vendorData._id || vendorData.id || '');
    } catch {
      return '';
    }
  };

  // Process API response - extracted to avoid duplication
  const processApiResponse = useCallback((response) => {
    if (!response || !response.success || !response.data) {
      console.warn('Dashboard API returned unsuccessful response:', response);
      return;
    }

    const { stats: apiStats, recentBookings } = response.data;

    // Include all bookings in the recent list, but keep the separate filter for stats if needed
    const requestedBookings = (recentBookings || []).filter(booking => {
      const status = booking.status?.toLowerCase();
      return status === 'requested' || status === 'searching';
    });
    
    // We will show ALL bookings in the recent jobs section
    const allBookings = recentBookings || [];

    // Build pending bookings map
    const mergedMap = new Map();
    const vendorId = getCurrentVendorId();

    requestedBookings.forEach(b => {
      const id = String(b._id || b.id);

      // Find distance for this vendor if available
      let distance = null;
      if (b.potentialVendors && vendorId) {
        const potentialVendor = b.potentialVendors.find(pv =>
          String(pv.vendorId?._id || pv.vendorId) === vendorId
        );
        if (potentialVendor && potentialVendor.distance != null) {
          const numDist = Number(potentialVendor.distance);
          distance = numDist < 1 ? `${Math.round(numDist * 1000)} m` : `${numDist.toFixed(1)} km`;
        }
      }

      // Fallback to local storage distance if API didn't provide it
      if (!distance) {
        try {
          const localPending = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
          const localJob = localPending.find(job => String(job.id || job._id) === id);
          if (localJob?.location?.distance && localJob.location.distance !== 'N/A') {
            distance = localJob.location.distance;
          }
        } catch (e) {
          // ignore
        }
      }

      mergedMap.set(id, {
        ...b, // Spread first!
        id,
        serviceType: b.serviceId?.title || 'Service Request',
        customerName: b.userId?.name || 'Farmer',
        location: {
          address: b.address?.addressLine1 || 'Address not available',
          distance: distance
        },
        // Prioritize vendorEarnings, fallback to 90% of finalAmount if finalAmount > 0
        price: (b.vendorEarnings > 0 ? b.vendorEarnings : (b.finalAmount > 0 ? b.finalAmount * 0.9 : 0)).toFixed(2),
        vendorEarnings: b.vendorEarnings, // Ensure it's explicitly passed
        timeSlot: {
          date: new Date(b.scheduledDate).toLocaleDateString(),
          time: (b.scheduledTime || 'Time not set') + (formatRentalReturn(b) ? ` · ${formatRentalReturn(b)}` : '')
        },
        status: b.status
      });
    });

    // Filter out locally ignored bookings
    const finalMap = new Map();
    mergedMap.forEach((value, key) => {
      if (!ignoredBookingIds.current.has(key)) {
        finalMap.set(key, value);
      }
    });

    // Merge with local storage to avoid losing real-time updates that haven't hit API yet
    const localPending = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
    const apiPending = Array.from(finalMap.values());
    const mergedPending = [...apiPending];

    localPending.forEach(localJob => {
      const id = String(localJob.id || localJob._id);
      if (!mergedPending.find(job => String(job.id || job._id) === id) && !ignoredBookingIds.current.has(id)) {
        const createdAt = localJob.createdAt ? new Date(localJob.createdAt).getTime() : Date.now();
        const age = Date.now() - createdAt;
        const lowerStatus = String(localJob.status || '').toLowerCase();
        if (age < 120000 && (lowerStatus === 'requested' || lowerStatus === 'searching')) {
          mergedPending.push(localJob);
        }
      }
    });

    setPendingBookings(mergedPending);
    localStorage.setItem('vendorPendingJobs', JSON.stringify(mergedPending));

    // Auto-trigger modal for fresh pending bookings (app reopen scenario - missed socket event)
    // IMPORTANT: Only trigger once per session (not on every dashboard poll / page refresh)
    const sessionKey = 'vendorAlertShownThisSession';
    const alreadyShownThisSession = sessionStorage.getItem(sessionKey);

    if (!alreadyShownThisSession) {
      const freshPending = mergedPending.filter(b => {
        const id = String(b.id || b._id);
        const createdAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        const age = Date.now() - createdAt;
        // Less than 2 minutes old AND not already ignored/seen
        return age < 120000 && !ignoredBookingIds.current.has(id);
      });
      if (freshPending.length > 0) {
        sessionStorage.setItem(sessionKey, '1'); // Mark as shown for this session
        setActiveAlertBookings(prev => {
          const existingIds = new Set(prev.map(b => String(b.id || b._id)));
          const newOnes = freshPending.filter(b => !existingIds.has(String(b.id || b._id)));
          if (newOnes.length === 0) return prev;
          // Play alarm ring for missed bookings on app reopen
          try { playAlertRing(); } catch (e) { /* Browser may block audio before user interaction */ }
          return [...newOnes, ...prev];
        });
      }
    }

    // Update stats with cache persist
    setStats(prev => {
      const updatedStats = {
        todayEarnings: apiStats?.vendorEarnings || 0,
        activeJobs: apiStats?.inProgressBookings || 0,
        pendingAlerts: mergedPending.length,
        totalEarnings: apiStats?.vendorEarnings || 0,
        completedJobs: apiStats?.completedBookings || 0,
        rating: apiStats?.rating || 0,
        complianceAlerts: apiStats?.complianceAlerts || [],
        machinesInMaintenance: prev.machinesInMaintenance || 0,
        servicePayoutPercentage: apiStats?.servicePayoutPercentage || 70
      };
      localStorage.setItem('vendorDashboardStats', JSON.stringify(updatedStats));
      return updatedStats;
    });

    // Recent jobs with cache persist
    const recentJobsData = allBookings.slice(0, 5).map(booking => ({
      id: booking._id,
      serviceType: booking.serviceId?.title || 'Service',
      customerName: booking.userId?.name || 'Farmer',
      location: booking.address?.addressLine1 || 'Address not available',
      // the vendor's own earning on this booking, worked out by the server (final bill, else an estimate)
      price: Number(booking.vendorEarnings || 0).toFixed(2),
      vendorEarnings: booking.vendorEarnings,
      vendorEarningIsEstimate: Boolean(booking.vendorEarningIsEstimate),
      timeSlot: {
        date: new Date(booking.scheduledDate).toLocaleDateString(),
        time: (booking.scheduledTime || 'Time not set') + (formatRentalReturn(booking) ? ` · ${formatRentalReturn(booking)}` : '')
      },
      status: booking.status,
      assignedTo: booking.workerId ? { name: booking.workerId.name } : null,
    }));
    setRecentJobs(recentJobsData);
    localStorage.setItem('vendorDashboardRecentJobs', JSON.stringify(recentJobsData));

    // Load vendor profile from session safely
    try {
      const profile = authStorage.getUserData('vendor') || {};
      setVendorProfile({
        name: profile.name || 'Vendor Name',
        businessName: profile.businessName || 'Business Name',
        photo: profile.profilePhoto || null,
        service: profile.service || []
      });
    } catch (e) {
      console.error('Failed to parse vendor profile', e);
    }
  }, []);

  // Main data loader
  const loadDashboardData = useCallback(async (showSpinner = true, forceRefresh = false) => {
    const currentVendorId = getCurrentVendorId();

    // Reset cache if vendor changes
    if (lastFetchedVendorId.current !== currentVendorId) {
      lastFetchedVendorId.current = currentVendorId;
      forceRefresh = true;
    }

    // Skip if already loaded and not forced
    if (hasLoadedOnceRef.current && !forceRefresh) {
      return;
    }

    try {
      if (showSpinner) setLoading(true);
      setError(null);

      // Run both API calls in PARALLEL safely
      const [response, maintRes] = await Promise.allSettled([
        vendorDashboardService.getDashboardStats(),
        maintenanceService.getSchedules()
      ]);

      if (response.status === 'fulfilled') {
        processApiResponse(response.value);
      } else {
        throw new Error(response.reason || 'Failed to fetch stats');
      }

      let activeMaintenanceCount = 0;
      if (maintRes.status === 'fulfilled') {
        activeMaintenanceCount = (maintRes.value.data || []).filter(m =>
          isWithinInterval(new Date(), {
            start: parseISO(m.startDate),
            end: parseISO(m.endDate)
          })
        ).length;

        setStats(prev => {
          const updatedStats = {
            ...prev,
            machinesInMaintenance: activeMaintenanceCount
          };
          localStorage.setItem('vendorDashboardStats', JSON.stringify(updatedStats));
          return updatedStats;
        });
      }
      
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    } catch (err) {
      console.error('Error loading dashboard data in context:', err);
      // Only set error if we don't have valid cached data
      if (!hasLoadedOnceRef.current) {
        setError(String(err.message || 'Failed to load dashboard data'));
      }
    } finally {
      setLoading(false);
    }
  }, [processApiResponse]);

  // Handle socket / background updates
  const handleUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      console.log('🔄 Dashboard Context: Refreshing data due to real-time update event');
      loadDashboardData(false, true); // Don't show spinner, but do a background force-refresh
    }, 500);
  }, [loadDashboardData]);

  // Initial load when context mounts
  useEffect(() => {
    const token = authStorage.getAccessToken('vendor');
    if (token) {
      // Check cache again defensively to prevent missing data
      const cachedStr = localStorage.getItem('vendorDashboardStats');
      const hasValidCacheData = cachedStr && cachedStr !== 'undefined' && cachedStr !== 'null';
      
      // If we don't have cache, show spinner. Otherwise, silent background fetch.
      loadDashboardData(!hasValidCacheData, false);
    }
  }, [loadDashboardData]);

  // Handle event listeners for real-time updates and push notifications
  useEffect(() => {
    // DELAY NOTIFICATION PERMISSION REQUEST BY 5 SECONDS
    // This prevents iOS WebView from blocking/hanging the initial dashboard render 
    // and avoids App Store rejection for immediate permission requests.
    const fcmTimer = setTimeout(() => {
      registerFCMToken('vendor', true).catch(err => console.error('FCM registration failed:', err));
    }, 5000);

    const handleShowAlert = (e) => {
      if (e.detail) {
        // Clear session flag so this real-time booking is always shown
        sessionStorage.removeItem('vendorAlertShownThisSession');
        setActiveAlertBookings(prev => {
          if (prev.find(b => String(b.id || b._id) === String(e.detail.id || e.detail._id))) return prev;
          return [e.detail, ...prev];
        });
        setPendingBookings(prev => {
          if (prev.find(b => b.id === e.detail.id)) return prev;
          return [e.detail, ...prev];
        });
      }
    };

    const handleRemoveBooking = (e) => {
      if (e.detail?.id) {
        const idToRemove = String(e.detail.id);

        ignoredBookingIds.current.add(idToRemove);

        // Persist ignored IDs to localStorage so page refresh doesn't bring them back
        try {
          const stored = JSON.parse(localStorage.getItem('vendorIgnoredBookingIds') || '[]');
          if (!stored.find(e => e.id === idToRemove)) {
            stored.push({ id: idToRemove, ts: Date.now() });
            localStorage.setItem('vendorIgnoredBookingIds', JSON.stringify(stored));
          }
        } catch (e) { /* ignore */ }

        setPendingBookings(prev => prev.filter(b => String(b.id || b._id) !== idToRemove));
        setActiveAlertBookings(prev => prev.filter(b => String(b.id || b._id) !== idToRemove));
        setRecentJobs(prev => prev.filter(b => String(b.id || b._id) !== idToRemove));

        // Also remove from localStorage so it doesn't reappear on next app open
        try {
          const localPending = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
          const updated = localPending.filter(b => String(b.id || b._id) !== idToRemove);
          localStorage.setItem('vendorPendingJobs', JSON.stringify(updated));
          // Also clear the alert timer key so the countdown doesn't re-trigger
          localStorage.removeItem(`alert_start_${idToRemove}`);
        } catch (e) {
          console.error('Failed to update localStorage on booking removal', e);
        }
      }
    };

    window.addEventListener('vendorJobsUpdated', handleUpdate);
    window.addEventListener('vendorStatsUpdated', handleUpdate);
    window.addEventListener('showDashboardBookingAlert', handleShowAlert);
    window.addEventListener('removeVendorBooking', handleRemoveBooking);

    return () => {
      clearTimeout(fcmTimer); // Clear timer on unmount
      window.removeEventListener('vendorJobsUpdated', handleUpdate);
      window.removeEventListener('vendorStatsUpdated', handleUpdate);
      window.removeEventListener('showDashboardBookingAlert', handleShowAlert);
      window.removeEventListener('removeVendorBooking', handleRemoveBooking);
    };
  }, [handleUpdate]);

  // USEMEMO OPTIMIZATION: Prevent unnecessary re-renders of child components
  const contextValue = useMemo(() => ({
    stats,
    vendorProfile,
    recentJobs,
    pendingBookings,
    loading,
    error,
    activeAlertBookings,
    setActiveAlertBookings,
    setPendingBookings,
    setRecentJobs,
    loadDashboardData,
    hasLoadedOnce
  }), [
    stats, 
    vendorProfile, 
    recentJobs, 
    pendingBookings, 
    loading, 
    error, 
    activeAlertBookings, 
    hasLoadedOnce, 
    loadDashboardData
  ]);

  return (
    <VendorDashboardContext.Provider value={contextValue}>
      {children}
    </VendorDashboardContext.Provider>
  );
};

export const useVendorDashboard = () => {
  const context = useContext(VendorDashboardContext);
  if (!context) {
    throw new Error('useVendorDashboard must be used within a VendorDashboardProvider');
  }
  return context;
};


