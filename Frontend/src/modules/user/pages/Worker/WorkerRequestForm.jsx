import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  FiArrowLeft, FiMapPin, FiCalendar, FiClock,
  FiUsers, FiTag, FiFileText, FiDollarSign, FiInfo, FiCheckCircle, FiUser
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import workerBookingService from '../../../../services/workerBookingService';
import LocationPicker from '../Checkout/components/LocationPicker';

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

const COMMON_SKILLS = [
  'Harvesting', 'Sowing', 'Planting', 'Irrigation',
  'Weeding', 'Fertilizing', 'Pesticide Spraying',
  'Tractor Driving', 'General Farm Labour', 'Threshing'
];

const WorkerRequestForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const targetedWorker = location.state?.worker;
  const targetedWorkerId = id || targetedWorker?._id;

  const [loading, setLoading] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [hasUserEditedTitle, setHasUserEditedTitle] = useState(false);
  const [hasUserEditedDesc, setHasUserEditedDesc] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const initialCat = targetedWorker?.skills?.[0] || targetedWorker?.primaryService || '';
  const initialTemplate = WORK_CATEGORY_DATA[initialCat];

  const [formData, setFormData] = useState({
    bookingType:     'HOURLY', // 'HOURLY' | 'DAILY'
    workCategory:    initialCat,
    workTitle:       targetedWorker ? `Hire ${targetedWorker.name}` : (initialTemplate?.title || ''),
    workDescription: initialTemplate?.description || (targetedWorker ? `Need farm assistance from ${targetedWorker.name} for farm work.` : ''),
    requiredSkills:  targetedWorker?.skills?.length ? targetedWorker.skills : (initialTemplate?.skill ? [initialTemplate.skill] : []),
    requiredWorkers: '1',
    // HOURLY fields
    scheduledDate:   '',
    startTime:       '',
    endTime:         '',
    // DAILY fields
    startDate:       '',
    numberOfDays:    '1',
    // Rates
    minRate:         targetedWorker?.dailyRate || targetedWorker?.hourlyRate || '',
    maxRate:         targetedWorker?.dailyRate || targetedWorker?.hourlyRate || '',
    // Location fields
    addressLine1:    '',
    city:            '',
    state:           '',
    lat:             '',
    lng:             '',
    additionalInstructions: ''
  });

  useEffect(() => {
    if (targetedWorker) {
      const cat = targetedWorker.skills?.[0] || targetedWorker.primaryService || '';
      const tmpl = WORK_CATEGORY_DATA[cat];
      setFormData(prev => ({
        ...prev,
        requiredWorkers: '1',
        workCategory: cat || prev.workCategory,
        workTitle: prev.workTitle || `Hire ${targetedWorker.name}`,
        workDescription: prev.workDescription || (tmpl?.description || `Need farm assistance from ${targetedWorker.name} for farm work.`),
        requiredSkills: targetedWorker.skills?.length ? targetedWorker.skills : prev.requiredSkills,
        minRate: targetedWorker.dailyRate || targetedWorker.hourlyRate || prev.minRate,
        maxRate: targetedWorker.dailyRate || targetedWorker.hourlyRate || prev.maxRate,
      }));
    }
  }, [targetedWorker]);

  const [errors, setErrors] = useState({});

  const selectCategory = (category) => {
    if (!category) {
      setFormData(prev => {
        const prevAutoSkill = WORK_CATEGORY_DATA[prev.workCategory]?.skill;
        return {
          ...prev,
          workCategory: '',
          requiredSkills: prev.requiredSkills.filter(
            s => !prevAutoSkill || s.toLowerCase() !== prevAutoSkill.toLowerCase()
          )
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
      // Remove the skill added by the previous category, keep user's other manual skills
      const nextSkills = prev.requiredSkills.filter(
        s => !prevAutoSkill || s.toLowerCase() !== prevAutoSkill.toLowerCase()
      );
      if (template.skill && !nextSkills.some(s => s.toLowerCase() === template.skill.toLowerCase())) {
        nextSkills.push(template.skill);
      }

      return {
        ...prev,
        workCategory: category,
        workTitle: hasUserEditedTitle && prev.workTitle.trim()
          ? prev.workTitle
          : (targetedWorker ? `Hire ${targetedWorker.name}` : template.title),
        workDescription: hasUserEditedDesc && prev.workDescription.trim()
          ? prev.workDescription
          : template.description,
        requiredSkills: nextSkills
      };
    });

    setErrors(prev => {
      const nextErr = { ...prev, workCategory: '' };
      if (!hasUserEditedTitle) nextErr.workTitle = '';
      if (!hasUserEditedDesc) nextErr.workDescription = '';
      return nextErr;
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'workCategory') {
      selectCategory(value);
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleTitleChange = (e) => {
    setHasUserEditedTitle(true);
    handleChange(e);
  };

  const handleDescChange = (e) => {
    setHasUserEditedDesc(true);
    handleChange(e);
  };

  const addSkill = (skill) => {
    const normalized = skill.trim();
    if (!normalized) return;
    if (formData.requiredSkills.some(s => s.toLowerCase() === normalized.toLowerCase())) {
      toast.error('Skill already added');
      return;
    }
    if (formData.requiredSkills.length >= 10) {
      toast.error('Maximum 10 skills allowed');
      return;
    }
    setFormData(prev => ({
      ...prev,
      requiredSkills: [...prev.requiredSkills, normalized]
    }));
    setSkillInput('');
  };

  const removeSkill = (skill) => {
    setFormData(prev => ({
      ...prev,
      requiredSkills: prev.requiredSkills.filter(s => s !== skill)
    }));
  };

  const validate = () => {
    const e = {};
    if (!formData.workCategory || !formData.workCategory.trim())
      e.workCategory = 'Please select a work category.';
    if (!formData.workTitle.trim() || formData.workTitle.trim().length < 3)
      e.workTitle = 'Work title must be at least 3 characters.';
    if (!formData.workDescription.trim() || formData.workDescription.trim().length < 10)
      e.workDescription = 'Description must be at least 10 characters.';
    const qty = parseInt(formData.requiredWorkers, 10);
    if (!formData.requiredWorkers || isNaN(qty) || qty < 1 || !Number.isInteger(qty))
      e.requiredWorkers = 'Enter a valid positive number of workers.';

    if (formData.bookingType === 'DAILY') {
      if (!formData.startDate)
        e.startDate = 'Please select a start date.';
      const days = parseInt(formData.numberOfDays, 10);
      if (!formData.numberOfDays || isNaN(days) || days < 1)
        e.numberOfDays = 'Number of days must be at least 1.';
    } else {
      // HOURLY
      if (!formData.scheduledDate)
        e.scheduledDate = 'Please select a date.';
      if (!formData.startTime)
        e.startTime = 'Start time is required.';
      if (!formData.endTime)
        e.endTime = 'End time is required.';
      if (formData.startTime && formData.endTime) {
        const [sh, sm] = formData.startTime.split(':').map(Number);
        const [eh, em] = formData.endTime.split(':').map(Number);
        if (eh * 60 + em <= sh * 60 + sm)
          e.endTime = 'End time must be after start time.';
      }
    }

    if (!formData.city.trim() && !formData.addressLine1.trim())
      e.city = 'Please enter at least a city name.';
    if (!formData.minRate || isNaN(Number(formData.minRate)) || Number(formData.minRate) <= 0)
      e.minRate = `Enter a valid minimum ${formData.bookingType === 'DAILY' ? 'daily' : 'hourly'} rate (> 0).`;
    if (formData.maxRate && !isNaN(Number(formData.maxRate)) && Number(formData.minRate) > Number(formData.maxRate))
      e.maxRate = 'Max rate cannot be less than min rate.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      toast.error(Object.values(validationErrors)[0]);
      return;
    }

    try {
      setLoading(true);
      const isDaily = formData.bookingType === 'DAILY';
      const minR = Number(formData.minRate);
      const maxR = formData.maxRate ? Number(formData.maxRate) : minR;

      const payload = {
        bookingType:     formData.bookingType,
        workCategory:    formData.workCategory,
        workTitle:       formData.workTitle.trim(),
        workDescription: formData.workDescription.trim(),
        requiredSkills:  formData.requiredSkills,
        requiredWorkers: parseInt(formData.requiredWorkers, 10),
        rateUnit:        isDaily ? 'daily' : 'hourly',
        location: {
          addressLine1: formData.addressLine1,
          city:         formData.city,
          state:        formData.state,
          lat:          formData.lat !== '' ? Number(formData.lat) : undefined,
          lng:          formData.lng !== '' ? Number(formData.lng) : undefined
        },
        additionalInstructions: formData.additionalInstructions
      };

      if (isDaily) {
        payload.startDate    = formData.startDate;
        payload.numberOfDays = parseInt(formData.numberOfDays, 10);
        payload.minDailyRate = minR;
        payload.maxDailyRate = maxR;
      } else {
        payload.scheduledDate = formData.scheduledDate;
        payload.startTime     = formData.startTime;
        payload.endTime       = formData.endTime;
        payload.minRate       = minR;
        payload.maxRate       = maxR;
      }

      if (targetedWorkerId) {
        payload.targetedWorkerId = targetedWorkerId;
      }

      await workerBookingService.createFarmerRequest(payload);
      toast.success('Request submitted! Finding workers near you...');
      navigate('/user/my-worker-requests', { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to submit request. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const FieldError = ({ name }) =>
    errors[name] ? <p className="text-xs text-red-500 mt-1 ml-1">{errors[name]}</p> : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Helmet>
        <title>New Work Request | Agroyilt</title>
        <meta name="description" content="Create a worker request and let AgroYilt find farm workers near your location." />
      </Helmet>

      {/* Header */}
      <div className="bg-white sticky top-0 z-40 border-b border-slate-100 px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/user/worker-explorer')}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 active:scale-95"
          >
            <FiArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800">New Work Request</h1>
            <p className="text-xs text-slate-500 font-medium">We'll find workers for you</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-5">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Targeted Worker Hiring Banner */}
          {targetedWorker && (
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-lg">
                  {targetedWorker.name?.[0]?.toUpperCase() || <FiUser />}
                </div>
                <div>
                  <h4 className="font-black text-sm">Hiring {targetedWorker.name}</h4>
                  <p className="text-[11px] text-emerald-100">
                    {targetedWorker.skills?.join(', ') || 'Agricultural Worker'} • {targetedWorker.address?.city || 'Verified'}
                  </p>
                </div>
              </div>
              <span className="text-[10px] bg-white/20 px-2.5 py-1 rounded-full font-bold">
                Direct Hire
              </span>
            </div>
          )}

          {/* Info note */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 items-start">
            <FiInfo size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              {targetedWorker
                ? `You are sending a direct booking request to ${targetedWorker.name}. If they are unavailable, the request will automatically help you find another matching worker.`
                : "Fill in your requirements below. Based on the number of workers needed, the system will automatically match independent workers or a team."}
            </p>
          </div>

          {/* ── Booking Mode Selection ────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-800 mb-3 flex items-center gap-2">
              <FiTag size={16} className="text-emerald-600" /> Booking Mode *
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="booking-mode-hourly"
                onClick={() => setFormData(prev => ({ ...prev, bookingType: 'HOURLY', rateUnit: 'hourly' }))}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  formData.bookingType === 'HOURLY'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-sm text-slate-800">Hourly Booking</span>
                  {formData.bookingType === 'HOURLY' && <FiCheckCircle className="text-emerald-600" size={16} />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  For short shifts by the hour. Timer starts with Reach OTP.
                </p>
              </button>

              <button
                type="button"
                id="booking-mode-daily"
                onClick={() => setFormData(prev => ({ ...prev, bookingType: 'DAILY', rateUnit: 'daily' }))}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  formData.bookingType === 'DAILY'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-sm text-slate-800">Daily Booking</span>
                  {formData.bookingType === 'DAILY' && <FiCheckCircle className="text-emerald-600" size={16} />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Multi-day farm work. Fresh Reach OTP every working day.
                </p>
              </button>
            </div>
          </div>

          {/* ── Work Details ─────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
              <FiFileText size={16} className="text-emerald-600" /> Work Details
            </h3>
            <div className="space-y-4">

              {/* Work Category */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                  Work Category <span className="text-red-500">*</span>
                </label>
                <select
                  name="workCategory"
                  value={formData.workCategory}
                  onChange={handleChange}
                  className={`w-full bg-slate-50 border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    errors.workCategory ? 'border-red-300' : 'border-slate-200'
                  }`}
                >
                  <option value="">Select work category *</option>
                  {WORK_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {WORK_CATEGORY_DATA[c]?.icon} {c}
                    </option>
                  ))}
                </select>
                <FieldError name="workCategory" />
              </div>

              {/* Work Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Work Title <span className="text-red-500">*</span>
                  </label>
                  {formData.workCategory && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                      ✨ Auto-filled • Edit if needed
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  name="workTitle"
                  value={formData.workTitle}
                  onChange={handleTitleChange}
                  placeholder={formData.workCategory ? 'e.g. Wheat Harvesting' : 'Select a category above to auto-fill'}
                  className={`w-full bg-slate-50 border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.workTitle ? 'border-red-300' : 'border-slate-200'}`}
                />
                <FieldError name="workTitle" />
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Description <span className="text-red-500">*</span>
                  </label>
                  {formData.workCategory && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                      ✨ Auto-filled • Edit if needed
                    </span>
                  )}
                </div>
                <textarea
                  name="workDescription"
                  value={formData.workDescription}
                  onChange={handleDescChange}
                  placeholder="Describe the work: What needs to be done, field size, tools needed, etc."
                  rows={3}
                  className={`w-full bg-slate-50 border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.workDescription ? 'border-red-300' : 'border-slate-200'}`}
                />
                <FieldError name="workDescription" />
              </div>

              {/* Required Skills */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">
                  <FiTag size={12} className="inline mr-1" />
                  Required Skills (optional)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput); } }}
                    placeholder="Type a skill and press Enter"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => addSkill(skillInput)}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold"
                  >
                    Add
                  </button>
                </div>
                {/* Quick-add common skills */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {COMMON_SKILLS.filter(s => !formData.requiredSkills.includes(s)).slice(0, 6).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSkill(s)}
                      className="text-xs px-3 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
                {/* Added skills */}
                {formData.requiredSkills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.requiredSkills.map(s => (
                      <span
                        key={s}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full font-semibold"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => removeSkill(s)}
                          className="ml-1 text-emerald-500 hover:text-red-500 font-black text-xs"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Workers Required */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">
                  <FiUsers size={12} className="inline mr-1" />
                  Number of Workers Required *
                </label>
                <input
                  type="number"
                  name="requiredWorkers"
                  value={formData.requiredWorkers}
                  onChange={handleChange}
                  min="1"
                  max="100"
                  step="1"
                  placeholder="e.g. 3"
                  className={`w-full bg-slate-50 border rounded-2xl px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.requiredWorkers ? 'border-red-300' : 'border-slate-200'}`}
                />
                <FieldError name="requiredWorkers" />
                <p className="text-[10px] text-slate-400 mt-1 ml-1">
                  The system automatically decides whether to match individual workers or a Team Leader based on this number.
                </p>
              </div>

              {/* Additional Instructions */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Additional Instructions (optional)</label>
                <textarea
                  name="additionalInstructions"
                  value={formData.additionalInstructions}
                  onChange={handleChange}
                  placeholder="Any specific instructions, tools to bring, dress code, etc."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* ── Schedule ──────────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
              <FiCalendar size={16} className="text-emerald-600" /> Schedule ({formData.bookingType === 'DAILY' ? 'Daily Farm Work' : 'Hourly Shift'})
            </h3>
            <div className="space-y-4">
              {formData.bookingType === 'DAILY' ? (
                /* DAILY SCHEDULE */
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Start Date *</label>
                    <div className="relative">
                      <FiCalendar className="absolute left-4 top-3.5 text-slate-400" size={16} />
                      <input
                        type="date"
                        name="startDate"
                        id="daily-start-date"
                        min={today}
                        value={formData.startDate}
                        onChange={handleChange}
                        className={`w-full bg-slate-50 border rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.startDate ? 'border-red-300' : 'border-slate-200'}`}
                      />
                    </div>
                    <FieldError name="startDate" />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Number of Days *</label>
                    <input
                      type="number"
                      name="numberOfDays"
                      id="daily-number-of-days"
                      min="1"
                      max="60"
                      value={formData.numberOfDays}
                      onChange={handleChange}
                      placeholder="e.g. 3"
                      className={`w-full bg-slate-50 border rounded-2xl px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.numberOfDays ? 'border-red-300' : 'border-slate-200'}`}
                    />
                    <FieldError name="numberOfDays" />
                  </div>
                </div>
              ) : (
                /* HOURLY SCHEDULE */
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Date *</label>
                    <div className="relative">
                      <FiCalendar className="absolute left-4 top-3.5 text-slate-400" size={16} />
                      <input
                        type="date"
                        name="scheduledDate"
                        id="hourly-scheduled-date"
                        min={today}
                        value={formData.scheduledDate}
                        onChange={handleChange}
                        className={`w-full bg-slate-50 border rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.scheduledDate ? 'border-red-300' : 'border-slate-200'}`}
                      />
                    </div>
                    <FieldError name="scheduledDate" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Start Time *</label>
                      <div className="relative">
                        <FiClock className="absolute left-4 top-3.5 text-slate-400" size={14} />
                        <input
                          type="time"
                          name="startTime"
                          id="hourly-start-time"
                          value={formData.startTime}
                          onChange={handleChange}
                          className={`w-full bg-slate-50 border rounded-2xl pl-10 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.startTime ? 'border-red-300' : 'border-slate-200'}`}
                        />
                      </div>
                      <FieldError name="startTime" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">End Time *</label>
                      <div className="relative">
                        <FiClock className="absolute left-4 top-3.5 text-slate-400" size={14} />
                        <input
                          type="time"
                          name="endTime"
                          id="hourly-end-time"
                          value={formData.endTime}
                          onChange={handleChange}
                          className={`w-full bg-slate-50 border rounded-2xl pl-10 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.endTime ? 'border-red-300' : 'border-slate-200'}`}
                        />
                      </div>
                      <FieldError name="endTime" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Location ──────────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
              <FiMapPin size={16} className="text-emerald-600" /> Work Location
            </h3>
            
            <div className="mb-5 rounded-2xl overflow-hidden border border-slate-200">
              <LocationPicker 
                onLocationSelect={(loc) => {
                  let city = '';
                  let state = '';
                  if (loc.components) {
                    const cityComp = loc.components.find(c => c.types.includes('locality') || c.types.includes('administrative_area_level_2'));
                    const stateComp = loc.components.find(c => c.types.includes('administrative_area_level_1'));
                    if (cityComp) city = cityComp.long_name;
                    if (stateComp) state = stateComp.long_name;
                  }
                  setFormData(prev => ({
                    ...prev,
                    lat: loc.lat.toString(),
                    lng: loc.lng.toString(),
                    addressLine1: loc.address || prev.addressLine1,
                    city: city || prev.city,
                    state: state || prev.state
                  }));
                }}
              />
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">City / Village *</label>
                <div className="relative">
                  <FiMapPin className="absolute left-4 top-3.5 text-slate-400" size={14} />
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="e.g. Indore, Madhya Pradesh"
                    className={`w-full bg-slate-50 border rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.city ? 'border-red-300' : 'border-slate-200'}`}
                  />
                </div>
                <FieldError name="city" />
              </div>
              <div>
                <input
                  type="text"
                  name="addressLine1"
                  value={formData.addressLine1}
                  onChange={handleChange}
                  placeholder="Farm address / landmark (optional)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="State (optional)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  name="lat"
                  value={formData.lat}
                  onChange={handleChange}
                  placeholder="Latitude (optional)"
                  step="any"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="number"
                  name="lng"
                  value={formData.lng}
                  onChange={handleChange}
                  placeholder="Longitude (optional)"
                  step="any"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 ml-1">
                Providing coordinates improves radius-based worker matching accuracy.
              </p>
            </div>
          </div>

          {/* ── Budget ────────────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <FiDollarSign size={16} className="text-emerald-600" /> Budget / Rate per Worker
              </h3>
              <span className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                {formData.bookingType === 'DAILY' ? '₹ / Day' : '₹ / Hour'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {formData.bookingType === 'DAILY' 
                ? 'Specify expected daily wage per worker for each working day' 
                : 'Specify expected hourly wage per worker'}
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Min {formData.bookingType === 'DAILY' ? 'Daily' : 'Hourly'} Rate (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-400 text-sm font-bold">₹</span>
                    <input
                      type="number"
                      name="minRate"
                      id="budget-min-rate"
                      value={formData.minRate}
                      onChange={handleChange}
                      min="1"
                      placeholder={formData.bookingType === 'DAILY' ? '500' : '150'}
                      className={`w-full bg-slate-50 border rounded-2xl pl-8 pr-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.minRate ? 'border-red-300' : 'border-slate-200'}`}
                    />
                  </div>
                  <FieldError name="minRate" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Max {formData.bookingType === 'DAILY' ? 'Daily' : 'Hourly'} Rate (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-400 text-sm font-bold">₹</span>
                    <input
                      type="number"
                      name="maxRate"
                      id="budget-max-rate"
                      value={formData.maxRate}
                      onChange={handleChange}
                      min="1"
                      placeholder={formData.bookingType === 'DAILY' ? '600 (optional)' : '200 (optional)'}
                      className={`w-full bg-slate-50 border rounded-2xl pl-8 pr-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-emerald-500 ${errors.maxRate ? 'border-red-300' : 'border-slate-200'}`}
                    />
                  </div>
                  <FieldError name="maxRate" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 ml-1">
                Workers within radius will receive requests in this range. If maximum rate is left empty, the minimum rate will be used for the payment reserve.
              </p>
            </div>
          </div>

          {/* Submit */}
          <button
            id="submit-farmer-request-btn"
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-3xl font-black text-base shadow-lg shadow-emerald-200/60 active:scale-[0.98] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FiCheckCircle size={18} />
            )}
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>

        </form>
      </div>
    </div>
  );
};

export default WorkerRequestForm;
