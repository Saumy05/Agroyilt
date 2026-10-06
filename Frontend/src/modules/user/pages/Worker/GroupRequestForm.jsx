import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  FiArrowLeft, FiMapPin, FiCalendar, FiClock,
  FiDollarSign, FiUsers, FiChevronDown, FiCheck, FiFileText
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../services/workerBookingService';

// Work categories with rich metadata and templates for auto-filling
const WORK_CATEGORY_DATA = {
  'Harvesting': {
    icon: '🌾',
    title: 'Harvesting Work',
    description: 'Looking for farm workers for crop harvesting and field clearing.',
    skill: 'Harvesting'
  },
  'Sowing': {
    icon: '🌱',
    title: 'Sowing Work',
    description: 'Looking for farm workers for seed sowing and field planting.',
    skill: 'Sowing'
  },
  'Planting': {
    icon: '🌿',
    title: 'Planting Work',
    description: 'Looking for farm workers for sapling planting and crop transplantation.',
    skill: 'Planting'
  },
  'Irrigation': {
    icon: '💧',
    title: 'Irrigation Work',
    description: 'Looking for farm workers for field irrigation and water channel management.',
    skill: 'Irrigation'
  },
  'Weeding': {
    icon: '🪴',
    title: 'Weeding Work',
    description: 'Looking for farm workers for manual weed removal and crop maintenance.',
    skill: 'Weeding'
  },
  'Fertilizing': {
    icon: '🧪',
    title: 'Fertilizing Work',
    description: 'Looking for farm workers for fertilizer application and crop nutrition.',
    skill: 'Fertilizing'
  },
  'Pesticide Spraying': {
    icon: '🧴',
    title: 'Pesticide Spraying',
    description: 'Looking for experienced workers for crop pesticide and insecticide spraying.',
    skill: 'Pesticide Spraying'
  },
  'Land Preparation': {
    icon: '🚜',
    title: 'Land Preparation',
    description: 'Looking for farm workers for land tilling, levelling, and soil bed preparation.',
    skill: 'Land Preparation'
  },
  'Threshing': {
    icon: '🌾',
    title: 'Threshing Work',
    description: 'Looking for farm workers for post-harvest crop threshing and grain separation.',
    skill: 'Threshing'
  },
  'Loading & Unloading': {
    icon: '📦',
    title: 'Loading & Unloading',
    description: 'Looking for workers for farm produce loading, unloading, and cartage.',
    skill: 'Loading & Unloading'
  },
  'Tractor Operation': {
    icon: '🚜',
    title: 'Tractor Operation',
    description: 'Need skilled operator for tractor ploughing and farm equipment handling.',
    skill: 'Tractor Driving'
  },
  'General Farm Labour': {
    icon: '👨‍🌾',
    title: 'General Farm Labour',
    description: 'Looking for workers for general farm chores, maintenance, and field assistance.',
    skill: 'General Farm Labour'
  },
  'Other': {
    icon: '✨',
    title: 'Agricultural Farm Work',
    description: 'Looking for dedicated farm workers for agricultural field work.',
    skill: 'General Farm Labour'
  }
};

const WORK_CATEGORIES = Object.keys(WORK_CATEGORY_DATA);

const WorkCategorySelect = ({ value, onChange, error, categories, categoryData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedData = categoryData[value];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        id="group-work-category-dropdown-btn"
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full bg-slate-50/80 border rounded-xl px-3 py-2 text-xs sm:text-sm flex items-center justify-between transition-all text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${
          isOpen ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white' : ''
        } ${error ? 'border-red-300' : 'border-slate-200 hover:border-slate-300'}`}
      >
        <span className={`flex items-center gap-2 ${value ? 'text-slate-800 font-semibold' : 'text-slate-400 font-normal'}`}>
          {value ? (
            <>
              <span className="text-sm">{selectedData?.icon}</span>
              <span>{value}</span>
            </>
          ) : (
            'Select work category *'
          )}
        </span>
        <FiChevronDown
          size={16}
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-100 rounded-xl shadow-xl shadow-slate-200/50 max-h-60 overflow-y-auto p-1.5 space-y-0.5">
          {categories.map(c => {
            const isSelected = value === c;
            const data = categoryData[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange({ target: { name: 'workCategory', value: c } });
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs sm:text-sm text-left transition-colors ${
                  isSelected
                    ? 'bg-emerald-50 text-emerald-800 font-bold'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-emerald-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{data?.icon}</span>
                  <span>{c}</span>
                </div>
                {isSelected && <FiCheck size={14} className="text-emerald-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const formatToDDMMYYYY = (isoDateStr) => {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
};

const formatFriendlyDay = (isoDateStr) => {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts.map(Number);
  const dateObj = new Date(y, m - 1, d);
  if (isNaN(dateObj.getTime())) return '';
  return dateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const GroupRequestForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const leader = location.state?.leader;
  const [loading, setLoading] = useState(false);
  const [hasUserEditedTitle, setHasUserEditedTitle] = useState(false);
  const [hasUserEditedDesc, setHasUserEditedDesc] = useState(false);

  const [formData, setFormData] = useState({
    requiredWorkers: '',
    workCategory: '',
    workTitle: '',
    workDescription: '',
    requiredSkills: '',
    scheduledDate: '',
    startTime: '',
    endTime: '',
    farmerOfferedRatePerWorker: '',
    rateUnit: 'daily',
    addressLine1: '',
    city: ''
  });

  if (!leader) {
    navigate('/user/team-leaders', { replace: true });
    return null;
  }

  const selectCategory = (category) => {
    if (!category) {
      setFormData(prev => {
        const prevAutoSkill = WORK_CATEGORY_DATA[prev.workCategory]?.skill;
        const skillsArr = (prev.requiredSkills || '').split(',').map(s => s.trim()).filter(Boolean);
        const filtered = skillsArr.filter(s => !prevAutoSkill || s.toLowerCase() !== prevAutoSkill.toLowerCase());
        return {
          ...prev,
          workCategory: '',
          requiredSkills: filtered.join(', ')
        };
      });
      return;
    }

    const template = WORK_CATEGORY_DATA[category] || {
      title: `${category} Work`,
      description: `Looking for farm workers for ${category.toLowerCase()} work.`,
      skill: category
    };

    setFormData(prev => {
      const prevAutoSkill = WORK_CATEGORY_DATA[prev.workCategory]?.skill;
      let skillsArr = (prev.requiredSkills || '').split(',').map(s => s.trim()).filter(Boolean);
      skillsArr = skillsArr.filter(s => !prevAutoSkill || s.toLowerCase() !== prevAutoSkill.toLowerCase());
      if (template.skill && !skillsArr.some(s => s.toLowerCase() === template.skill.toLowerCase())) {
        skillsArr.push(template.skill);
      }

      return {
        ...prev,
        workCategory: category,
        workTitle: hasUserEditedTitle && prev.workTitle.trim() ? prev.workTitle : template.title,
        workDescription: hasUserEditedDesc && prev.workDescription.trim() ? prev.workDescription : template.description,
        requiredSkills: skillsArr.join(', ')
      };
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'workCategory') {
      selectCategory(value);
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTitleChange = (e) => {
    setHasUserEditedTitle(true);
    handleChange(e);
  };

  const handleDescChange = (e) => {
    setHasUserEditedDesc(true);
    handleChange(e);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.rateUnit === 'hourly' && formData.startTime && formData.endTime) {
      const [sh, sm] = formData.startTime.split(':').map(Number);
      const [eh, em] = formData.endTime.split(':').map(Number);
      if (eh * 60 + em <= sh * 60 + sm) {
        toast.error('End time must be after start time.', { id: 'group-req-toast' });
        return;
      }
    }

    if (Number(formData.requiredWorkers) > (leader.teamId?.memberCount || 0)) {
      toast.error(`Team only has ${leader.teamId?.memberCount} members. Cannot request ${formData.requiredWorkers}.`, { id: 'group-req-toast' });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        teamLeaderId: leader._id,
        ...formData,
        requiredWorkers: Number(formData.requiredWorkers),
        requiredSkills: formData.requiredSkills.split(',').map(s => s.trim()).filter(Boolean),
        location: {
          addressLine1: formData.addressLine1,
          city: formData.city
        }
      };

      await workerBookingService.createGroupRequest(payload);
      toast.success('Group work request sent successfully!', { id: 'group-req-toast' });
      navigate('/user/my-worker-requests?tab=group', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send group request', { id: 'group-req-toast' });
    } finally {
      setLoading(false);
    }
  };

  const currentLeaderRate = formData.rateUnit === 'hourly' ? (leader.hourlyRate || 0) : (leader.dailyRate || 0);

  const shiftSummary = getShiftSummary(
    formData.startTime,
    formData.endTime,
    formData.farmerOfferedRatePerWorker || currentLeaderRate,
    formData.requiredWorkers
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Helmet>
        <title>Request Group Workers | Agroyilt</title>
      </Helmet>

      <div className="bg-white sticky top-0 z-40 border-b border-slate-100 px-4 py-3 shadow-xs">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 flex items-center justify-center text-slate-600 transition-colors active:scale-95"
          >
            <FiArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">New Group Request</h1>
            <p className="text-[11px] text-slate-500 font-medium">To {leader.teamId?.name || leader.name}</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-3.5 py-3 sm:px-4 sm:py-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
              <FiUsers size={14} className="text-emerald-600" /> Team Requirements
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex justify-between">
                  Workers Required *
                  <span className="text-emerald-600 font-semibold">Max available: {leader.teamId?.memberCount || 0}</span>
                </label>
                <div className="relative">
                  <FiUsers className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    required
                    type="number"
                    min="1"
                    max={leader.teamId?.memberCount || 100}
                    name="requiredWorkers"
                    value={formData.requiredWorkers}
                    onChange={handleChange}
                    placeholder="e.g. 5"
                    className="w-full bg-slate-50/80 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
              <FiFileText size={14} className="text-emerald-600" /> Work Details
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">
                  Work Category <span className="text-red-500">*</span>
                </label>
                <WorkCategorySelect
                  value={formData.workCategory}
                  onChange={handleChange}
                  error={false}
                  categories={WORK_CATEGORIES}
                  categoryData={WORK_CATEGORY_DATA}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600">
                    Work Title <span className="text-red-500">*</span>
                  </label>
                  {formData.workCategory && (
                    <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md">
                      ✨ Auto-filled • Edit if needed
                    </span>
                  )}
                </div>
                <input
                  required
                  type="text"
                  name="workTitle"
                  value={formData.workTitle}
                  onChange={handleTitleChange}
                  placeholder={formData.workCategory ? 'e.g. Wheat Harvesting' : 'Select a category above to auto-fill'}
                  className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600">
                    Description <span className="text-red-500">*</span>
                  </label>
                  {formData.workCategory && (
                    <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md">
                      ✨ Auto-filled • Edit if needed
                    </span>
                  )}
                </div>
                <textarea
                  required
                  name="workDescription"
                  value={formData.workDescription}
                  onChange={handleDescChange}
                  placeholder="Describe the work: What needs to be done, field size, tools needed, etc."
                  rows={2}
                  className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
              <FiCalendar size={14} className="text-emerald-600" /> Schedule & Location
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Date *</label>
                <div
                  className="relative cursor-pointer group"
                  onClick={(e) => {
                    const input = e.currentTarget.querySelector('input[type="date"]');
                    try { input?.showPicker(); } catch (err) { input?.focus(); }
                  }}
                >
                  {/* Visible formatted DD/MM/YYYY display */}
                  <div className="w-full bg-slate-50/80 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm flex items-center justify-between transition-all group-hover:border-emerald-300 group-focus-within:ring-2 group-focus-within:ring-emerald-500 group-focus-within:border-emerald-500">
                    <FiCalendar className="absolute left-3 top-2.5 text-slate-400 group-hover:text-emerald-600 transition-colors" size={14} />
                    <span className={formData.scheduledDate ? 'text-slate-800 font-bold tracking-wide' : 'text-slate-400 font-normal'}>
                      {formatToDDMMYYYY(formData.scheduledDate) || 'DD/MM/YYYY'}
                    </span>
                    <span className="text-xs opacity-60 group-hover:opacity-100 transition-opacity">📅</span>
                  </div>
                  <input
                    required
                    type="date"
                    name="scheduledDate"
                    id="group-scheduled-date"
                    min={new Date().toISOString().split('T')[0]}
                    value={formData.scheduledDate}
                    onChange={handleChange}
                    onClick={(e) => {
                      try { e.target.showPicker(); } catch (err) {}
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        try { e.target.showPicker(); } catch (err) {}
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                </div>
                {formData.scheduledDate && (
                  <p className="text-[10px] sm:text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/60 rounded-md px-2 py-0.5 flex items-center gap-1 mt-1 w-fit">
                    <span>🗓️</span>
                    <span>{formatFriendlyDay(formData.scheduledDate)}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 mb-1 block">Start Time *</label>
                  <input
                    required
                    type="time"
                    name="startTime"
                    value={formData.startTime}
                    onChange={handleChange}
                    className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-2.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 mb-1 block">End Time *</label>
                  <input
                    required
                    type="time"
                    name="endTime"
                    value={formData.endTime}
                    onChange={handleChange}
                    className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-2.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Live Shift Summary Badge */}
              {shiftSummary && !shiftSummary.isZero && (
                <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                  shiftSummary.isOvernight
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{shiftSummary.isOvernight ? '🌙' : '⏱️'}</span>
                    <div>
                      <span className="font-bold text-xs">
                        {shiftSummary.isOvernight ? 'Overnight: ' : 'Shift: '}
                        {shiftSummary.durationText}
                      </span>
                      {shiftSummary.isOvernight && (
                        <span className="block text-[10px] text-indigo-600 font-medium">Finishes next day</span>
                      )}
                    </div>
                  </div>
                  {shiftSummary.estimatedCost && (
                    <span className="font-bold text-xs bg-white/90 px-2 py-0.5 rounded-lg shadow-xs">
                      ~₹{shiftSummary.estimatedCost} est.
                    </span>
                  )}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Location / City *</label>
                <div className="relative">
                  <FiMapPin className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    required
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="e.g. Indore, Madhya Pradesh"
                    className="w-full bg-slate-50/80 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FiDollarSign size={14} className="text-emerald-600" /> Rate Offer
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                Leader asks: ₹{currentLeaderRate}/{formData.rateUnit}
              </span>
            </h3>
            
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => setFormData({...formData, rateUnit: 'daily'})}
                className={`py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all ${
                  formData.rateUnit === 'daily'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                Daily Rate
              </button>
              <button
                type="button"
                onClick={() => setFormData({...formData, rateUnit: 'hourly'})}
                className={`py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all ${
                  formData.rateUnit === 'hourly'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                Hourly Rate
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 block">Offer PER WORKER (₹) *</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-xs sm:text-sm font-bold">₹</span>
                <input
                  required
                  type="number"
                  min="1"
                  name="farmerOfferedRatePerWorker"
                  value={formData.farmerOfferedRatePerWorker}
                  onChange={handleChange}
                  placeholder={`e.g. ${currentLeaderRate}`}
                  className="w-full bg-slate-50/80 border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
              
              {formData.requiredWorkers && formData.farmerOfferedRatePerWorker && (
                <div className="mt-2.5 p-2.5 bg-emerald-50/80 border border-emerald-100 rounded-xl">
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-emerald-800 font-medium">Estimated Total:</span>
                    <span className="font-bold text-emerald-800 text-base">
                      ₹{Number(formData.requiredWorkers) * Number(formData.farmerOfferedRatePerWorker)}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-600/80 mt-0.5">Total based on your requested {formData.requiredWorkers} workers.</p>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm sm:text-base shadow-md shadow-emerald-600/20 active:scale-[0.99] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
            {loading ? 'Sending Request...' : 'Send Group Request'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default GroupRequestForm;
