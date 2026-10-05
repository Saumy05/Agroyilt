import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FiArrowLeft, FiMapPin, FiCalendar, FiClock, FiDollarSign, FiUsers } from 'react-icons/fi';
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
    if (Number(formData.requiredWorkers) > (leader.teamId?.memberCount || 0)) {
      toast.error(`Team only has ${leader.teamId?.memberCount} members. Cannot request ${formData.requiredWorkers}.`);
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
      toast.success('Group work request sent successfully!');
      navigate('/user/my-worker-requests', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send group request');
    } finally {
      setLoading(false);
    }
  };

  const currentLeaderRate = formData.rateUnit === 'hourly' ? (leader.hourlyRate || 0) : (leader.dailyRate || 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Helmet>
        <title>Request Group Workers | Agroyilt</title>
      </Helmet>

      <div className="bg-white sticky top-0 z-40 border-b border-slate-100 px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 active:scale-95">
            <FiArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800">New Group Request</h1>
            <p className="text-xs text-slate-500 font-medium">To {leader.teamId?.name || leader.name}</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-5">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4">Team Requirements</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 flex justify-between">
                  Workers Required *
                  <span className="text-emerald-600">Max available: {leader.teamId?.memberCount || 0}</span>
                </label>
                <div className="relative">
                  <FiUsers className="absolute left-4 top-3.5 text-slate-400" />
                  <input required type="number" min="1" max={leader.teamId?.memberCount || 100} name="requiredWorkers" value={formData.requiredWorkers} onChange={handleChange} placeholder="e.g. 5" className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4">Work Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                  Work Category <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  name="workCategory"
                  value={formData.workCategory}
                  onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select work category *</option>
                  {WORK_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {WORK_CATEGORY_DATA[c]?.icon} {c}
                    </option>
                  ))}
                </select>
              </div>

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
                  required
                  type="text"
                  name="workTitle"
                  value={formData.workTitle}
                  onChange={handleTitleChange}
                  placeholder={formData.workCategory ? 'e.g. Wheat Harvesting' : 'Select a category above to auto-fill'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

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
                  required
                  name="workDescription"
                  value={formData.workDescription}
                  onChange={handleDescChange}
                  placeholder="Describe the work: What needs to be done, field size, tools needed, etc."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4">Schedule & Location</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Date *</label>
                <div className="relative">
                  <FiCalendar className="absolute left-4 top-3.5 text-slate-400" />
                  <input required type="date" name="scheduledDate" min={new Date().toISOString().split('T')[0]} value={formData.scheduledDate} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Start Time *</label>
                  <input required type="time" name="startTime" value={formData.startTime} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">End Time *</label>
                  <input required type="time" name="endTime" value={formData.endTime} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Location / City *</label>
                <div className="relative">
                  <FiMapPin className="absolute left-4 top-3.5 text-slate-400" />
                  <input required type="text" name="city" value={formData.city} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4 flex items-center justify-between">
              Rate Offer
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                Leader asks: ₹{currentLeaderRate}/{formData.rateUnit}
              </span>
            </h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <button type="button" onClick={() => setFormData({...formData, rateUnit: 'daily'})} className={`py-3 rounded-2xl text-sm font-bold border transition-all ${formData.rateUnit === 'daily' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>Daily Rate</button>
              <button type="button" onClick={() => setFormData({...formData, rateUnit: 'hourly'})} className={`py-3 rounded-2xl text-sm font-bold border transition-all ${formData.rateUnit === 'hourly' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>Hourly Rate</button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Offer PER WORKER (₹) *</label>
              <div className="relative">
                <FiDollarSign className="absolute left-4 top-3.5 text-slate-400" />
                <input required type="number" min="1" name="farmerOfferedRatePerWorker" value={formData.farmerOfferedRatePerWorker} onChange={handleChange} placeholder={`e.g. ${currentLeaderRate}`} className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              
              {formData.requiredWorkers && formData.farmerOfferedRatePerWorker && (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-emerald-700 font-medium">Estimated Total:</span>
                    <span className="font-black text-emerald-700 text-lg">
                      ₹{Number(formData.requiredWorkers) * Number(formData.farmerOfferedRatePerWorker)}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-600/70 mt-1">Total based on your requested {formData.requiredWorkers} workers.</p>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm active:scale-[0.98] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
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
