import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowLeft, FiStar, FiUser, FiBriefcase,
  FiCalendar, FiMessageSquare, FiLoader, FiCheckCircle, FiTool
} from 'react-icons/fi';
import { toastManager } from '../../../../utils/toastManager';
import bookingService from '../../../../services/bookingService';

const MyRating = () => {
  const navigate = useNavigate();
  const [ratings, setRatings] = useState([]);
  const [stats, setStats] = useState({ averageRating: 0, totalReviews: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [fetchError, setFetchError] = useState(false);

  const fetchRatings = async (page = 1) => {
    try {
      setIsLoading(true);
      setFetchError(false);
      const response = await bookingService.getRatings({ page, limit: 20 });
      if (response && response.success) {
        // Accommodate array or object format
        const list = Array.isArray(response.data)
          ? response.data
          : (response.data?.ratings || response.ratings || []);

        const ratingStats = response.stats || response.data?.stats || {
          averageRating: list.length > 0
            ? Number((list.reduce((acc, r) => acc + (r.rating || 0), 0) / list.length).toFixed(1))
            : 0,
          totalReviews: response.pagination?.total ?? list.length
        };

        setRatings(page === 1 ? list : prev => [...prev, ...list]);
        setStats(ratingStats);
        if (response.pagination) {
          setPagination(response.pagination);
        }
      } else {
        toastManager.error(response?.message || 'Failed to fetch ratings');
        setFetchError(true);
      }
    } catch (error) {
      console.error('Error fetching ratings:', error);
      toastManager.error('Failed to load ratings. Please check your connection.');
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRatings(1);
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return 'Recent';
    try {
      return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return 'Recent';
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF9] pb-24">
      {/* Header */}
      <header className="bg-white sticky top-0 z-30 shadow-sm border-b border-gray-100">
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
              aria-label="Back"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <div>
              <h1 className="text-lg font-black text-gray-900 tracking-tight">My Ratings</h1>
              <p className="text-[11px] font-medium text-gray-400">Reviews & ratings you have shared</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Overall Activity Header Card */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-5 text-white shadow-lg shadow-emerald-700/20 relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/80">Overall Activity</span>
              <div className="flex items-center gap-2 mt-1">
                <FiStar className="w-6 h-6 fill-amber-300 text-amber-300 drop-shadow" />
                <span className="text-3xl font-black tracking-tight">
                  {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '0.0'}
                </span>
                <span className="text-xs text-emerald-100 font-bold ml-0.5">/ 5.0</span>
              </div>
              <p className="text-[11px] text-emerald-100/90 font-medium mt-1">
                Average rating of your reviews
              </p>
            </div>

            <div className="bg-white/15 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-white/20 text-center">
              <span className="text-2xl font-black block leading-none">{stats.totalReviews || ratings.length}</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100 mt-1 block">Reviews Given</span>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && pagination.page === 1 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <FiLoader className="w-9 h-9 text-emerald-600 animate-spin mb-3" />
            <p className="text-sm font-bold text-gray-700">Loading your ratings...</p>
            <p className="text-xs text-gray-400 mt-1">Fetching your feedback history</p>
          </div>
        ) : fetchError && ratings.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-gray-100 py-12">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <FiStar className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-gray-900 mb-1">Unable to Load Ratings</h3>
            <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
              We couldn't retrieve your ratings at the moment. Please check your internet connection and try again.
            </p>
            <button
              onClick={() => fetchRatings(1)}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
            >
              Try Again
            </button>
          </div>
        ) : ratings.length > 0 ? (
          <div className="space-y-4">
            {ratings.map((item, idx) => {
              const targetRole = item.targetRole || (item.workerId ? 'Worker' : item.vendorId ? 'Vendor' : 'Service Provider');
              const targetName = item.targetName || item.workerId?.name || item.vendorId?.businessName || item.vendorId?.name || 'AgroYilt Partner';
              const targetPhoto = item.targetPhoto || item.workerId?.profilePhoto || item.vendorId?.profilePhoto || null;
              const numericRating = Number(item.rating || 0);

              return (
                <div
                  key={item._id || idx}
                  className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all space-y-3.5 relative overflow-hidden"
                >
                  {/* Top: Target Info & Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center overflow-hidden border border-emerald-100 shrink-0">
                        {targetPhoto ? (
                          <img src={targetPhoto} alt={targetName} className="w-full h-full object-cover" />
                        ) : targetRole === 'Worker' ? (
                          <FiTool className="w-6 h-6 text-emerald-600" />
                        ) : (
                          <FiUser className="w-6 h-6 text-emerald-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 inline-block mb-0.5">
                          {targetRole}
                        </span>
                        <h4 className="font-black text-gray-900 text-sm truncate">{targetName}</h4>
                        <span className="text-[10px] font-bold text-gray-400 block">
                          {formatDate(item.reviewedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Numeric Stars Badge */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200/60 rounded-2xl shrink-0">
                      <FiStar className="w-4 h-4 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-black text-amber-900">{numericRating.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Rating Stars Bar */}
                  <div className="flex items-center gap-1 pt-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <FiStar
                        key={s}
                        className={`w-4 h-4 ${s <= numericRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                      />
                    ))}
                  </div>

                  {/* Comment */}
                  {item.review ? (
                    <p className="text-gray-700 text-xs sm:text-sm leading-relaxed font-medium bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
                      "{item.review}"
                    </p>
                  ) : (
                    <p className="text-gray-400 text-[11px] italic pl-1">
                      No written comment provided.
                    </p>
                  )}

                  {/* Optional Review Images */}
                  {Array.isArray(item.reviewImages) && item.reviewImages.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide pt-1">
                      {item.reviewImages.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-100 shadow-sm"
                          alt="Review attachment"
                        />
                      ))}
                    </div>
                  )}

                  {/* Footer: Booking Reference & View Button */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-gray-500 font-bold text-[11px]">
                      <FiBriefcase className="w-3.5 h-3.5 text-gray-400" />
                      <span>Booking: #{item.bookingNumber}</span>
                    </div>
                    {item.bookingId && (
                      <button
                        onClick={() => navigate(`/user/booking/${item.bookingId}`)}
                        className="text-[11px] font-black text-emerald-700 hover:text-emerald-800 hover:underline"
                      >
                        View Booking
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Load More Button */}
            {pagination.total > ratings.length && (
              <button
                onClick={() => fetchRatings(pagination.page + 1)}
                disabled={isLoading}
                className="w-full py-3.5 bg-white rounded-2xl border-2 border-gray-200 text-gray-700 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-98 transition-all shadow-sm"
              >
                {isLoading ? <FiLoader className="w-4 h-4 animate-spin text-emerald-600" /> : 'Load More Reviews'}
              </button>
            )}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-dashed border-gray-200 py-16">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4 mx-auto text-emerald-600">
              <FiStar className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-base font-black text-gray-900 mb-1.5">No ratings yet</h3>
            <p className="text-xs text-gray-500 font-medium max-w-xs mx-auto leading-relaxed mb-6">
              You haven't submitted any reviews or ratings yet. Once a booking or service is completed, you can rate your experience!
            </p>
            <button
              onClick={() => navigate('/user/my-bookings')}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
            >
              Go to My Bookings
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default MyRating;
