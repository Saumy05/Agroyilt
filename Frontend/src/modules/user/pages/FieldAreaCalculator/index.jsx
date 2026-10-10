import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  FiMapPin,
  FiArrowLeft,
  FiTruck,
  FiCheckCircle,
  FiLayers,
  FiInfo,
  FiShield
} from 'react-icons/fi';
import FieldAreaMeasurementModal from '../../components/FieldAreaMeasurementModal';

const FieldAreaCalculator = () => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [measuredField, setMeasuredField] = useState(null);

  const handleApplyArea = (data) => {
    setMeasuredField(data);
  };

  const handleBookMachinery = () => {
    if (!measuredField) return;
    navigate('/user/machinery-explorer', {
      state: {
        rentalType: 'land_based',
        quantity: measuredField.acres,
        measuredField
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Helmet>
        <title>खेत का क्षेत्रफल मापन • Field Area Calculator | Agroyilt</title>
        <meta
          name="description"
          content="Satellite map based agricultural field area measurement. Compute exact Acres, Bigha, and Guntha for your farm."
        />
      </Helmet>

      {/* Top App Bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 flex items-center justify-center transition-all cursor-pointer"
            >
              <FiArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                खेत का क्षेत्रफल मापन
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-500 font-semibold">
                Field Area Measurement & Unit Converter
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <FiLayers size={13} />
            <span>Open Map Tool</span>
          </button>
        </div>
      </div>

      {/* Hero / Summary Section */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {measuredField ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 border border-emerald-200 shadow-md mb-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <FiCheckCircle size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">
                    Latest Measurement
                  </span>
                  <h2 className="text-lg font-black text-slate-900">
                    Farm Boundary Successfully Marked
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Re-measure
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-5">
              <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-200/60">
                <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                  Total Size (एकड़)
                </span>
                <span className="text-2xl font-black text-emerald-900">
                  {measuredField.acres} Acres
                </span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Bigha (बीघा)
                </span>
                <span className="text-xl font-black text-slate-800">
                  {measuredField.bigha} Bigha
                </span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Guntha (गुंठा)
                </span>
                <span className="text-xl font-black text-slate-800">
                  {measuredField.guntha} Guntha
                </span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Hectares (हेक्टेयर)
                </span>
                <span className="text-xl font-black text-slate-800">
                  {measuredField.hectares} Ha
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                <span>Boundary perimeter: </span>
                <strong className="text-slate-800">
                  {measuredField.perimeterMeters ? `${measuredField.perimeterMeters} meters` : 'N/A'}
                </strong>
                {measuredField.points?.length > 0 && (
                  <span className="ml-2 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {measuredField.points.length} GPS Pins
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleBookMachinery}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-800 hover:from-emerald-700 hover:to-green-900 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <FiTruck size={15} />
                <span>Book Machinery for {measuredField.acres} Acres</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm mb-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <FiMapPin size={28} />
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              Measure Any Farm on Satellite Map
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Drop pins around farm borders on high-resolution satellite imagery to auto-calculate exact acreage, bigha, and boundary length.
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
            >
              <FiLayers size={14} />
              <span>Launch Field Measurement Map</span>
            </button>
          </div>
        )}

        {/* Informational Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xs mb-2">
              1
            </div>
            <h3 className="text-xs font-black text-slate-900">
              Drop Pins Along Bunds
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Tap corners of your field boundary on satellite view. Drag any numbered pin to adjust the contour.
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-black text-xs mb-2">
              2
            </div>
            <h3 className="text-xs font-black text-slate-900">
              Regional Bigha Conversion
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Select UP, Bihar, Rajasthan, MP, Punjab, Haryana, Gujarat or Maharashtra for authentic local land units.
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-xs mb-2">
              3
            </div>
            <h3 className="text-xs font-black text-slate-900">
              Direct Machinery Booking
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              One-click transfer of measured acres into tractor, harvester, or rotavator booking with verified rates.
            </p>
          </div>
        </div>
      </div>

      {/* Measurement Modal */}
      <FieldAreaMeasurementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onApplyArea={handleApplyArea}
        initialAcres={measuredField?.acres || 1}
        initialPoints={measuredField?.points || []}
      />
    </div>
  );
};

export default FieldAreaCalculator;
