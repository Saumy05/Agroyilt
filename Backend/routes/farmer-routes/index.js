const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isUser } = require('../../middleware/roleMiddleware');

// Controllers
const profileController = require('../../controllers/farmerControllers/farmerProfileController');
const searchController = require('../../controllers/farmerControllers/farmerSearchController');
const bookingController = require('../../controllers/farmerControllers/farmerBookingController');
const groupBookingController = require('../../controllers/farmerControllers/farmerGroupBookingController');
const paymentController = require('../../controllers/farmerControllers/farmerBookingPaymentController');
const biddingController = require('../../controllers/farmerControllers/farmerBiddingController');
const rentalController = require('../../controllers/farmerControllers/farmerRentalController');
const landLeaseController = require('../../controllers/farmerControllers/farmerLandLeaseController');
const agreementController = require('../../controllers/farmerControllers/farmerAgreementController');
const agriInfoController = require('../../controllers/farmerControllers/farmerAgriInfoController');
const reviewController = require('../../controllers/farmerControllers/farmerReviewController');

// All routes require authentication and 'USER' (Farmer) role
router.use(authenticate, isUser);

// 1. Profile & Farms
router.get('/profile', profileController.getProfile);
router.put('/profile', profileController.updateProfile);
router.post('/farms', profileController.addFarm);
router.get('/farms', profileController.getFarms);
router.put('/farms/:id', profileController.updateFarm);
router.delete('/farms/:id', profileController.deleteFarm);

// 2. Search & Discovery (Moved to public routes)
// router.get('/search/machinery', searchController.searchMachinery);
// router.get('/search/machinery/:id', searchController.getMachineryDetails);

// 3. Bookings
router.post('/bookings', bookingController.createBooking);
router.get('/bookings', bookingController.getBookingHistory);
router.post('/bookings/:id/cancel', bookingController.cancelBooking);
router.post('/bookings/:id/extend', bookingController.requestExtension);
router.post('/bookings/:id/approve-completion', bookingController.approveWorkCompletion);

// 4. Group Bookings
router.post('/group-bookings', groupBookingController.createGroupBooking);
router.post('/group-bookings/:id/join', groupBookingController.joinGroupBooking);
router.post('/group-bookings/:id/confirm', groupBookingController.confirmParticipation);

// 5. Payments
router.post('/bookings/:id/pay', paymentController.payForBooking);
router.get('/payments', paymentController.getPaymentHistory);

// 6. Requirements & Bidding
router.post('/requirements', biddingController.postRequirement);
router.post('/requirements/:id/cancel', biddingController.cancelRequirement);
router.get('/requirements/:id/bids', biddingController.getRequirementBids);
router.post('/requirements/:id/bids/:bidId/accept', biddingController.acceptBid);

// 7. Rentals
router.post('/rentals', rentalController.rentEquipment);
router.get('/rentals/:id', rentalController.getRentalDetails);
router.post('/rentals/:id/confirm-return', rentalController.confirmReturn);
router.post('/rentals/:id/damage-report', rentalController.reportDamage);

// 8. Land Leases
router.post('/land-leases', landLeaseController.listLand);
router.get('/land-leases', landLeaseController.browseLandLeases);
router.get('/land-leases/my-leases', landLeaseController.getMyLandLeases);
router.get('/land-leases/:id', landLeaseController.getLandLeaseById);
router.post('/land-leases/:id/negotiate', landLeaseController.negotiateLease);
router.post('/land-leases/:id/accept-offer', landLeaseController.acceptOffer);
router.post('/land-leases/:id/accept', landLeaseController.acceptLeaseTerms);
router.delete('/land-leases/:id', landLeaseController.deleteLand);

// 9. Agreements
router.get('/agreements', agreementController.getAgreements);
router.get('/agreements/:id/download', agreementController.downloadAgreement);

// 10. Agri-Info
router.get('/agri-info/mandi', agriInfoController.getMandiPrices);
router.get('/agri-info/weather', agriInfoController.getWeather);
router.post('/agri-info/diagnose', agriInfoController.diagnoseCrop);

// 11. Reviews & Complaints
router.post('/reviews', reviewController.rateBooking);
router.post('/complaints', reviewController.fileComplaint);

module.exports = router;
