import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FiArrowLeft, FiShoppingCart, FiTrash2, FiMinus, FiPlus, FiPhone, FiHome, FiClock, FiEdit2, FiCheckCircle, FiInfo, FiCreditCard, FiDollarSign } from 'react-icons/fi';
import { MdStar } from 'react-icons/md';
import { toastManager } from '../../../../utils/toastManager';
import { themeColors } from '../../../../theme';
import AddressSelectionModal from './components/AddressSelectionModal';
import TimeSlotModal from './components/TimeSlotModal';
import VendorSearchModal from './components/VendorSearchModal';
import { bookingService } from '../../../../services/bookingService';
import { paymentService } from '../../../../services/paymentService';
import { cartService } from '../../../../services/cartService';
import { configService } from '../../../../services/configService';
import { publicCatalogService } from '../../../../services/catalogService';
import { getPlans } from '../../services/planService';
import { userAuthService } from '../../../../services/authService';
import authStorage from '../../../../utils/authStorage';
import { useCart } from '../../../../context/CartContext';
import LiveBookingCard from '../../components/booking/LiveBookingCard';
import RentalTypeCard from './components/RentalTypeCard';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const category = location.state?.category || null;
  const plan = location.state?.plan || null;
  const { fetchCart: fetchCartGlobal, clearCart: clearCartGlobal, removeCategoryItems: removeCategoryGlobal } = useCart();

  const [cartItems, setCartItems] = useState([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showTimeSlotModal, setShowTimeSlotModal] = useState(false);
  const [address, setAddress] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [addressDetails, setAddressDetails] = useState(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [userPhone, setUserPhone] = useState('');

  // Custom Contact State (for this booking only)
  const [contactDetails, setContactDetails] = useState({ name: '', phone: '' });
  const [showContactModal, setShowContactModal] = useState(false);

  // New state for vendor search flow
  const [currentStep, setCurrentStep] = useState('details'); // 'details' | 'searching' | 'waiting' | 'accepted' | 'payment'
  const [acceptedVendor, setAcceptedVendor] = useState(null);
  const [bookingRequest, setBookingRequest] = useState(null);
  const [searchingVendors, setSearchingVendors] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('online'); // 'online' | 'pay_at_home'
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false); // Payment confirmation modal

  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const [selectedTime, setSelectedTime] = useState(null);
  const [visitedFee, setVisitedFee] = useState(0);
  const [gstPercentage, setGstPercentage] = useState(18);
  const [rentalGstPercentage, setRentalGstPercentage] = useState(5);
  const [bookingType, setBookingType] = useState('instant'); // 'instant' | 'scheduled'
  // ── Agriculture: Rental Type State (pre-filled from Cart navigation state) ──
  const [rentalType, setRentalType] = useState(location.state?.rentalType || 'hourly'); // 'hourly' | 'land_based' | 'daily'
  const [cropType, setCropType] = useState('');           // Agriculture: crop type
  const [chemicalUsed, setChemicalUsed] = useState('');   // Agriculture: chemical for drone spraying
  const [landSize, setLandSize] = useState(1);           // Agriculture: area in acres
  const [endDate, setEndDate] = useState(null);           // Agriculture: end date for ranges
  const [estimatedDuration, setEstimatedDuration] = useState(1); // Agriculture: hours for hourly
  const [localDays, setLocalDays] = useState(1);         // Agriculture: days for daily


  // Check if Razorpay is loaded (defer to avoid blocking initial render)
  useEffect(() => {
    // Defer Razorpay check until after page load
    const checkRazorpay = () => {
      if (window.Razorpay) {
        setRazorpayLoaded(true);
      } else {
        // Retry after a short delay (non-blocking)
        setTimeout(checkRazorpay, 100);
      }
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (window.requestIdleCallback) {
      window.requestIdleCallback(checkRazorpay, { timeout: 200 });
    } else {
      setTimeout(checkRazorpay, 100);
    }
  }, []);

  // Load user data once on mount
  useEffect(() => {
    const loadUserData = () => {
      try {
        const userData = authStorage.getUserData('user');
        if (userData) {
          if (userData.phone) {
            setUserPhone(userData.phone);
          }
          // Initialize contact details for editing
          setContactDetails({
            name: userData.name || '',
            phone: userData.phone || ''
          });
        }
      } catch (err) {
        console.error("Failed to parse user data:", err);
      }
    };
    loadUserData();

    // Refresh on focus
    window.addEventListener('focus', loadUserData);
    return () => window.removeEventListener('focus', loadUserData);
  }, []);

  // Main Initialization Effect
  useEffect(() => {
    let active = true;

    // Safety timeout: Ensure loading finishes eventually
    const safetyTimeout = setTimeout(() => {
      if (active) setLoading(false);
    }, 5000);

    const initializeData = async () => {
      try {
        if (active) setLoading(true);

        // Pre-initialize config and profile in parallel
        const [configRes, profileRes] = await Promise.allSettled([
          configService.getSettings(),
          userAuthService.getProfile()
        ]);

        if (!active) return;

        // Apply config
        if (configRes.status === 'fulfilled' && configRes.value.success) {
          const settings = configRes.value.settings;
          if (!plan) setVisitedFee(settings.visitedCharges !== undefined ? settings.visitedCharges : 0);
          else setVisitedFee(0);
          setGstPercentage(settings.serviceGstPercentage || 18);
          setRentalGstPercentage(settings.rentalGstPercentage !== undefined ? settings.rentalGstPercentage : 5);
        }

        // Apply profile / addresses
        if (profileRes.status === 'fulfilled' && profileRes.value.success && profileRes.value.user?.addresses?.length > 0) {
          const addresses = profileRes.value.user.addresses;
          const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
          setAddress(defaultAddr.addressLine1);
          setHouseNumber(defaultAddr.addressLine2 || '');
          setAddressDetails({
            address: defaultAddr.addressLine1,
            lat: defaultAddr.lat,
            lng: defaultAddr.lng,
            type: defaultAddr.type,
            city: defaultAddr.city,
            state: defaultAddr.state,
            pincode: defaultAddr.pincode
          });
        }

        // Handle Plan vs Cart
        if (plan) {
          setCartItems([{
            id: plan.id,
            name: plan.name,
            price: plan.price,
            description: plan.description,
            isPlan: true,
            serviceCount: 1
          }]);
        } else {
          const cartRes = await cartService.getCart();
          if (active && cartRes.success) {
            let items = cartRes.data || [];
            if (category) {
              const normalizedCategory = category.toLowerCase().trim();
              items = items.filter(item => {
                const itemCat = (item.category || item.categoryTitle || 'Other').toLowerCase().trim();
                return itemCat === normalizedCategory;
              });
            }
            setCartItems(items);
            
            // Auto-select date/time if exists in cart
            const itemWithSlot = items.find(i => i.scheduledDate || i.timeSlot);
            if (itemWithSlot) {
              if (itemWithSlot.scheduledDate) setSelectedDate(new Date(itemWithSlot.scheduledDate));
              if (itemWithSlot.timeSlot) setSelectedTime(itemWithSlot.timeSlot.id || itemWithSlot.timeSlot.start);
              setBookingType('scheduled');
            }
          }
        }
      } catch (error) {
        console.error("Checkout Initialization Failed:", error);
      } finally {
        if (active) setLoading(false);
        clearTimeout(safetyTimeout);
      }
    };

    initializeData();

    return () => {
      active = false;
      clearTimeout(safetyTimeout);
    };
  }, [category, plan]);

  const cartCount = cartItems.length;

  const handleBack = () => {
    navigate(-1);
  };

  const handleQuantityChange = async (itemId, change) => {
    try {
      const item = cartItems.find(i => (i._id || i.id) === itemId);
      if (!item) return;

      const newCount = Math.max(1, (item.serviceCount || 1) + change);
      const response = await cartService.updateItem(itemId, newCount);

      if (response.success) {
        // Refresh global cart badge
        fetchCartGlobal();

        // Reload cart and filter by category
        const cartResponse = await cartService.getCart();
        if (cartResponse.success) {
          let items = cartResponse.data || [];
          if (category) {
            const normalizedCategory = category.toLowerCase().trim();
            items = items.filter(item => {
              const itemCat = (item.category || 'Other').toLowerCase().trim();
              return itemCat === normalizedCategory;
            });
          }
          setCartItems(items);
        }
      } else {
        toastManager.error(response.message || 'Failed to update quantity');
      }
    } catch (error) {
      toastManager.error('Failed to update quantity');
    }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      const response = await cartService.removeItem(itemId);
      if (response.success) {
        toastManager.success('Item removed');
        // Refresh global cart badge
        fetchCartGlobal();
        loadCart();
      } else {
        toastManager.error(response.message || 'Failed to remove item');
      }
    } catch (error) {
      toastManager.error('Failed to remove item');
    }
  };



  const getAddressComponent = (type) => {
    return addressDetails?.components?.find(c => c.types.includes(type)) ?.long_name || '';
  };

  const handleProceed = async () => {
    // Validation
    if (bookingType === 'instant') {
      if (!addressDetails) {
        setShowAddressModal(true);
        return;
      }
    } else {
      const needsTime = rentalType === 'hourly' || rentalType === 'land_based' || rentalType === 'daily';
      if (!addressDetails || !selectedDate || (needsTime && !selectedTime)) {
        if (!addressDetails) setShowAddressModal(true);
        else if (!selectedDate || (needsTime && !selectedTime)) setShowTimeSlotModal(true);
        return;
      }
    }

    try {
      setSearchingVendors(true);
      setShowVendorModal(true);
      setCurrentStep('searching');

      // Add a small delay for realistic searching animation
      await new Promise(resolve => setTimeout(resolve, 3000));

      const firstItem = cartItems[0];
      if (!firstItem) {
        toastManager.error('Your cart is empty');
        return;
      }
      const serviceId = typeof firstItem.serviceId === 'object'
        ? firstItem.serviceId._id || firstItem.serviceId.id
        : firstItem.serviceId;

      const bookedItemsData = cartItems.map(item => ({
        brandName: item.sectionTitle || item.brand || '',
        brandIcon: item.sectionIcon || null,
        card: {
          title: item.card?.title || item.title,
          subtitle: item.card?.subtitle || item.description || '',
          price: (() => {
            const svcO = item.serviceId && typeof item.serviceId === 'object' ? item.serviceId : item;
            if (rentalType === 'daily') return svcO.daily_price || item.daily_price || item.price || 0;
            if (rentalType === 'land_based') return svcO.land_price || item.land_price || item.price || 0;
            if (rentalType === 'monthly') return svcO.monthly_price || svcO.daily_price || item.monthly_price || item.daily_price || item.price || 0;
            return svcO.hourly_price || item.hourly_price || item.price || 0;
          })(),
          originalPrice: item.card?.originalPrice || item.originalPrice || null,
          duration: item.card?.duration || item.duration || '',
          description: item.card?.description || item.description || '',
          imageUrl: item.card?.imageUrl || item.icon || '',
          features: item.card?.features || []
        },
        quantity: item.serviceCount || 1
      }));

      // Calculate Scheduled Data for Instant
      let finalDate = selectedDate;
      let finalTime = selectedTime;
      let finalTimeSlot = {
        start: selectedTime,
        end: getTimeSlots().find(slot => slot.value === selectedTime) ?.end || selectedTime
      };

      if (bookingType === 'instant') {
        const now = new Date();
        finalDate = now;
        finalTime = "ASAP";
        finalTimeSlot = { start: "Now", end: "45 mins", isInstant: true };
      } else if (rentalType === 'daily' || rentalType === 'monthly' || rentalType === 'land_based') {
        finalTime = 'Full Day';
        finalTimeSlot = { start: '00:00', end: '23:59', isFullDay: true };
      }

      const response = await bookingService.create({
        bookingType, // 'instant' or 'scheduled'
        serviceId,
        address: {
          type: addressDetails?.type || 'home',
          addressLine1: addressDetails?.addressLine1 || address,
          addressLine2: houseNumber,
          city: addressDetails?.city || getAddressComponent('locality') || getAddressComponent('administrative_area_level_2') || 'City',
          state: addressDetails?.state || getAddressComponent('administrative_area_level_1') || 'State',
          pincode: addressDetails?.pincode || getAddressComponent('postal_code') || '000000',
          lat: addressDetails?.lat,
          lng: addressDetails?.lng
        },
        scheduledDate: finalDate, // Date object
        scheduledTime: bookingType === 'instant' ? "ASAP" : (getTimeSlots().find(slot => slot.value === finalTime) ?.display || finalTime),
        timeSlot: finalTimeSlot,
        amount: amountToPay,

        // Pass Full Breakdown to Backend
        basePrice: totalOriginalPrice,
        discount: savings,
        tax: taxesAndFee,
        visitationFee: finalVisitedFee,

        // Metadata for better data capture
        serviceCategory: firstItem.categoryTitle || firstItem.category || 'General',
        categoryIcon: firstItem.categoryIcon || firstItem.icon || null,
        brandName: firstItem.sectionTitle || firstItem.brand || '',
        brandIcon: firstItem.sectionIcon || null,

        contactDetails: {
          name: contactDetails.name,
          phone: contactDetails.phone.length === 10 && !contactDetails.phone.includes('+') ? `+91${contactDetails.phone}` : contactDetails.phone
        },

        paymentMethod: paymentMethod === 'online' ? 'online' : 'pay_at_home',
        rental_type: rentalType,
        bookedItems: bookedItemsData,
        
        // --- AGRICULTURE SPECIFIC ---
        landSize: landSize || 1,
        cropType: cropType || '',
        chemicalUsed: chemicalUsed || '',
        estimatedDuration: estimatedDuration || 1,
        selectedImplements: selectedImplements.map(impl => ({
          subCategoryId: impl._id,
          title: impl.title,
          pricing: impl.pricing || {}
        }))
      });

      if (response.success) {
        setBookingRequest(response.data);

        // If the backend returns an assigned vendor immediately (rare but possible)
        if (response.data.vendorId && (response.data.status === 'ACCEPTED' || response.data.status === 'ASSIGNED')) {
          setCurrentStep('accepted');
          setAcceptedVendor({
            ...(response.data.vendorId || {}),
            price: response.data.finalAmount || amountToPay,
            distance: 'within 5km', // default
            estimatedTime: '15-30 min'
          });
          setSearchingVendors(false); // Finished search
        } else if (response.paymentRequired) {
          // Online booking: the vendor is alerted only after the payment is verified
          await handleOnlinePayment(response.data);
        } else {
          // Normal flow: Entered pooling/searching
          setCurrentStep('waiting'); // Waiting for vendor acceptance
          // Keep searchingVendors = true to disable buttons and show progress
        }
      }
    } catch (error) {
      toastManager.error('Failed to initiate booking request. Please try again.');
      setShowVendorModal(false);
      setSearchingVendors(false);
    }
  };


  // Listen for real-time vendor acceptance
  useEffect(() => {
    if (currentStep !== 'waiting' || !bookingRequest) return;

    const socketUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';
    const socket = io(socketUrl, {
      auth: { token: authStorage.getAccessToken('user') },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
    });

    socket.on('connect_error', (err) => {
    });

    socket.on('booking_accepted', (data) => {
      if (data.bookingId === bookingRequest._id) {

        // Construct vendor object from event data
        // Note: Real backend should send full details, falling back to defaults for display
        const vendorData = {
          id: data.vendor.id,
          name: data.vendor.name || 'Vendor',
          businessName: data.vendor.businessName || 'Service Provider',
          rating: 4.8, // Default if not sent
          distance: 'Nearby', // Default if not sent
          estimatedTime: '15-20 mins',
          price: bookingRequest.amount
        };

        setAcceptedVendor(vendorData);
        setCurrentStep('accepted');
        setSearchingVendors(false);
        toastManager.success(`${vendorData.businessName} accepted your booking!`, { id: `booking_accepted:${data.bookingId}` });

        // Close modal after 2 seconds and navigate to confirmation
        setTimeout(() => {
          setShowVendorModal(false);
          navigate(`/user/booking-confirmation/${bookingRequest._id}`, {
            replace: true
          });
        }, 2000);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentStep, bookingRequest]);

  // Search for nearby vendors
  const handleSearchVendors = async () => {
    try {
      // Validate required fields
      if (bookingType === 'scheduled') {
        // daily/land_based/monthly: only date required (no time selection needed)
        const needsTime = rentalType === 'hourly';
        if (!selectedDate || (needsTime && !selectedTime)) {
          toastManager.error('Please select date & time slot');
          setShowTimeSlotModal(true);
          return;
        }
        if (!addressDetails) {
          toastManager.error('Please select address');
          return;
        }
      } else {
        // Instant
        if (!addressDetails) {
          toastManager.error('Please select address');
          return;
        }
      }

      if (cartItems.length === 0 && !bookingRequest) {
        toastManager.error('Cart is empty');
        return;
      }

      // Open modal and start searching
      setShowVendorModal(true);
      setCurrentStep('searching');
      setSearchingVendors(true);

      // Get first service
      const firstItem = cartItems[0];
      if (!firstItem.serviceId) {
        toastManager.error('Service information missing. Please try again.');
        setCurrentStep('details');
        setSearchingVendors(false);
        setShowVendorModal(false);
        return;
      }

      // Prepare address object
      const addressObj = {
        type: 'home',
        addressLine1: address,
        addressLine2: houseNumber,
        city: addressDetails?.city || getAddressComponent('locality') || getAddressComponent('administrative_area_level_2') || 'City',
        state: addressDetails?.state || getAddressComponent('administrative_area_level_1') || 'State',
        pincode: addressDetails?.pincode || getAddressComponent('postal_code') || '123456',

        landmark: addressDetails?.landmark || '',
        lat: addressDetails?.lat || null,
        lng: addressDetails?.lng || null
      };

      // Prepare time slot
      let finalDate = selectedDate;
      let finalTimeDisplay = selectedTime;
      let timeSlotObj = {
        start: selectedTime,
        end: getTimeSlots().find(slot => slot.value === selectedTime) ?.end || selectedTime
      };

      if (rentalType === 'daily' || rentalType === 'monthly' || rentalType === 'land_based') {
        finalTimeDisplay = 'Full Day';
        timeSlotObj = { 
          start: '00:00', 
          end: '23:59',
          isFullDay: true
        };
      } else if (bookingType === 'instant') {
        finalDate = new Date();
        finalTimeDisplay = "ASAP";
        timeSlotObj = { start: "Now", end: "45 mins", isInstant: true };
      } else {
        finalTimeDisplay = getTimeSlots().find(slot => slot.value === selectedTime) ?.display || selectedTime;
      }

      // Create booking request
      toastManager.info(isWorkerBooking ? 'Searching for nearby workers...' : 'Searching for nearby vendors...');

      // Ensure serviceId is a string (handle populated cart data)
      const serviceId = typeof firstItem.serviceId === 'object'
        ? firstItem.serviceId._id || firstItem.serviceId.id
        : firstItem.serviceId;

      // Prepare bookedItems array matching Service catalog structure
      // Prepare bookedItems array matching Service catalog structure
      // Prepare bookedItems array highlighting different item types
      const bookedItemsData = cartItems.map(item => ({
        brandName: item.sectionTitle || item.brand || '',
        brandIcon: item.sectionIcon || null,
        card: {
          title: item.title || 'Unknown Service',
          subtitle: item.description || '',
          price: (() => {
            const svcO = item.serviceId && typeof item.serviceId === 'object' ? item.serviceId : item;
            if (rentalType === 'daily') return svcO.daily_price || item.daily_price || item.price || 0;
            if (rentalType === 'land_based') return svcO.land_price || item.land_price || item.price || 0;
            if (rentalType === 'monthly') return svcO.monthly_price || svcO.daily_price || item.monthly_price || item.daily_price || item.price || 0;
            return svcO.hourly_price || item.hourly_price || item.price || 0;
          })(),
          originalPrice: item.originalPrice || null,
          duration: item.duration || '',
          description: item.description || '',
          imageUrl: item.icon || '',
          features: item.features || []
        },
        quantity: item.serviceCount || 1,
        serviceId: item.serviceId?._id || item.serviceId?.id || item.serviceId,
        pricing_context: item.pricing_context || 'any'
      }));

      // Identify implements (sub-categories) to pass separately for Agri logic
      const selectedImplementsFromCart = cartItems
        .filter(item => item.pricing_context === 'sub-category')
        .map(impl => ({
          subCategoryId: impl.serviceId?._id || impl.serviceId?.id || impl.serviceId,
          title: impl.title,
          pricing: {
            hourly: { price: impl.hourly_price, isEnabled: !!impl.hourly_price },
            land_based: { price: impl.land_price, isEnabled: !!impl.land_price },
            daily: { price: impl.daily_price, isEnabled: !!impl.daily_price }
          }
        }));

      const bookingResponse = await bookingService.create({
        bookingType, // 'instant' or 'scheduled'
        serviceId: serviceId,
        address: addressObj,
        scheduledDate: (finalDate || new Date()).toISOString(),
        scheduledTime: finalTimeDisplay,
        timeSlot: timeSlotObj,
        paymentMethod: amountToPay === 0 ? 'plan_benefit' : (paymentMethod === 'online' ? 'online' : 'pay_at_home'),
        rental_type: rentalType,
        cropType,
        chemicalUsed,
        landSize,
        endDate: (rentalType === 'monthly' || rentalType === 'daily') && endDate ? endDate.toISOString() : undefined,
        estimatedDuration: rentalType === 'hourly' ? (Number(estimatedDuration) || undefined) : (['daily', 'monthly'].includes(rentalType) ? (Number(localDays) || undefined) : undefined),
        amount: amountToPay,

        // Pass Full Breakdown to Backend
        basePrice: totalOriginalPrice,
        discount: savings,
        tax: taxesAndFee,
        visitationFee: finalVisitedFee,

        // Metadata for better data capture
        serviceCategory: firstItem.categoryTitle || firstItem.category || 'Agriculture',
        categoryIcon: firstItem.categoryIcon || firstItem.icon || null,
        brandName: firstItem.sectionTitle || firstItem.brand || '',
        brandIcon: firstItem.sectionIcon || null,

        bookedItems: bookedItemsData,
        selectedImplements: selectedImplementsFromCart
      });

      if (!bookingResponse.success) {
        toast.dismiss();
        toastManager.error(bookingResponse.message || (isWorkerBooking ? 'Failed to search for workers' : 'Failed to search for vendors'));
        setCurrentStep('details');
        setSearchingVendors(false);
        setShowVendorModal(false);
        return;
      }

      const booking = bookingResponse.data;
      setBookingRequest(booking);
      toast.dismiss();

      // Clear cart immediately as search starts (consumes items) - ONLY if vendors found
      if (!bookingResponse.noVendorsFound) {
        try {
          if (category) {
            await removeCategoryGlobal(category);
          } else {
            await clearCartGlobal();
          }
          setCartItems([]);
        } catch (err) {
          console.error('Failed to clear cart after search start', err);
        }
      }

      // If no vendors found, redirect to confirmation page immediately
      if (bookingResponse.noVendorsFound) {
        toast.dismiss();
        const bookingId = booking?._id || booking?.id;

        // Ensure we stop searching and close the modal
        setSearchingVendors(false);
        setShowVendorModal(false);

        if (bookingId) {
          navigate(`/user/booking/${bookingId}`, {
            replace: true,
            state: { noVendorsFound: true }
          });
        } else {
          // Fallback if ID is missing for some reason
          setCurrentStep('details');
          toastManager.error('Booking created but ID missing. Check My Bookings.');
        }
      } else if (bookingResponse.paymentRequired) {
        // Online booking: the vendor is alerted only after the payment is verified
        await handleOnlinePayment(booking);
      } else {
        // Move to waiting state - alerts sent to nearby vendors
        setCurrentStep('waiting');
        toastManager.success(isWorkerBooking ? 'Finding nearby workers... Alerts sent to workers within 10km!' : 'Finding nearby vendors... Alerts sent to vendors within 10km!');
      }

      // REMOVED local setCartItems([]) - The summary should remain visible while searching
      // The cart is already cleared in server database by the backend and previous API call.

    } catch (error) {
      toast.dismiss();
      console.error('Search vendors error:', error);
      toastManager.error(isWorkerBooking ? 'Failed to search for workers. Please try again.' : 'Failed to search for vendors. Please try again.');
      setCurrentStep('details');
      setSearchingVendors(false);
      setShowVendorModal(false);
    }
  };

  // Proceed to payment after vendor acceptance
  const handleOnlinePayment = async (heldBooking = null) => {
    // heldBooking: a just-created online booking whose request reaches the vendor only after this payment
    const target = heldBooking || bookingRequest;
    const bail = () => {
      if (!heldBooking) return;
      setSearchingVendors(false);
      setShowVendorModal(false);
      navigate(`/user/booking/${heldBooking._id}`, { replace: true });
    };
    try {
      if (!target || (!heldBooking && !acceptedVendor)) {
        toastManager.error('No vendor selected or booking not created');
        return;
      }

      // Create Razorpay order
      toastManager.info('Creating payment order...');
      const orderResponse = await paymentService.createOrder(target._id);

      if (!orderResponse.success) {
        toast.dismiss();
        toastManager.error(orderResponse.message || 'Failed to create payment order');
        bail();
        return;
      }

      toast.dismiss();

      // Get Razorpay key
      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        toastManager.error('Razorpay key not configured');
        bail();
        return;
      }

      if (!window.Razorpay) {
        toastManager.error('Razorpay SDK not loaded');
        bail();
        return;
      }

      const options = {
        key: razorpayKey,
        amount: orderResponse.data.amount * 100,
        currency: orderResponse.data.currency || 'INR',
        order_id: orderResponse.data.orderId,
        name: 'Groo',
        description: `Payment for ${target.serviceName || 'service'}`,
        handler: async function (response) {
          try {
            toastManager.info('Verifying payment...');
            const verifyResponse = await paymentService.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            toast.dismiss();

            if (verifyResponse.success) {
              toastManager.success('Payment successful!');

              // Clear cart (or just category items)
              try {
                if (category) {
                  await removeCategoryGlobal(category);
                } else {
                  await clearCartGlobal();
                }
                setCartItems([]);
              } catch (error) {
              }

              if (heldBooking) {
                // Payment verified: the request has now been sent to the vendor
                setBookingRequest(heldBooking);
                setCurrentStep('waiting');
                toastManager.success('Request sent to the vendor. Waiting for them to accept.');
                return;
              }
              // Navigate to booking confirmation
              navigate(`/user/booking-confirmation/${bookingRequest._id}`, {
                replace: true
              });
            } else {
              toastManager.error(verifyResponse.message || 'Payment verification failed');
            }
          } catch (error) {
            toast.dismiss();
            toastManager.error('Failed to verify payment');
          }
        },
        prefill: {
          name: contactDetails.name || (authStorage.getUserData('user')?.name) || 'User',
          email: (authStorage.getUserData('user')?.email) || '',
          contact: contactDetails.phone || userPhone
        },
        modal: heldBooking ? {
          ondismiss: () => {
            // Not paid: the vendor has NOT been contacted. Payment can be retried from the booking page.
            setSearchingVendors(false);
            setShowVendorModal(false);
            toastManager.info('Payment not completed. The vendor is notified only after you pay.');
            navigate(`/user/booking/${heldBooking._id}`, { replace: true });
          }
        } : undefined,
        theme: {
          color: themeColors.button
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function (response) {
        toast.dismiss();
        toastManager.error(`Payment failed: ${response.error.description || 'Unknown error'}`);
      });
      razorpay.open();

    } catch (error) {
      toast.dismiss();
      toastManager.error('Failed to process payment');
      bail();
    }
  };

  const handlePayAtHome = async () => {
    try {
      if (!bookingRequest) return;
      toastManager.info('Confirming booking...');
      const response = await paymentService.confirmPayAtHome(bookingRequest._id);
      toast.dismiss();

      if (response.success) {
        toastManager.success('Booking confirmed!');
        // Clear cart (or just category items)
        try {
          if (category) {
            await removeCategoryGlobal(category);
          } else {
            await clearCartGlobal();
          }
          setCartItems([]);
        } catch (error) {
        }
        // Navigate to booking confirmation
        navigate(`/user/booking-confirmation/${bookingRequest._id}`, {
          replace: true
        });
      } else {
        toastManager.error(response.message || 'Failed to confirm booking');
      }
    } catch (error) {
      toast.dismiss();
      toastManager.error('Failed to process request');
    }
  };

  const handlePayment = async () => {
    if (totalAmount === 0) {
      // Free booking covered by plan
      toastManager.success('Booking confirmed!');
      // Clear cart
      try {
        await clearCartGlobal();
        setCartItems([]);
      } catch (error) { }

      // Navigate
      if (bookingRequest) {
        navigate(`/user/booking-confirmation/${bookingRequest._id}`, { replace: true });
      }
    } else if (paymentMethod === 'online') {
      await handleOnlinePayment();
    } else {
      await handlePayAtHome();
    }
  };

  const handleAddressSave = async (savedHouseNumber, locationObj) => {
    setHouseNumber(savedHouseNumber);
    if (locationObj) {
      setAddress(locationObj.address);
      setAddressDetails(locationObj);
    }
    setShowAddressModal(false);

    // Save to profile
    if (locationObj) {
      try {
        const getComp = (type) => locationObj.components?.find(c => c.types.includes(type)) ?.long_name || '';

        const newAddress = {
          type: 'home',
          addressLine1: locationObj.address,
          addressLine2: savedHouseNumber,
          city: getComp('locality') || getComp('administrative_area_level_2') || 'City',
          state: getComp('administrative_area_level_1') || 'State',
          pincode: getComp('postal_code') || '000000',
          lat: locationObj.lat,
          lng: locationObj.lng,
          isDefault: true
        };

        const response = await userAuthService.getProfile();
        if (response.success && response.user) {
          const updatedAddresses = [newAddress]; // Always replace with single address
          await userAuthService.updateProfile({ addresses: updatedAddresses });
          toastManager.success('Address updated in profile!');
        }
      } catch (e) {
        console.error('Failed to save address to profile', e);
      }
    }

    if (bookingType === 'scheduled') {
      setShowTimeSlotModal(true);
    }
  };

  const handleTimeSlotSave = (date, time, extra = {}) => {
    setSelectedDate(date);
    setSelectedTime(time);
    if (extra.endDate) setEndDate(extra.endDate);
    if (extra.estimatedDuration) setEstimatedDuration(extra.estimatedDuration);
    if (extra.landSize) setLandSize(extra.landSize);
    if (extra.localDays) setLocalDays(extra.localDays);
    setShowTimeSlotModal(false);
  };

  const handleCartClick = () => {
    if (plan) return; // Disable cart click for plan
    navigate('/user/cart');
  };

  // Fetch plan upgrade details if applicable
  const [upgradePreview, setUpgradePreview] = useState(null);
  const isUpgrade = location.state?.isUpgrade;

  useEffect(() => {
    if (plan && isUpgrade) {
      const fetchUpgradeDetails = async () => {
        try {
          const res = await paymentService.getUpgradeDetails(plan.id);
          if (res.success) {
            setUpgradePreview(res.data);
          }
        } catch (error) {
          console.error(error);
          toastManager.error('Failed to calculate upgrade price');
        }
      };
      fetchUpgradeDetails();
    }
  }, [plan, isUpgrade]);

  const handlePlanPayment = async () => {
    try {
      if (!razorpayLoaded) {
        toastManager.error('Payment gateway not ready');
        return;
      }

      const response = await paymentService.createPlanOrder(plan.id);
      if (response.success) {
        const { orderId, amount, key } = response.data;

        const options = {
          key,
          amount: amount * 100,
          currency: 'INR',
          name: 'Groo',
          description: `Payment for ${plan.name} ${isUpgrade ? '(Upgrade)' : ''}`,
          order_id: orderId,
          handler: async (response) => {
            try {
              await paymentService.verifyPlanPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planId: plan.id
              });
              toastManager.success('Subscription activated successfully!');
              navigate('/user');
            } catch (e) {
              toastManager.error('Verification failed');
            }
          },
          prefill: {
            contact: userPhone
          },
          theme: {
            color: themeColors.primary
          }
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      }
    } catch (error) {
      console.error(error);
      toastManager.error('Payment initiation failed');
    }
  };

  // Fetch plan and user profile to determine discounts
  useEffect(() => {
    const fetchBenefits = async () => {
      try {
        const [plansRes, userRes] = await Promise.all([
          getPlans(),
          userAuthService.getProfile(), // Ensure we have latest status
        ]);

        if (plansRes.success && userRes.success && userRes.user?.plans?.isActive) {
          const userPlanName = userRes.user.plans.name;
          const activePlan = plansRes.data.find(p => p.name === userPlanName);

          if (activePlan) {
            setPlanBenefits({
              name: activePlan.name,
              freeCategories: activePlan.freeCategories || [],
              freeBrands: activePlan.freeBrands || [],
              freeServices: activePlan.freeServices || [],
              marketplaceDiscountPercentage: activePlan.marketplaceDiscountPercentage || 0,
              rentalDiscountPercentage: activePlan.rentalDiscountPercentage || 0
            });

          }
        }
      } catch (e) {
        console.error('Failed to load plan benefits', e);
      }
    };

    // Only fetch if not a plan purchase (standard checkout)
    if (!plan) {
      fetchBenefits();
    }
  }, [plan]);

  const [planBenefits, setPlanBenefits] = useState({
    name: '',
    freeCategories: [],
    freeBrands: [],
    freeServices: [],
    marketplaceDiscountPercentage: 0,
    rentalDiscountPercentage: 0
  });

  // Helper to normalize MongoDB IDs (handles strings, objects with _id, and $oid)
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (id.$oid) return id.$oid;
    if (id._id) return normalizeId(id._id);
    return String(id);
  };

  // Calculate totals with Plan Benefits
  const calculateItemPrice = (item) => {
    if (plan) return item.price || 0; // Plan purchase

    // 1. Determine Base Price (Handles Agri Rental Logic)
    let basePrice = item.price || 0;
    // Data-driven: any item with rental price fields is treated as machinery
    const svc = item.serviceId && typeof item.serviceId === 'object' ? item.serviceId : item;
    const isAgri = !!(svc.hourly_price || svc.land_price || svc.daily_price ||
      item.hourly_price || item.land_price || item.daily_price ||
      item.categoryTitle === 'Agriculture' || item.category === 'Agriculture');

    if (isAgri) {
      if (rentalType === 'hourly') basePrice = svc.hourly_price || item.hourly_price || basePrice;
      else if (rentalType === 'land_based') basePrice = svc.land_price || item.land_price || basePrice;
      else if (rentalType === 'daily' || rentalType === 'monthly') basePrice = svc.daily_price || item.daily_price || basePrice;
    }

    // 2. Identify Item for Plan Matching
    const itemCatId = normalizeId(item.categoryId);
    const itemBrandId = normalizeId(item.brandId || item.sectionId);
    const itemServiceId = normalizeId(item.serviceId);

    // 3. Check for Full Coverage (Free)
    const isFreeCategory = itemCatId && planBenefits.freeCategories.some(cat => normalizeId(cat) === itemCatId);
    const isFreeBrand = itemBrandId && planBenefits.freeBrands.some(brand => normalizeId(brand) === itemBrandId);
    const isFreeService = itemServiceId && planBenefits.freeServices.some(svc => normalizeId(svc) === itemServiceId);

    if (isFreeCategory || isFreeBrand || isFreeService) {
      return 0;
    }

    // 4. Multiply by Quantity (Dynamic Multipliers for Agri)
    let qty = 1;
    if (isAgri) {
      if (rentalType === 'hourly') qty = parseFloat(estimatedDuration) || 1;
      else if (rentalType === 'land_based') qty = parseFloat(landSize) || 1;
      else if (rentalType === 'daily' || rentalType === 'monthly') qty = parseFloat(localDays) || 1;
    }

    const discountedPrice = (() => {
      const isRental = !!(item.rental_type || isAgri);
      const isProduct = item.type === 'product' || item.category === 'Marketplace';

      if (isRental && planBenefits.rentalDiscountPercentage > 0) {
        return Math.round(basePrice * (1 - planBenefits.rentalDiscountPercentage / 100));
      }
      if (isProduct && planBenefits.marketplaceDiscountPercentage > 0) {
        return Math.round(basePrice * (1 - planBenefits.marketplaceDiscountPercentage / 100));
      }
      return basePrice;
    })();

    return discountedPrice * qty;
  };

  const itemTotal = cartItems.reduce((sum, item) => sum + calculateItemPrice(item), 0);
  // Calculate savings including Plan Savings
  // NOTE: totalOriginalPrice must use the SAME base & qty logic as calculateItemPrice()
  // so that savings = 0 when no real plan discount exists (prevents fake BEST PRICE banner).
  const totalOriginalPrice = cartItems.reduce((sum, item) => {
    const svcO = item.serviceId && typeof item.serviceId === 'object' ? item.serviceId : item;
    const isAgri = !!(svcO.hourly_price || svcO.land_price || svcO.daily_price ||
      item.hourly_price || item.land_price || item.daily_price ||
      item.categoryTitle === 'Agriculture' || item.category === 'Agriculture');

    // Use exact same base price logic as calculateItemPrice() to avoid mismatch
    let base = item.price || 0;
    if (isAgri) {
      if (rentalType === 'hourly') base = svcO.hourly_price || item.hourly_price || base;
      else if (rentalType === 'land_based') base = svcO.land_price || item.land_price || base;
      else if (rentalType === 'daily' || rentalType === 'monthly') base = svcO.daily_price || item.daily_price || base;
    }

    // Dynamic quantity — same as calculateItemPrice()
    let qty = 1;
    if (isAgri) {
      if (rentalType === 'hourly') qty = parseFloat(estimatedDuration) || 1;
      else if (rentalType === 'land_based') qty = parseFloat(landSize) || 1;
      else if (rentalType === 'daily' || rentalType === 'monthly') qty = parseFloat(localDays) || 1;
    }

    // Do NOT multiply by serviceCount here — calculateItemPrice() doesn't either.
    // serviceCount is used as a booking quantity multiplier at a higher level only.
    const original = base * qty;
    return sum + original;
  }, 0);

  // savings > 0 only when plan gives a real discount (free/discounted items)
  const savings = Math.max(0, totalOriginalPrice - itemTotal);
  const isWorkerBooking = cartItems.some(item =>
    item.isWorkerProfile ||
    /labour|labor|worker|shramik|majdoor/i.test(item.categoryTitle || item.category || '') ||
    /labour|labor|worker|shramik|majdoor/i.test(category || '')
  );

  const hasAgriItems = cartItems.some(item => {
    const svc = item.serviceId && typeof item.serviceId === 'object' ? item.serviceId : item;
    return !!(svc.hourly_price || svc.land_price || svc.daily_price ||
      item.hourly_price || item.land_price || item.daily_price ||
      item.categoryTitle === 'Agriculture' || item.category === 'Agriculture');
  });
  const currentGst = gstPercentage;
  const taxesAndFee = Math.round((itemTotal * currentGst) / 100);
  // Visited fee logic: if Total is 0 (All free), user might still pay visited fee?
  // User says "no payemtn". So maybe visited fee also waived? Or user pays visited fee?
  // "ask direct servicebooking" -> implies fully free.
  // I'll set visitedFee to 0 if itemTotal is 0?
  // Configurable?
  // Assuming "Free under plan" means NO Payment.
  const finalVisitedFee = itemTotal === 0 ? 0 : visitedFee;

  const totalAmount = itemTotal + taxesAndFee + finalVisitedFee;
  const amountToPay = totalAmount;

  // Helper for Free Plan Full Breakdown Display
  // If the booking is free, we still want to show what the Tax/Fee WOULD have been
  const displayTax = totalAmount === 0 ? Math.round((totalOriginalPrice * currentGst) / 100) : taxesAndFee;
  const displayFee = totalAmount === 0 ? visitedFee : finalVisitedFee;
  const displaySavings = totalAmount === 0 ? (totalOriginalPrice + displayTax + displayFee) : savings;

  // Date and time slot helper functions
  const getDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const getTimeSlots = () => {
    // ── Agriculture: Different Time Slots for Equipment ──
    const isAgri = cartItems.some(item => item.categoryTitle === 'Agriculture' || item.category === 'Agriculture');
    
    // Shift slots apply only for Daily or Land-based Agricultural rentals (not Hourly)
    if (isAgri && rentalType !== 'hourly') {
      return [
        { value: '06:00', end: '18:00', display: 'Full Day (6 AM - 6 PM)' },
        { value: '06:00', end: '12:00', display: 'Morning Shift (6 AM - 12 PM)' },
        { value: '12:00', end: '18:00', display: 'Afternoon Shift (12 PM - 6 PM)' },
      ];
    }
    // ──────────────────────────────────────────────────────

    let slotsToUse = [];
    if (rentalType === 'hourly' || isAgri) {
      // Restrict to daytime hours only (7:00 AM to 5:00 PM) for machinery work
      slotsToUse = [
        { value: '07:00', end: '08:00', display: '7:00 AM' },
        { value: '08:00', end: '09:00', display: '8:00 AM' },
        { value: '09:00', end: '10:00', display: '9:00 AM' },
        { value: '10:00', end: '11:00', display: '10:00 AM' },
        { value: '11:00', end: '12:00', display: '11:00 AM' },
        { value: '12:00', end: '13:00', display: '12:00 PM' },
        { value: '13:00', end: '14:00', display: '1:00 PM' },
        { value: '14:00', end: '15:00', display: '2:00 PM' },
        { value: '15:00', end: '16:00', display: '3:00 PM' },
        { value: '16:00', end: '17:00', display: '4:00 PM' },
        { value: '17:00', end: '18:00', display: '5:00 PM' },
      ];
    } else {
      // General non-agriculture hourly slots (9:00 AM to 8:00 PM)
      slotsToUse = [
        { value: '09:00', end: '10:00', display: '9:00 AM' },
        { value: '10:00', end: '11:00', display: '10:00 AM' },
        { value: '11:00', end: '12:00', display: '11:00 AM' },
        { value: '12:00', end: '13:00', display: '12:00 PM' },
        { value: '13:00', end: '14:00', display: '1:00 PM' },
        { value: '14:00', end: '15:00', display: '2:00 PM' },
        { value: '15:00', end: '16:00', display: '3:00 PM' },
        { value: '16:00', end: '17:00', display: '4:00 PM' },
        { value: '17:00', end: '18:00', display: '5:00 PM' },
        { value: '18:00', end: '19:00', display: '6:00 PM' },
        { value: '19:00', end: '20:00', display: '7:00 PM' },
        { value: '20:00', end: '21:00', display: '8:00 PM' },
      ];
    }

    // If today is selected, filter out past time slots
    const now = new Date();
    const isToday = selectedDate && selectedDate.toDateString() === now.toDateString();

    if (!isToday) {
      return slotsToUse;
    }

    // Get current hour + 1 (minimum 1 hour buffer for vendors to accept)
    const currentHour = now.getHours();
    const minHour = currentHour + 1;

    return slotsToUse.filter(slot => {
      const slotHour = parseInt(slot.value.split(':')[0], 10);
      return slotHour >= minHour;
    });
  };

  const formatDate = (date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
    };
  };



  const isDateSelected = (date) => {
    return selectedDate && date.toDateString() === selectedDate.toDateString();
  };

  const isTimeSelected = (time) => {
    return selectedTime === time;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white pb-32 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4" style={{ borderColor: themeColors.button }}></div>
          <p className="text-gray-500">Loading checkout details...</p>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0 && currentStep === 'details' && !searchingVendors && !showVendorModal) {
    return (
      <div className="min-h-screen bg-white pb-32">
        <header className="bg-white">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FiArrowLeft className="w-6 h-6 text-black" />
              </button>
              <h1 className="text-xl font-bold text-black">Your cart</h1>
            </div>
          </div>
          <div className="border-b border-gray-200"></div>
        </header>
        <main className="px-4 py-4">
          <div className="flex flex-col items-center justify-center py-20">
            <FiShoppingCart className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg font-medium">Your cart is empty</p>
            <p className="text-gray-400 text-sm mt-2">Add services to get started</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-80">
      {/* Header */}
      <header className="bg-white">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiArrowLeft className="w-6 h-6 text-black" />
            </button>
            <h1 className="text-xl font-bold text-black">
              {category ? `${category} Checkout` : 'Your cart'}
            </h1>
          </div>
        </div>
        <div className="border-b border-gray-200"></div>
      </header>

      <main className="px-4 py-4">
        {/* Savings Banner — only shown when user has an actual plan-based discount */}
        {savings > 0 && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-green-200">
                <MdStar className="text-white w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Smart Choice!</p>
                <p className="text-sm font-black text-slate-900">
                  You're saving ₹{savings.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <div className="bg-white px-3 py-1 rounded-full shadow-sm border border-green-100">
              <span className="text-[10px] font-black text-green-600">BEST PRICE</span>
            </div>
          </div>
        )}

        {/* Cart Items */}
        <div className="space-y-4 mb-4">
          {cartItems.map((item) => {
            const brandName = item.brand || item.sectionTitle;
            const categoryName = item.categoryTitle || item.category;
            const itemSvc = item.serviceId && typeof item.serviceId === 'object' ? item.serviceId : item;
            const isAgri = !!(itemSvc.hourly_price || itemSvc.land_price || itemSvc.daily_price ||
              item.hourly_price || item.land_price || item.daily_price ||
              categoryName === 'Agriculture');

            return (
              <div key={item._id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                {/* Brand Header */}
                {(brandName || categoryName) && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-50">
                    {item.sectionIcon ? (
                      <img src={toAssetUrl(item.sectionIcon)} className="w-5 h-5 rounded-md object-cover border border-gray-100" alt="" />
                    ) : (
                      <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                        {(brandName || "B").charAt(0)}
                      </div>
                    )}
                    <div className="flex flex-col leading-none">
                      {brandName && <span className="text-xs font-bold text-gray-900">{brandName}</span>}
                      {categoryName && <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mt-0.5">{categoryName}</span>}
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 pr-4">
                    <h3 className="text-base font-bold text-gray-900 mb-1 leading-snug">{item.title}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                    )}
                    {item.duration && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                        <FiClock className="w-3 h-3" />
                        {item.duration}
                      </div>
                    )}
                  </div>
                  {!item.isPlan && !isAgri && (
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                        <button
                          onClick={() => handleQuantityChange(item._id, -1)}
                          className="p-1.5 hover:bg-white rounded-md transition-all shadow-sm"
                        >
                          <FiMinus className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold text-gray-900">{item.serviceCount || 1}</span>
                        <button
                          onClick={() => handleQuantityChange(item._id, 1)}
                          className="p-1.5 hover:bg-white rounded-md transition-all shadow-sm"
                        >
                          <FiPlus className="w-3.5 h-3.5 text-gray-900" />
                        </button>
                      </div>
                    </div>
                  )}
                  {!item.isPlan && (
                    <button
                      onClick={() => handleRemoveItem(item._id)}
                      className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-900 line-clamp-1">
                        {calculateItemPrice(item) === 0 ? (
                          <span className="text-emerald-600">Free</span>
                        ) : (
                          `₹${calculateItemPrice(item).toLocaleString('en-IN')}`
                        )}
                      </span>
                      {calculateItemPrice(item) === 0 && (
                        <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider">
                          WITH PLAN
                        </span>
                      )}
                    </div>
                    {isAgri && (
                      <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full border border-blue-100 uppercase tracking-widest shadow-sm">
                        {rentalType.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  {calculateItemPrice(item) > 0 && (() => {
                    const svc = item.serviceId && typeof item.serviceId === 'object' ? item.serviceId : item;
                    let unitLabel = "Unit Price";
                    let unitPrice = svc.hourly_price || item.unitPrice || (item.price / (item.serviceCount || 1));
                    
                    if (isAgri) {
                       if (rentalType === 'hourly') {
                         unitPrice = svc.hourly_price || unitPrice;
                         unitLabel = "Hourly Rate";
                       } else if (rentalType === 'land_based') {
                         unitPrice = svc.land_price || unitPrice;
                         unitLabel = "Per " + (svc.land_unit || item.land_unit || 'acre');
                       } else if (rentalType === 'daily' || rentalType === 'monthly') {
                         unitPrice = svc.daily_price || unitPrice;
                         unitLabel = "Daily Rate";
                       }
                    }

                    return (
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                        <span>{unitLabel}: ₹{unitPrice.toLocaleString('en-IN')}</span>
                        {item.serviceCount > 1 && <span>? Qty: {item.serviceCount}</span>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )
          })}
        </div>

        {/* ══ RENTAL TYPE CARD (New - agriculture feature) ══ */}
        {/* Only show when cart has items and cart is not a plan */}
        {cartItems.length > 0 && !cartItems[0]?.isPlan && (
          <RentalTypeCard
            serviceId={
              cartItems[0]?.serviceId
                ? (typeof cartItems[0].serviceId === 'object'
                  ? cartItems[0].serviceId._id || cartItems[0].serviceId.id
                  : cartItems[0].serviceId)
                : null
            }
            initialRentalType={rentalType}
            landUnit={
              cartItems[0]?.serviceId
                ? (typeof cartItems[0].serviceId === 'object'
                  ? cartItems[0].serviceId.land_unit
                  : cartItems[0].land_unit)
                : cartItems[0]?.land_unit || 'acre'
            }
            initialQuantity={
              rentalType === 'hourly' ? (estimatedDuration || 1)
              : rentalType === 'land_based' ? (landSize || 1)
              : (localDays || 1)
            }
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            onRentalChange={({ type, quantity }) => {
              setRentalType(type);
              if (type === 'hourly') setEstimatedDuration(quantity);
              else if (type === 'land_based') setLandSize(quantity);
              else if (type === 'daily') setLocalDays(quantity);
              else if (type === 'monthly') setLocalDays(quantity);
            }}
            pricing={{
              hourly: cartItems[0]?.serviceId?.hourly_price || cartItems[0]?.hourly_price || 0,
              land_based: cartItems[0]?.serviceId?.land_price || cartItems[0]?.land_price || 0,
              daily: cartItems[0]?.serviceId?.daily_price || cartItems[0]?.daily_price || 0
            }}
          />
        )}



        {/* ══ AGRI DETAILS CARD (New) ══ */}
        {/* ══ CROP TYPE CARD (Consolidated) ══ */}
        {cartItems.some(item => item.category === 'Agriculture' || item.categoryTitle === 'Agriculture') && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center">🌾</span>
              Crop Information
            </h3>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">What crop are you growing?</label>
              <input
                type="text"
                placeholder="e.g. Wheat, Rice, Sugarcane"
                value={cropType}
                onChange={(e) => setCropType(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all font-medium"
              />
            </div>
          </div>
        )}
        {/* ═══════════════════════════════════════════════════ */}


        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FiPhone className="w-5 h-5 text-gray-600" />
              <div>
                <p className="text-sm font-medium text-black">{contactDetails.name || (authStorage.getUserData('user')?.name) || 'Verified Farmer'}</p>
                <p className="text-xs text-gray-600">{contactDetails.phone || userPhone || 'Loading...'}</p>
              </div>
            </div>
            <button
              onClick={() => setShowContactModal(true)}
              className="text-sm font-medium hover:underline"
              style={{ color: themeColors.button }}
            >
              Change
            </button>
          </div>
        </div>

        {/* Payment Method Selection */}
        {totalAmount > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center">💳</span>
              Payment Method
            </h3>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('online')}
                className={`p-3.5 rounded-xl border-2 flex items-center justify-between transition-all text-left
                  ${paymentMethod === 'online' ? 'border-teal-500 bg-teal-50/20' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${paymentMethod === 'online' ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <FiCreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-gray-800 block">Pay Online</span>
                    <span className="text-[10px] text-gray-500 font-medium">UPI, Cards, Netbanking</span>
                  </div>
                </div>
                {paymentMethod === 'online' && <FiCheckCircle className="text-teal-500" />}
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('pay_at_home')}
                className={`p-3.5 rounded-xl border-2 flex items-center justify-between transition-all text-left
                  ${paymentMethod === 'pay_at_home' ? 'border-teal-500 bg-teal-50/20' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${paymentMethod === 'pay_at_home' ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <FiDollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-gray-800 block">Pay After Work (Cash)</span>
                    <span className="text-[10px] text-gray-500 font-medium">Pay cash directly to professional</span>
                  </div>
                </div>
                {paymentMethod === 'pay_at_home' && <FiCheckCircle className="text-teal-500" />}
              </button>
            </div>
          </div>
        )}

        {/* Payment Summary */}
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 mb-6 shadow-sm overflow-hidden relative">
          {/* Decorative Background for Header */}
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: themeColors.gradient }}></div>

          <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
            <FiShoppingCart className="w-5 h-5" style={{ color: themeColors.button }} />
            Payment Summary
          </h3>

          <div className="space-y-3">
            {/* Original Price (before plan) */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Item Total</span>
              <span className="text-sm font-medium text-slate-900">
                ₹{totalOriginalPrice.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Discount Line */}
            {displaySavings > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-600">Discount</span>
                <span className="text-sm font-medium text-green-600">-₹{displaySavings.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Upgrade Credit (for plan upgrades) */}
            {upgradePreview && upgradePreview.credit > 0 && (
              <div className="flex justify-between items-center text-green-600">
                <span className="text-sm font-medium">Plan Credit</span>
                <span className="text-sm font-bold">-₹{upgradePreview.credit.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Taxes */}
            {displayTax > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">GST ({currentGst}%)</span>
                <span className="text-sm font-medium text-slate-700">₹{displayTax.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Visited Fee */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Convenience Fee</span>
              <span className={`text-sm font-medium ${displayFee === 0 ? 'text-slate-400 font-normal italic' : 'text-slate-700'}`}>
                {displayFee === 0 ? 'Not Added' : `₹${displayFee.toLocaleString('en-IN')}`}
              </span>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200 pt-4 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-slate-900">Total Payable</span>
                <div className="flex flex-col items-end">
                  {totalAmount === 0 ? (
                    <>
                      <span className="text-sm font-medium text-slate-400 line-through">
                        ₹{Math.round(totalOriginalPrice + displayTax + displayFee).toLocaleString('en-IN')}
                      </span>
                      <span className="text-xl font-black text-green-600">FREE</span>
                    </>
                  ) : (
                    <span className="text-xl font-black text-slate-900">
                      ₹{totalAmount.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Important Note regarding Base Price */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 flex items-start gap-4 shadow-sm">
          <div className="bg-blue-100 p-2 rounded-full shrink-0 mt-0.5">
            <FiInfo className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-blue-900 mb-1">Note</h4>
            <p className="text-sm text-blue-800 leading-relaxed font-medium">
              This is a base booking cost. Additional service cost is decided by the vendor after service bill preparation.
            </p>
          </div>
        </div>

        {/* Free Plan Benefit Card */}
        {totalAmount === 0 && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-100/50 border border-green-200 rounded-2xl p-5 mb-6 relative overflow-hidden">
            <div className="flex items-start gap-4 z-10 relative">
              <div className="bg-green-500 rounded-full p-2 shadow-lg shadow-green-200 shrink-0">
                <FiCheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-green-800 mb-1">Covered by {planBenefits.name}</h3>
                <p className="text-sm text-green-700 leading-relaxed font-medium opacity-90">
                  You save <span className="font-bold">₹{Math.round(totalOriginalPrice + displayTax + displayFee).toLocaleString('en-IN')}</span> on this booking!
                  Your plan covers all costs.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Policy */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-base font-bold text-black mb-2">Cancellation policy</h3>
          <p className="text-sm text-gray-700 mb-2">
            Free cancellations if done more than 12 hrs before the service or if a professional isn't assigned. A fee will be charged otherwise.
          </p>
          <button
            onClick={() => navigate('/user/cancellation-policy')}
            className="text-sm font-medium hover:underline"
            style={{ color: themeColors.button }}
          >
            Read full policy
          </button>
        </div>


      </main>

      {/* Bottom Action Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">

        {/* Booking Type Toggle */}
        <div className="px-4 pt-3 pb-0">
          <div className="flex bg-gray-100 p-1 rounded-xl mb-1">
            <button
              onClick={() => setBookingType('instant')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${bookingType === 'instant' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
            >
              <span className="text-yellow-500">⚡</span> Book
            </button>
            <button
              onClick={() => setBookingType('scheduled')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${bookingType === 'scheduled' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
            >
              <span>📅</span> {rentalType === 'monthly' ? 'Schedule' : 'Slot'}
            </button>
          </div>
        </div>

        {/* Address and Slot Display */}
        <div className="px-4 pt-2 pb-2 border-b border-gray-100">
          {(houseNumber || addressDetails) ? (
            <div className="space-y-2.5">
              {/* Address */}
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  <FiHome className="w-4 h-4" style={{ color: themeColors.button }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 mb-0.5">Address</p>
                  <p className="text-sm font-medium text-black truncate">
                    {houseNumber ? `${houseNumber}, ` : ''}{address || 'Select Address'}
                  </p>
                </div>
                <button
                  onClick={() => setShowAddressModal(true)}
                  className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0 mt-0.5"
                >
                  <FiEdit2 className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              {/* Time Slot (Only for Scheduled) */}
              {bookingType === 'scheduled' && (
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                    <FiClock className="w-4 h-4" style={{ color: themeColors.button }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 mb-0.5">
                      {rentalType === 'monthly' ? 'Rental Period' : rentalType === 'hourly' ? 'Booking Duration' : 'Time Slot'}
                    </p>
                    <p className="text-sm font-medium text-black">
                      {selectedDate ? (() => {
                        const { day, date: dateNum } = formatDate(selectedDate);
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const month = monthNames[selectedDate.getMonth()];
                        
                        let displayStr = `${day}, ${dateNum} ${month}`;
                        
                        if (rentalType === 'monthly' && endDate) {
                          const { day: eDay, date: eDateNum } = formatDate(endDate);
                          const eMonth = monthNames[endDate.getMonth()];
                          displayStr += ` - ${eDay}, ${eDateNum} ${eMonth}`;
                        } else if (rentalType === 'hourly') {
                          const timeDisplay = getTimeSlots().find(slot => slot.value === selectedTime) ?.display || selectedTime;
                          displayStr += ` ? ${timeDisplay}`;
                          if (estimatedDuration) displayStr += ` (${estimatedDuration} Hours)`;
                        } else if (rentalType === 'daily') {
                          const timeDisplay = getTimeSlots().find(slot => slot.value === selectedTime) ?.display || selectedTime;
                          if (timeDisplay && timeDisplay !== '00:00') displayStr += ` ? ${timeDisplay}`;
                          if (localDays) displayStr += ` (${localDays} Day${localDays > 1 ? 's' : ''})`;
                        } else if (rentalType === 'land_based') {
                          const timeDisplay = getTimeSlots().find(slot => slot.value === selectedTime) ?.display || selectedTime;
                          if (timeDisplay && timeDisplay !== '00:00') displayStr += ` ? ${timeDisplay}`;
                        } else {
                          const timeDisplay = getTimeSlots().find(slot => slot.value === selectedTime) ?.display || selectedTime;
                          if (timeDisplay && timeDisplay !== '00:00') displayStr += ` ? ${timeDisplay}`;
                        }
                        
                        return displayStr;
                      })() : (
                        <span className="text-gray-400">
                          {rentalType === 'monthly' ? 'Select Rental Period' : 'Select Date & Time'}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTimeSlotModal(true)}
                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0 mt-0.5"
                  >
                    <FiEdit2 className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={() => setShowAddressModal(true)}
              className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <FiHome className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-900">Delivery Address Missing</p>
                  <p className="text-xs text-red-600">Please add address to see availability</p>
                </div>
              </div>
              <FiEdit2 className="w-4 h-4 text-red-400" />
            </div>
          )}
        </div>

        <div className="p-4">
          <button
            onClick={plan ? () => setShowPaymentConfirmModal(true) :
              (houseNumber || addressDetails) ?
                (currentStep === 'payment' ? () => setShowPaymentConfirmModal(true) : handleSearchVendors) :
                handleProceed}
            disabled={searchingVendors}
            className="w-full text-white py-3 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-teal-500/30"
            style={{ backgroundColor: themeColors.button }}
          >
            {searchingVendors ? (isWorkerBooking ? 'Searching for workers...' : 'Searching for vendors...') :
              currentStep === 'payment' ? (totalAmount === 0 ? 'Confirm Booking (Free)' : (paymentMethod === 'online' ? 'Proceed to Pay' : 'Confirm Booking')) :
                plan ? 'Proceed to Payment' :
                  bookingType === 'instant' ? (isWorkerBooking ? 'Find nearby workers now' : 'Find nearby vendors now') :
                    (selectedDate && (selectedTime || rentalType === 'monthly' || rentalType === 'daily')) ? 
                      (isWorkerBooking ? 'Find nearby workers' : 'Find nearby vendors') :
                      (houseNumber || addressDetails) ? (rentalType === 'monthly' ? 'Select Start Date' : 'Select Time Slot') : 'Add address to proceed'}
          </button>
        </div>
      </div>

      {/* Live Booking Status Card (Visible when minimized) */}
      <LiveBookingCard key={bookingRequest?._id || 'default'} />

      {/* Vendor Search Modal */}
      <VendorSearchModal
        isOpen={showVendorModal}
        onClose={() => {
          setShowVendorModal(false);
          if (currentStep === 'accepted') {
            setCurrentStep('payment');
          } else if (currentStep === 'failed') {
            setCurrentStep('details');
          }
        }}
        currentStep={currentStep}
        acceptedVendor={acceptedVendor}
        onRetry={() => {
          handleSearchVendors();
        }}
        isWorker={isWorkerBooking}
      />

      {/* Contact Details Edit Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-scale-in">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Update Contact Details</h3>
            <p className="text-sm text-gray-500 mb-4">These details will be used for this booking only.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                <input
                  type="text"
                  value={contactDetails.name}
                  onChange={(e) => setContactDetails(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full mt-1 p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Phone Number</label>
                <div className="flex gap-2">
                  <span className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-medium select-none">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={contactDetails.phone?.replace('+91', '') ?.replace(/^\+91/, '') || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setContactDetails(prev => ({ ...prev, phone: val }));
                    }}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="9999999999"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowContactModal(false)}
                  className="py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (contactDetails.name.length < 2) {
                      toastManager.error('Please enter a valid name');
                      return;
                    }
                    if (!contactDetails.phone || contactDetails.phone.length < 10) {
                      toastManager.error('Please enter a valid 10-digit phone number');
                      return;
                    }
                    setShowContactModal(false);
                  }}
                  className="py-3 rounded-xl font-bold text-white shadow-lg shadow-teal-500/30 active:scale-95 transition-all"
                  style={{ backgroundColor: themeColors.button }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Address Selection Modal */}
      <AddressSelectionModal
        isOpen={showAddressModal}
        onClose={() => setShowAddressModal(false)}
        address={address}
        houseNumber={houseNumber}
        onHouseNumberChange={setHouseNumber}
        onSave={handleAddressSave}
      />

      {/* Time Slot Modal */}
      <TimeSlotModal
        isOpen={showTimeSlotModal}
        onClose={() => setShowTimeSlotModal(false)}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        onDateSelect={setSelectedDate}
        onTimeSelect={setSelectedTime}
        onSave={handleTimeSlotSave}
        onQuantityChange={({ estimatedDuration: h, landSize: a, localDays: d, cropType: c, chemicalUsed: ch }) => {
          if (h !== undefined) setEstimatedDuration(h);
          if (a !== undefined) setLandSize(a);
          if (d !== undefined) setLocalDays(d);
          if (c !== undefined) setCropType(c);
          if (ch !== undefined) setChemicalUsed(ch);
        }}
        getDates={getDates}
        getTimeSlots={getTimeSlots}
        formatDate={formatDate}
        isDateSelected={isDateSelected}
        isTimeSelected={isTimeSelected}
        rentalType={rentalType}
        landUnit={
          cartItems[0]?.serviceId
            ? (typeof cartItems[0].serviceId === 'object'
              ? cartItems[0].serviceId.land_unit
              : cartItems[0].land_unit)
            : cartItems[0]?.land_unit || 'acre'
        }
        estimatedDuration={estimatedDuration}
        landSize={landSize}
        localDays={localDays}
        cropType={cropType}
        chemicalUsed={chemicalUsed}
      />

      {/* ══════════ Payment Confirmation Modal ══════════ */}
      {showPaymentConfirmModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
            onClick={() => setShowPaymentConfirmModal(false)}
          />

          {/* Bottom Sheet */}
          <div
            className="relative bg-white w-full rounded-t-[32px] shadow-2xl z-10 overflow-hidden"
            style={{ maxHeight: '90vh' }}
          >
            {/* Green top strip */}
            <div className="h-1 w-full" style={{ background: themeColors.gradient }} />

            {/* Drag pill */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 bg-gray-200 rounded-full" />
            </div>

            <div className="px-6 pb-8 pt-2">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Confirm Payment</h3>
                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">Review or change your payment method</p>
                </div>
                <button
                  onClick={() => setShowPaymentConfirmModal(false)}
                  className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Amount Banner */}
              {totalAmount > 0 && (
                <div
                  className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between"
                  style={{ background: `linear-gradient(135deg, ${themeColors.brand?.teal || '#347989'}18, ${themeColors.brand?.teal || '#347989'}08)`, border: `1.5px solid ${themeColors.brand?.teal || '#347989'}22` }}
                >
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Payable</p>
                    <p className="text-2xl font-black text-gray-900">₹{totalAmount.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${themeColors.button}20` }}>
                    <FiCreditCard className="w-6 h-6" style={{ color: themeColors.button }} />
                  </div>
                </div>
              )}

              {/* Payment Options */}
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Select Payment Method</p>
              <div className="flex flex-col gap-3 mb-6">
                {/* Pay Online */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('online')}
                  className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all text-left ${
                    paymentMethod === 'online'
                      ? 'border-teal-500 bg-teal-50/30 shadow-sm shadow-teal-100'
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      paymentMethod === 'online' ? 'bg-teal-500 text-white shadow-md shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <FiCreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`text-sm font-black block ${ paymentMethod === 'online' ? 'text-teal-800' : 'text-gray-700'}`}>Pay Online</span>
                      <span className="text-[10px] font-medium text-gray-400">UPI · Cards · Netbanking</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    paymentMethod === 'online' ? 'border-teal-500 bg-teal-500' : 'border-gray-200'
                  }`}>
                    {paymentMethod === 'online' && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                </button>

                {/* Pay After Work */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('pay_at_home')}
                  className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all text-left ${
                    paymentMethod === 'pay_at_home'
                      ? 'border-emerald-500 bg-emerald-50/30 shadow-sm shadow-emerald-100'
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      paymentMethod === 'pay_at_home' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <FiDollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`text-sm font-black block ${ paymentMethod === 'pay_at_home' ? 'text-emerald-800' : 'text-gray-700'}`}>Pay After Work (Cash)</span>
                      <span className="text-[10px] font-medium text-gray-400">Pay cash directly to professional</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    paymentMethod === 'pay_at_home' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-200'
                  }`}>
                    {paymentMethod === 'pay_at_home' && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                </button>
              </div>

              {/* Confirm Button */}
              <button
                onClick={() => {
                  setShowPaymentConfirmModal(false);
                  // Small delay so modal closes smoothly before payment starts
                  setTimeout(() => {
                    if (plan) {
                      handlePlanPayment();
                    } else {
                      handlePayment();
                    }
                  }, 150);
                }}
                className="w-full py-4 rounded-2xl text-white font-black text-sm tracking-wide transition-all active:scale-95 shadow-lg"
                style={{
                  background: paymentMethod === 'online'
                    ? `linear-gradient(135deg, ${themeColors.button}, ${themeColors.brand?.teal || '#347989'})`
                    : 'linear-gradient(135deg, #059669, #10b981)',
                  boxShadow: paymentMethod === 'online'
                    ? `0 8px 24px ${themeColors.button}44`
                    : '0 8px 24px #05966944'
                }}
              >
                {paymentMethod === 'online'
                  ? `✦ Proceed to Pay ₹${totalAmount.toLocaleString('en-IN')}`
                  : '✦ Confirm Booking (Cash)'}
              </button>

              <p className="text-center text-[10px] text-gray-400 font-medium mt-3">
                🔒 Your booking is secured & protected
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Checkout;
