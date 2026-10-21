import React from 'react';
import { FiStar } from 'react-icons/fi';

const ReviewCard = ({ booking, onWriteReview }) => {
  // Offered on every completed booking, whatever the payment route (online, cash, wallet, plan): the server accepts a review
  // once a booking is completed, and nothing else. A rating already given is always shown.
  const canReview = String(booking.status || '').toLowerCase() === 'completed';
  const hasRating = !!booking.rating;

  if (!hasRating && !canReview) {
    return null;
  }

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-lg border-none relative group mb-6">
      {/* Top Accent Gradient */}
      <div className="h-1.5 bg-gradient-to-r from-orange-400 to-orange-600" />

      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500 shadow-inner">
            <FiStar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">How was your experience?</h3>
            <p className="text-gray-500 text-sm">Your feedback helps us improve.</p>
          </div>
        </div>

        {!hasRating ? (
          <button
            onClick={onWriteReview}
            className="w-full py-3.5 text-white font-bold rounded-xl shadow-lg shadow-orange-200 active:scale-95 transition-all hover:brightness-105"
            style={{
              background: 'linear-gradient(135deg, #F97316, #EA580C)'
            }}
          >
            Write a Review
          </button>
        ) : (
          <div className="bg-orange-50/80 rounded-2xl p-5 border border-orange-100 text-center">
            <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-3">Your Rating</p>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <FiStar
                  key={star}
                  className={`w-8 h-8 transition-transform hover:scale-110 ${star <= (booking.rating?.rating || booking.rating)
                    ? 'fill-orange-500 text-orange-500 drop-shadow-sm'
                    : 'text-gray-300'
                    }`}
                />
              ))}
            </div>
            {(booking.rating?.review || booking.review) && (
              <div className="bg-white rounded-xl p-4 shadow-sm relative">
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 transform"></div>
                <p className="text-gray-700 italic font-medium leading-relaxed">
                  "{booking.rating?.review || booking.review}"
                </p>
              </div>
            )}

            {/* Optional: Add Date or 'Thank You' text */}
            <div className="mt-3 text-xs text-orange-400 font-semibold">
              Thank you for your feedback!
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewCard;
