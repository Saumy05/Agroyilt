import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  FiArrowLeft, FiMapPin, FiCalendar, FiClock,
  FiUsers, FiTag, FiFileText, FiDollarSign, FiCheckCircle, FiUser,
  FiChevronDown, FiCheck
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
        id="work-category-dropdown-btn"
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

const calculateEndTime = (startTimeStr, hours) => {
  if (!startTimeStr) return '';
  const [sh, sm] = startTimeStr.split(':').map(Number);
  if (isNaN(sh)) return '';
  const totalMins = Math.round(sh * 60 + (sm || 0) + (Number(hours) || 1) * 60);
  const wrapped = totalMins % (24 * 60);
  const eh = Math.floor(wrapped / 60);
  const em = wrapped % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
};

const formatTime12H = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m || 0).padStart(2, '0')} ${period}`;
};

const getShiftSummary = (startTime, endTime, hourlyRate, workersCount, durationHours) => {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;

  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  if (startMins === endMins) {
    return { isZero: true };
  }

  let isOvernight = false;
  let diff = endMins - startMins;
  if (diff < 0) {
    diff += 24 * 60;
    isOvernight = true;
  }

  const hours = Number(durationHours) || Math.max(1, Math.round(diff / 60));
  const durationText = `${hours} hr${hours > 1 ? 's' : ''}`;
  const rate = Number(hourlyRate) || 0;
  const workers = parseInt(workersCount, 10) || 1;
  const estimatedCost = rate > 0 ? Math.round(hours * rate * workers) : null;

  return {
    diff,
    hours,
    durationText,
    isOvernight,
    estimatedCost
  };
};


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

  // Local calendar date helper
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getLocalDateString(new Date());

  const getTomorrowDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  };
  const tomorrow = getTomorrowDateString();

  // If currently after 18:00 (6 PM), same-day daily farm work is closed; advance min daily start date to tomorrow
  const isLateEvening = new Date().getHours() >= 18;
  const minDailyStartDate = isLateEvening ? tomorrow : today;
  // If after 23:00, same-day hourly work has closed; advance min hourly date to tomorrow
  const isLateNight = new Date().getHours() >= 23;
  const minHourlyDate = isLateNight ? tomorrow : today;

  // Calculates minimum allowed upcoming time for today with buffer (default 30 mins)
  const getMinTimeForToday = (bufferMinutes = 30) => {
    const now = new Date();
    const roundedNow = new Date(now.getTime() + bufferMinutes * 60000);
    const rem = roundedNow.getMinutes() % 15;
    if (rem !== 0) {
      roundedNow.setMinutes(roundedNow.getMinutes() + (15 - rem));
    }
    const h = roundedNow.getHours();
    const m = roundedNow.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const getDefaultStartTime = () => {
    const now = new Date();
    const nextHour = now.getHours() + 1;
    if (nextHour >= 24) return '08:00';
    return `${String(nextHour).padStart(2, '0')}:00`;
  };
  const defaultStartTime = getDefaultStartTime();
  const defaultEndTime = calculateEndTime(defaultStartTime, 1);

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
    startTime:       defaultStartTime,
    durationHours:   '1',
    endTime:         defaultEndTime,
    // DAILY fields
    startDate:       isLateEvening ? tomorrow : '',
    numberOfDays:    '1',
    reportingTime:   '09:00',
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

  const shiftSummary = getShiftSummary(
    formData.startTime,
    formData.endTime,
    formData.minRate,
    formData.requiredWorkers,
    formData.durationHours
  );

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

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // If switching to today, auto-adjust time if previously selected time has already passed
      if (value === today) {
        const minTime = getMinTimeForToday(30);
        if (name === 'scheduledDate' && (!prev.startTime || prev.startTime < minTime)) {
          next.startTime = minTime;
          next.endTime = calculateEndTime(minTime, prev.durationHours || 1);
          toast.success(`Start time adjusted to ${formatTime12H(minTime)} (earliest available today)`, { id: 'time-adj-toast' });
        }
        if (name === 'startDate' && (!prev.reportingTime || prev.reportingTime < minTime)) {
          next.reportingTime = minTime;
          toast.success(`Reporting time adjusted to ${formatTime12H(minTime)} (earliest available today)`, { id: 'time-adj-toast' });
        }
      }
      return next;
    });

    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    if (name === 'scheduledDate' && errors.startTime) setErrors(prev => ({ ...prev, startTime: '' }));
    if (name === 'startDate' && errors.reportingTime) setErrors(prev => ({ ...prev, reportingTime: '' }));
  };

  const handleStartTimeChange = (e) => {
    const val = e.target.value;
    const computedEnd = calculateEndTime(val, formData.durationHours || 1);
    setFormData(prev => ({
      ...prev,
      startTime: val,
      endTime: computedEnd
    }));

    if (formData.scheduledDate === today && val) {
      const minTime = getMinTimeForToday(30);
      if (val < minTime) {
        setErrors(prev => ({
          ...prev,
          startTime: `Selected time (${formatTime12H(val)}) has already passed today. Earliest available start is ${formatTime12H(minTime)}.`
        }));
        return;
      }
    }

    if (errors.startTime) setErrors(prev => ({ ...prev, startTime: '' }));
    if (errors.endTime) setErrors(prev => ({ ...prev, endTime: '' }));
  };

  const handleReportingTimeChange = (e) => {
    const val = e.target.value;
    setFormData(prev => ({
      ...prev,
      reportingTime: val
    }));

    if (formData.startDate === today && val) {
      const minTime = getMinTimeForToday(30);
      if (val < minTime) {
        setErrors(prev => ({
          ...prev,
          reportingTime: `Reporting time (${formatTime12H(val)}) has already passed today. Earliest available time is ${formatTime12H(minTime)}.`
        }));
        return;
      }
    }

    if (errors.reportingTime) setErrors(prev => ({ ...prev, reportingTime: '' }));
  };

  const handleEndTimeChange = (e) => {
    const val = e.target.value;
    if (!val) {
      setFormData(prev => ({ ...prev, endTime: '' }));
      return;
    }
    const [sh, sm] = (formData.startTime || '08:00').split(':').map(Number);
    const [eh, em] = val.split(':').map(Number);
    let diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
    if (diff < 0) diff += 24 * 60;
    const computedHours = Math.max(0.5, Number((diff / 60).toFixed(1)));
    setFormData(prev => ({
      ...prev,
      endTime: val,
      durationHours: String(computedHours)
    }));
    if (errors.endTime) setErrors(prev => ({ ...prev, endTime: '' }));
  };

  const handleDurationSelect = (hours) => {
    const hrsStr = String(hours);
    const computedEnd = calculateEndTime(formData.startTime, hours);
    setFormData(prev => ({
      ...prev,
      durationHours: hrsStr,
      endTime: computedEnd
    }));
    if (errors.endTime) setErrors(prev => ({ ...prev, endTime: '' }));
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
      if (!formData.startDate) {
        e.startDate = 'Please select a start date.';
      } else if (formData.startDate < today) {
        e.startDate = 'Start date cannot be in the past.';
      } else if (isLateEvening && formData.startDate === today) {
        e.startDate = `It is evening (${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}). Same-day daily bookings are closed; please choose tomorrow (${formatToDDMMYYYY(tomorrow)}) or later.`;
      }

      const days = parseInt(formData.numberOfDays, 10);
      if (!formData.numberOfDays || isNaN(days) || days < 1)
        e.numberOfDays = 'Number of days must be at least 1.';

      if (!formData.reportingTime) {
        e.reportingTime = 'Please choose what time workers should arrive each day.';
      } else if (formData.startDate === today) {
        const minTimeToday = getMinTimeForToday(30);
        if (formData.reportingTime < minTimeToday) {
          e.reportingTime = `Reporting time has already passed for today. Earliest available reporting time is ${formatTime12H(minTimeToday)}, or please select tomorrow.`;
        }
      }
    } else {
      // HOURLY
      if (!formData.scheduledDate) {
        e.scheduledDate = 'Please select a date.';
      } else if (formData.scheduledDate < today) {
        e.scheduledDate = 'Scheduled date cannot be in the past.';
      } else if (isLateNight && formData.scheduledDate === today) {
        e.scheduledDate = `It is late night. Same-day hourly bookings are closed; please choose tomorrow (${formatToDDMMYYYY(tomorrow)}) or later.`;
      }

      if (!formData.startTime)
        e.startTime = 'Start time is required.';
      if (!formData.endTime)
        e.endTime = 'End time is required.';
      if (formData.startTime && formData.endTime) {
        const [sh, sm] = formData.startTime.split(':').map(Number);
        const [eh, em] = formData.endTime.split(':').map(Number);
        if (eh * 60 + em === sh * 60 + sm) {
          e.endTime = 'End time cannot be the same as start time.';
        }
      }

      if (formData.scheduledDate && formData.scheduledDate === today && formData.startTime) {
        const minTimeToday = getMinTimeForToday(30);
        if (formData.startTime < minTimeToday) {
          e.startTime = `Start time cannot be in the past. Earliest available start time for today is ${formatTime12H(minTimeToday)}.`;
        }
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
      toast.error(Object.values(validationErrors)[0], { id: 'worker-req-toast' });
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
        payload.reportingTime = formData.reportingTime;
        payload.minDailyRate = minR;
        payload.maxDailyRate = maxR;
      } else {
        payload.scheduledDate = formData.scheduledDate;
        payload.startTime     = formData.startTime;
        payload.endTime       = formData.endTime;
        let diffMinutes = 60;
        const [sh, sm] = formData.startTime.split(':').map(Number);
        const [eh, em] = formData.endTime.split(':').map(Number);
        if (!isNaN(sh) && !isNaN(eh)) {
          diffMinutes = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
          if (diffMinutes < 0) diffMinutes += 24 * 60;
        }
        const calcHours = Number((diffMinutes / 60).toFixed(1));
        payload.durationMinutes = diffMinutes;
        payload.durationHours = Number(formData.durationHours) || calcHours;
        payload.minRate       = minR;
        payload.maxRate       = maxR;
      }

      if (targetedWorkerId) {
        payload.targetedWorkerId = targetedWorkerId;
      }

      const created = await workerBookingService.createFarmerRequest(payload);
      toast.success('Request submitted! Finding workers near you...', { id: 'worker-req-toast' });
      const newId = created?.data?._id || created?.data?.request?._id;
      navigate(newId ? `/user/farmer-worker-request/${newId}` : '/user/my-bookings?filter=pending', { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to submit request. Please try again.';
      toast.error(msg, { id: 'worker-req-toast' });
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
      <div className="bg-white sticky top-0 z-40 border-b border-slate-100 px-4 py-3 shadow-xs">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate('/user/worker-explorer')}
            className="w-8 h-8 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 flex items-center justify-center text-slate-600 transition-colors active:scale-95"
          >
            <FiArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">New Work Request</h1>
            <p className="text-[11px] text-slate-500 font-medium">We'll find workers for you</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-3.5 py-3 sm:px-4 sm:py-4">
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Targeted Worker Hiring Banner */}
          {targetedWorker && (
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl p-3 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-sm">
                  {targetedWorker.name?.[0]?.toUpperCase() || <FiUser size={14} />}
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm">Hiring {targetedWorker.name}</h4>
                  <p className="text-[10px] text-emerald-100">
                    {targetedWorker.skills?.join(', ') || 'Agricultural Worker'} • {targetedWorker.address?.city || 'Verified'}
                  </p>
                </div>
              </div>
              <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-md font-bold">
                Direct Hire
              </span>
            </div>
          )}

          {/* ── Booking Mode Selection ────────────────────────────────────────── */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <FiTag size={14} className="text-emerald-600" /> Booking Mode *
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="booking-mode-hourly"
                onClick={() => setFormData(prev => ({ ...prev, bookingType: 'HOURLY', rateUnit: 'hourly' }))}
                className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all ${
                  formData.bookingType === 'HOURLY'
                    ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-xs sm:text-sm text-slate-800">Hourly Booking</span>
                  {formData.bookingType === 'HOURLY' && <FiCheckCircle className="text-emerald-600" size={14} />}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                  For short shifts by the hour. Timer starts with Reach OTP.
                </p>
              </button>

              <button
                type="button"
                id="booking-mode-daily"
                onClick={() => setFormData(prev => ({ ...prev, bookingType: 'DAILY', rateUnit: 'daily' }))}
                className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all ${
                  formData.bookingType === 'DAILY'
                    ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-xs sm:text-sm text-slate-800">Daily Booking</span>
                  {formData.bookingType === 'DAILY' && <FiCheckCircle className="text-emerald-600" size={14} />}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                  Multi-day farm work. Fresh Reach OTP every working day.
                </p>
              </button>
            </div>
          </div>

          {/* ── Work Details ─────────────────────────────────────────────────── */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
              <FiFileText size={14} className="text-emerald-600" /> Work Details
            </h3>
            <div className="space-y-3">

              {/* Work Category */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">
                  Work Category <span className="text-red-500">*</span>
                </label>
                <WorkCategorySelect
                  value={formData.workCategory}
                  onChange={handleChange}
                  error={!!errors.workCategory}
                  categories={WORK_CATEGORIES}
                  categoryData={WORK_CATEGORY_DATA}
                />
                <FieldError name="workCategory" />
              </div>

              {/* Work Title */}
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
                  type="text"
                  name="workTitle"
                  value={formData.workTitle}
                  onChange={handleTitleChange}
                  placeholder={formData.workCategory ? 'e.g. Wheat Harvesting' : 'Select a category above to auto-fill'}
                  className={`w-full bg-slate-50/80 border rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all ${errors.workTitle ? 'border-red-300' : 'border-slate-200'}`}
                />
                <FieldError name="workTitle" />
              </div>

              {/* Description */}
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
                  name="workDescription"
                  value={formData.workDescription}
                  onChange={handleDescChange}
                  placeholder="Describe the work: What needs to be done, field size, tools needed, etc."
                  rows={2}
                  className={`w-full bg-slate-50/80 border rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all ${errors.workDescription ? 'border-red-300' : 'border-slate-200'}`}
                />
                <FieldError name="workDescription" />
              </div>

              {/* Required Skills */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">
                  <FiTag size={11} className="inline mr-1" />
                  Required Skills (optional)
                </label>
                <div className="flex gap-1.5 mb-1.5">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput); } }}
                    placeholder="Type skill & press Enter"
                    className="flex-1 bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => addSkill(skillInput)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    Add
                  </button>
                </div>
                {/* Quick-add common skills */}
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {COMMON_SKILLS.filter(s => !formData.requiredSkills.includes(s)).slice(0, 6).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSkill(s)}
                      className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
                {/* Added skills */}
                {formData.requiredSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.requiredSkills.map(s => (
                      <span
                        key={s}
                        className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg font-medium"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => removeSkill(s)}
                          className="ml-0.5 text-emerald-600 hover:text-red-500 font-bold"
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
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">
                  <FiUsers size={11} className="inline mr-1" />
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
                  className={`w-full bg-slate-50/80 border rounded-xl px-3 py-2 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${errors.requiredWorkers ? 'border-red-300' : 'border-slate-200'}`}
                />
                <FieldError name="requiredWorkers" />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  The system automatically decides whether to match individual workers or a Team Leader.
                </p>
              </div>

              {/* Additional Instructions */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Additional Instructions (optional)</label>
                <textarea
                  name="additionalInstructions"
                  value={formData.additionalInstructions}
                  onChange={handleChange}
                  placeholder="Any specific instructions, tools to bring, etc."
                  rows={2}
                  className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* ── Schedule ──────────────────────────────────────────────────────── */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
              <FiCalendar size={14} className="text-emerald-600" /> Schedule ({formData.bookingType === 'DAILY' ? 'Daily Farm Work' : 'Hourly Shift'})
            </h3>
            <div className="space-y-3">
              {formData.bookingType === 'DAILY' ? (
                /* DAILY SCHEDULE */
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 mb-1 block">Start Date *</label>
                    <div
                      className="relative cursor-pointer group"
                      onClick={(e) => {
                        const input = e.currentTarget.querySelector('input[type="date"]');
                        try { input?.showPicker(); } catch { input?.focus(); }
                      }}
                    >
                      {/* Visible formatted DD/MM/YYYY display */}
                      <div
                        className={`w-full bg-slate-50/80 border rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm flex items-center justify-between transition-all group-hover:border-emerald-300 group-focus-within:ring-2 group-focus-within:ring-emerald-500 group-focus-within:border-emerald-500 ${
                          errors.startDate ? 'border-red-300' : 'border-slate-200'
                        }`}
                      >
                        <FiCalendar className="absolute left-3 top-2.5 text-slate-400 group-hover:text-emerald-600 transition-colors" size={14} />
                        <span className={formData.startDate ? 'text-slate-800 font-bold tracking-wide' : 'text-slate-400 font-normal'}>
                          {formatToDDMMYYYY(formData.startDate) || 'DD/MM/YYYY'}
                        </span>
                        <span className="text-xs opacity-60 group-hover:opacity-100 transition-opacity">📅</span>
                      </div>
                      <input
                        type="date"
                        name="startDate"
                        id="daily-start-date"
                        min={minDailyStartDate}
                        value={formData.startDate}
                        onChange={handleDateChange}
                        onClick={(e) => {
                          try { e.target.showPicker(); } catch { /* ignore */ }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            try { e.target.showPicker(); } catch { /* ignore */ }
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                    </div>
                    {formData.startDate && (
                      <p className="text-[10px] sm:text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/60 rounded-md px-2 py-0.5 flex items-center gap-1 mt-1 w-fit">
                        <span>🗓️</span>
                        <span>{formatFriendlyDay(formData.startDate)}</span>
                      </p>
                    )}
                    <FieldError name="startDate" />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 mb-1 block">Number of Days *</label>
                    <input
                      type="number"
                      name="numberOfDays"
                      id="daily-number-of-days"
                      min="1"
                      max="60"
                      value={formData.numberOfDays}
                      onChange={handleChange}
                      placeholder="e.g. 3"
                      className={`w-full bg-slate-50/80 border rounded-xl px-3 py-2 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${errors.numberOfDays ? 'border-red-300' : 'border-slate-200'}`}
                    />
                    <FieldError name="numberOfDays" />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 mb-1 block">Reporting Time (each day) *</label>
                    <input
                      type="time"
                      name="reportingTime"
                      id="daily-reporting-time"
                      min={formData.startDate === today ? getMinTimeForToday(30) : undefined}
                      value={formData.reportingTime}
                      onChange={handleReportingTimeChange}
                      className={`w-full bg-slate-50/80 border rounded-xl px-3 py-2 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${errors.reportingTime ? 'border-red-300' : 'border-slate-200'}`}
                    />
                    {formData.startDate === today ? (
                      <p className="text-[10px] text-amber-600 font-semibold mt-0.5 flex items-center gap-1">
                        <span>⏱️</span>
                        <span>Today's earliest arrival: {formatTime12H(getMinTimeForToday(30))}</span>
                      </p>
                    ) : isLateEvening && !formData.startDate ? (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        🌙 Evening notice: Daily shifts start tomorrow onwards.
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-0.5">Workers should arrive by this time every day.</p>
                    )}
                    <FieldError name="reportingTime" />
                  </div>
                </div>
              ) : (
                /* HOURLY SCHEDULE */
                <>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 mb-1 block">Date *</label>
                    <div
                      className="relative cursor-pointer group"
                      onClick={(e) => {
                        const input = e.currentTarget.querySelector('input[type="date"]');
                        try { input?.showPicker(); } catch { input?.focus(); }
                      }}
                    >
                      {/* Visible formatted DD/MM/YYYY display */}
                      <div
                        className={`w-full bg-slate-50/80 border rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm flex items-center justify-between transition-all group-hover:border-emerald-300 group-focus-within:ring-2 group-focus-within:ring-emerald-500 group-focus-within:border-emerald-500 ${
                          errors.scheduledDate ? 'border-red-300' : 'border-slate-200'
                        }`}
                      >
                        <FiCalendar className="absolute left-3 top-2.5 text-slate-400 group-hover:text-emerald-600 transition-colors" size={14} />
                        <span className={formData.scheduledDate ? 'text-slate-800 font-bold tracking-wide' : 'text-slate-400 font-normal'}>
                          {formatToDDMMYYYY(formData.scheduledDate) || 'DD/MM/YYYY'}
                        </span>
                        <span className="text-xs opacity-60 group-hover:opacity-100 transition-opacity">📅</span>
                      </div>
                      <input
                        type="date"
                        name="scheduledDate"
                        id="hourly-scheduled-date"
                        min={minHourlyDate}
                        value={formData.scheduledDate}
                        onChange={handleDateChange}
                        onClick={(e) => {
                          try { e.target.showPicker(); } catch { /* ignore */ }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            try { e.target.showPicker(); } catch { /* ignore */ }
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
                    <FieldError name="scheduledDate" />
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 mb-1 block">Start Time *</label>
                        <div className="relative">
                          <FiClock className="absolute left-3 top-2.5 text-slate-400" size={14} />
                          <input
                            type="time"
                            name="startTime"
                            id="hourly-start-time"
                            min={formData.scheduledDate === today ? getMinTimeForToday(30) : undefined}
                            value={formData.startTime}
                            onChange={handleStartTimeChange}
                            step="900"
                            className={`w-full bg-slate-50/80 border rounded-xl pl-9 pr-2.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${errors.startTime ? 'border-red-300' : 'border-slate-200'}`}
                          />
                        </div>
                        {formData.scheduledDate === today && (
                          <p className="text-[10px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
                            <span>⏱️</span>
                            <span>Today's earliest start: {formatTime12H(getMinTimeForToday(30))}</span>
                          </p>
                        )}
                        <FieldError name="startTime" />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-600 mb-1 block">End Time *</label>
                        <div className="relative">
                          <FiClock className="absolute left-3 top-2.5 text-slate-400" size={14} />
                          <input
                            type="time"
                            name="endTime"
                            id="hourly-end-time"
                            value={formData.endTime}
                            onChange={handleEndTimeChange}
                            step="900"
                            className={`w-full bg-slate-50/80 border rounded-xl pl-9 pr-2.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${errors.endTime ? 'border-red-300' : 'border-slate-200'}`}
                          />
                        </div>
                        <FieldError name="endTime" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-slate-600">
                          Shift Duration (Hours) *
                        </label>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md">
                          Hourly Rate: ₹{formData.minRate || 0}/hr
                        </span>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7.5, 8].map(h => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => handleDurationSelect(h)}
                            className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all ${
                              String(formData.durationHours) === String(h)
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-black shadow-xs'
                                : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {h} {h === 1 ? 'Hr' : 'Hrs'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Auto-calculated Scheduled Window */}
                    {formData.startTime && formData.endTime && (
                      <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Scheduled Window:</span>
                        <span className="font-bold text-slate-800">
                          {formatTime12H(formData.startTime)} – {formatTime12H(formData.endTime)} ({formData.durationHours} hr{Number(formData.durationHours) > 1 ? 's' : ''})
                        </span>
                      </div>
                    )}
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
                </>
              )}
            </div>
          </div>

          {/* ── Location ──────────────────────────────────────────────────────── */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
              <FiMapPin size={14} className="text-emerald-600" /> Work Location
            </h3>
            
            <div className="mb-2.5 rounded-xl overflow-hidden border border-slate-200">
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
            
            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">City / Village *</label>
                <div className="relative">
                  <FiMapPin className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="e.g. Indore, Madhya Pradesh"
                    className={`w-full bg-slate-50/80 border rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${errors.city ? 'border-red-300' : 'border-slate-200'}`}
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
                  className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
              <div>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="State (optional)"
                  className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  name="lat"
                  value={formData.lat}
                  onChange={handleChange}
                  placeholder="Latitude (optional)"
                  step="any"
                  className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
                <input
                  type="number"
                  name="lng"
                  value={formData.lng}
                  onChange={handleChange}
                  placeholder="Longitude (optional)"
                  step="any"
                  className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Coordinates improve radius matching accuracy.
              </p>
            </div>
          </div>

          {/* ── Budget ────────────────────────────────────────────────────────── */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <FiDollarSign size={14} className="text-emerald-600" /> Budget / Rate per Worker
              </h3>
              <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                {formData.bookingType === 'DAILY' ? '₹ / Day' : '₹ / Hour'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-2.5">
              {formData.bookingType === 'DAILY' 
                ? 'Specify expected daily wage per worker for each working day' 
                : 'Specify expected hourly wage per worker'}
            </p>

            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 mb-1 block">
                    Min {formData.bookingType === 'DAILY' ? 'Daily' : 'Hourly'} Rate (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-xs sm:text-sm font-bold">₹</span>
                    <input
                      type="number"
                      name="minRate"
                      id="budget-min-rate"
                      value={formData.minRate}
                      onChange={handleChange}
                      min="1"
                      placeholder={formData.bookingType === 'DAILY' ? '500' : '150'}
                      className={`w-full bg-slate-50/80 border rounded-xl pl-7 pr-3 py-2 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${errors.minRate ? 'border-red-300' : 'border-slate-200'}`}
                    />
                  </div>
                  <FieldError name="minRate" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 mb-1 block">
                    Max {formData.bookingType === 'DAILY' ? 'Daily' : 'Hourly'} Rate (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-xs sm:text-sm font-bold">₹</span>
                    <input
                      type="number"
                      name="maxRate"
                      id="budget-max-rate"
                      value={formData.maxRate}
                      onChange={handleChange}
                      min="1"
                      placeholder={formData.bookingType === 'DAILY' ? '600' : '200'}
                      className={`w-full bg-slate-50/80 border rounded-xl pl-7 pr-3 py-2 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white ${errors.maxRate ? 'border-red-300' : 'border-slate-200'}`}
                    />
                  </div>
                  <FieldError name="maxRate" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Workers within radius will receive requests in this range.
              </p>
            </div>
          </div>

          {/* Submit */}
          <button
            id="submit-farmer-request-btn"
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-bold text-sm sm:text-base shadow-md shadow-emerald-600/20 active:scale-[0.99] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FiCheckCircle size={16} />
            )}
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>

        </form>
      </div>
    </div>
  );
};

export default WorkerRequestForm;
