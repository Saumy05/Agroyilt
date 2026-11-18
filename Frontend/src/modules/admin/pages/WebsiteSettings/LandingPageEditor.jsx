import React, { useState, useEffect } from 'react';
import { 
  FiSave, 
  FiRefreshCw, 
  FiLayers, 
  FiEye, 
  FiCheckCircle, 
  FiPlus, 
  FiTrash2, 
  FiExternalLink,
  FiHelpCircle
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../../components/CardShell';
import API from '../../../../services/api';
import LogoLoader from '../../../../components/common/LogoLoader';
import { DEFAULT_LANDING_CONTENT } from '../../../../context/LandingContentContext';

const SECTIONS = [
  { id: 'hero', name: 'Hero Section', icon: '🚀' },
  { id: 'about', name: 'About Us', icon: '📖' },
  { id: 'problemSolution', name: 'Challenges & Solutions', icon: '⚖️' },
  { id: 'services', name: 'Services', icon: '🚜' },
  { id: 'workflow', name: 'Workflow & Steps', icon: '🔄' },
  { id: 'videoTutorials', name: 'Video Guides', icon: '🎬' },
  { id: 'ecosystem', name: 'Ecosystem Flow', icon: '🌐' },
  { id: 'features', name: 'Modern Features', icon: '⚡' },
  { id: 'companyDeepDive', name: 'Vision & Scalability', icon: '🏢' },
  { id: 'faq', name: 'FAQ Section', icon: '❓' },
  { id: 'cta', name: 'Bottom CTA', icon: '📣' },
  { id: 'navbarFooter', name: 'Navbar & Footer', icon: '🧭' },
];

const LandingPageEditor = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState(DEFAULT_LANDING_CONTENT);

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      setLoading(true);
      const res = await API.get('/admin/website/landing-content');
      if (res.data.success && res.data.data) {
        // Deep merge with defaults to avoid any undefined properties
        const merged = { ...DEFAULT_LANDING_CONTENT };
        Object.keys(res.data.data).forEach((key) => {
          if (res.data.data[key] && typeof res.data.data[key] === 'object' && !Array.isArray(res.data.data[key])) {
            merged[key] = { ...DEFAULT_LANDING_CONTENT[key], ...res.data.data[key] };
          } else if (res.data.data[key] !== undefined) {
            merged[key] = res.data.data[key];
          }
        });
        setContent(merged);
      }
    } catch (error) {
      console.error('Error fetching landing content:', error);
      toast.error('Failed to load landing content, using default templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await API.put('/admin/website/landing-content', content);
      if (res.data.success) {
        toast.success('Landing page content updated successfully!');
      } else {
        toast.error(res.data.message || 'Failed to update content');
      }
    } catch (error) {
      console.error('Error saving landing content:', error);
      toast.error(error.response?.data?.message || 'Error saving changes');
    } finally {
      setSaving(false);
    }
  };

  const handleResetSection = () => {
    if (window.confirm(`Reset "${SECTIONS.find(s => s.id === activeSection)?.name}" to default text?`)) {
      if (activeSection === 'navbarFooter') {
        setContent(prev => ({
          ...prev,
          navbar: { ...DEFAULT_LANDING_CONTENT.navbar },
          footer: { ...DEFAULT_LANDING_CONTENT.footer }
        }));
      } else {
        setContent(prev => ({
          ...prev,
          [activeSection]: { ...DEFAULT_LANDING_CONTENT[activeSection] }
        }));
      }
      toast.success('Section reset to default values. Click Save to persist.');
    }
  };

  // Helper to update a field in content
  const updateField = (section, field, value) => {
    setContent(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  // Helper to update an array item in a section
  const updateArrayItem = (section, arrayName, index, field, value) => {
    setContent(prev => {
      const currentList = [...(prev[section]?.[arrayName] || [])];
      currentList[index] = {
        ...currentList[index],
        [field]: value
      };
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [arrayName]: currentList
        }
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LogoLoader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-green-800 to-green-950 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-green-300 text-xs font-bold uppercase tracking-widest mb-1">
            <FiLayers size={14} />
            <span>Content Management System</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black">Landing Page Text Editor</h1>
          <p className="text-green-100 text-xs md:text-sm mt-1 max-w-2xl">
            Edit and customize every headline, badge, subtitle, and paragraph on the live Agroyilt landing page. All changes reflect instantly on the public website.
          </p>
        </div>
        <div className="flex items-center space-x-3 shrink-0">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors border border-white/20"
          >
            <FiEye size={15} />
            <span>Preview Site</span>
          </a>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 text-gray-950 font-black text-sm shadow-lg hover:shadow-green-500/30 transition-all cursor-pointer disabled:opacity-50"
          >
            <FiSave size={16} />
            <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar navigation + Active Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm space-y-1">
            <div className="px-3 py-2 text-[10px] uppercase font-black tracking-wider text-gray-400">
              Landing Page Sections
            </div>
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                  activeSection === sec.id
                    ? 'bg-green-700 text-white shadow-md shadow-green-900/10'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className="text-base">{sec.icon}</span>
                  <span>{sec.name}</span>
                </div>
                {activeSection === sec.id && <span className="text-xs">→</span>}
              </button>
            ))}
          </div>

          <button
            onClick={handleResetSection}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gray-50 hover:bg-red-50 text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 text-xs font-bold transition-all"
          >
            <FiRefreshCw size={13} />
            <span>Reset Section to Default</span>
          </button>
        </div>

        {/* Section Content Form */}
        <div className="lg:col-span-3">
          <CardShell>
            {/* HERO */}
            {activeSection === 'hero' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Hero Section</h2>
                  <p className="text-xs text-gray-500">Edit main landing page header and high-impact stats.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Badge Text</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.hero?.badge || ''}
                      onChange={(e) => updateField('hero', 'badge', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Main Headline</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.hero?.headline || ''}
                      onChange={(e) => updateField('hero', 'headline', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Sub Headline / Tagline</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.hero?.tagline || ''}
                      onChange={(e) => updateField('hero', 'tagline', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Description Paragraph</label>
                    <textarea
                      rows={3}
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.hero?.description || ''}
                      onChange={(e) => updateField('hero', 'description', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Primary CTA Button</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.hero?.ctaPrimary || ''}
                      onChange={(e) => updateField('hero', 'ctaPrimary', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Secondary CTA Button</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.hero?.ctaSecondary || ''}
                      onChange={(e) => updateField('hero', 'ctaSecondary', e.target.value)}
                    />
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Hero Stat Counters</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {['stat1', 'stat2', 'stat3', 'stat4'].map((stKey, idx) => (
                      <div key={stKey} className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-gray-400">Stat #{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Value (e.g. 10,000+)"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold"
                          value={content.hero?.[stKey]?.value || ''}
                          onChange={(e) => updateField('hero', stKey, { ...content.hero?.[stKey], value: e.target.value })}
                        />
                        <input
                          type="text"
                          placeholder="Label (e.g. Happy Farmers)"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                          value={content.hero?.[stKey]?.label || ''}
                          onChange={(e) => updateField('hero', stKey, { ...content.hero?.[stKey], label: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ABOUT */}
            {activeSection === 'about' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">About Us Section</h2>
                  <p className="text-xs text-gray-500">Edit company mission description and fast service badges.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Section Title</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.about?.title || ''}
                      onChange={(e) => updateField('about', 'title', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">First Paragraph</label>
                    <textarea
                      rows={3}
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.about?.p1 || ''}
                      onChange={(e) => updateField('about', 'p1', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Second Paragraph</label>
                    <textarea
                      rows={3}
                      className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                      value={content.about?.p2 || ''}
                      onChange={(e) => updateField('about', 'p2', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Watch & Learn Heading</label>
                      <input
                        type="text"
                        className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                        value={content.about?.watchLearnTitle || ''}
                        onChange={(e) => updateField('about', 'watchLearnTitle', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Services Subtitle</label>
                      <input
                        type="text"
                        className="w-full px-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                        value={content.about?.servicesTitle || ''}
                        onChange={(e) => updateField('about', 'servicesTitle', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">About Quick Services</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(content.about?.services || []).map((srv, idx) => (
                      <div key={idx} className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2">
                        <span className="text-[10px] font-bold text-green-700 uppercase">Service #{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Title"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                          value={srv.title || ''}
                          onChange={(e) => updateArrayItem('about', 'services', idx, 'title', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Description"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs"
                          value={srv.desc || ''}
                          onChange={(e) => updateArrayItem('about', 'services', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PROBLEM / SOLUTION */}
            {activeSection === 'problemSolution' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Challenges vs Solutions</h2>
                  <p className="text-xs text-gray-500">Edit agriculture bottlenecks and how Agroyilt solves them.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Section Badge</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.problemSolution?.badge || ''}
                      onChange={(e) => updateField('problemSolution', 'badge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Section Title</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.problemSolution?.title || ''}
                      onChange={(e) => updateField('problemSolution', 'title', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Middle Quote Banner</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm font-medium italic"
                      value={content.problemSolution?.quote || ''}
                      onChange={(e) => updateField('problemSolution', 'quote', e.target.value)}
                    />
                  </div>
                </div>

                {/* Problems Column */}
                <div className="border-t pt-5">
                  <div className="space-y-1 mb-3">
                    <label className="text-xs font-bold text-red-600 uppercase tracking-wide">Problems Title</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border rounded-lg text-sm font-bold"
                      value={content.problemSolution?.problemTitle || ''}
                      onChange={(e) => updateField('problemSolution', 'problemTitle', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(content.problemSolution?.problems || []).map((item, idx) => (
                      <div key={idx} className="bg-red-50/50 p-3.5 rounded-xl border border-red-100 space-y-2">
                        <span className="text-[10px] font-bold text-red-700 uppercase">Problem #{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Problem Title"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                          value={item.title || ''}
                          onChange={(e) => updateArrayItem('problemSolution', 'problems', idx, 'title', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Description"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs"
                          value={item.desc || ''}
                          onChange={(e) => updateArrayItem('problemSolution', 'problems', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Solutions Column */}
                <div className="border-t pt-5">
                  <div className="space-y-1 mb-3">
                    <label className="text-xs font-bold text-green-700 uppercase tracking-wide">Solutions Title</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border rounded-lg text-sm font-bold"
                      value={content.problemSolution?.solutionTitle || ''}
                      onChange={(e) => updateField('problemSolution', 'solutionTitle', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(content.problemSolution?.solutions || []).map((item, idx) => (
                      <div key={idx} className="bg-green-50/50 p-3.5 rounded-xl border border-green-100 space-y-2">
                        <span className="text-[10px] font-bold text-green-700 uppercase">Solution #{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Solution Title"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                          value={item.title || ''}
                          onChange={(e) => updateArrayItem('problemSolution', 'solutions', idx, 'title', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Description"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs"
                          value={item.desc || ''}
                          onChange={(e) => updateArrayItem('problemSolution', 'solutions', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SERVICES */}
            {activeSection === 'services' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Services Section</h2>
                  <p className="text-xs text-gray-500">Edit our comprehensive services catalog cards and badges.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Badge Text</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.services?.badge || ''}
                      onChange={(e) => updateField('services', 'badge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Title</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.services?.title || ''}
                      onChange={(e) => updateField('services', 'title', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Card Button Label</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.services?.detailsBtn || ''}
                      onChange={(e) => updateField('services', 'detailsBtn', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-bold text-gray-700">Subtitle</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.services?.subtitle || ''}
                      onChange={(e) => updateField('services', 'subtitle', e.target.value)}
                    />
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Service Offerings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(content.services?.items || []).map((srv, idx) => (
                      <div key={idx} className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-green-700 uppercase">Service #{idx + 1}</span>
                          <input
                            type="text"
                            placeholder="Tag/Badge"
                            className="w-28 px-2 py-0.5 border rounded text-[11px]"
                            value={srv.badge || ''}
                            onChange={(e) => updateArrayItem('services', 'items', idx, 'badge', e.target.value)}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Title"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                          value={srv.title || ''}
                          onChange={(e) => updateArrayItem('services', 'items', idx, 'title', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Description"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs"
                          value={srv.desc || ''}
                          onChange={(e) => updateArrayItem('services', 'items', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* WORKFLOW */}
            {activeSection === 'workflow' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Workflow & Step-by-Step Journeys</h2>
                  <p className="text-xs text-gray-500">Edit the user journey steps for Farmers, Machinery Owners, and Farm Workers.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Badge Text</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.workflow?.badge || ''}
                      onChange={(e) => updateField('workflow', 'badge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Section Title</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.workflow?.title || ''}
                      onChange={(e) => updateField('workflow', 'title', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-bold text-gray-700">Subtitle</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.workflow?.subtitle || ''}
                      onChange={(e) => updateField('workflow', 'subtitle', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-bold text-gray-700">Transparency Note (Bottom)</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.workflow?.transparencyNote || ''}
                      onChange={(e) => updateField('workflow', 'transparencyNote', e.target.value)}
                    />
                  </div>
                </div>

                {/* Farmer Steps */}
                <div className="border-t pt-5">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <h3 className="text-sm font-bold text-gray-800">Farmer Steps</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {(content.workflow?.farmerSteps || []).map((step, idx) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                        <span className="text-[10px] font-bold text-gray-400">Step {idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Step Title"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold"
                          value={step.title || ''}
                          onChange={(e) => updateArrayItem('workflow', 'farmerSteps', idx, 'title', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Description"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                          value={step.desc || ''}
                          onChange={(e) => updateArrayItem('workflow', 'farmerSteps', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vendor Steps */}
                <div className="border-t pt-5">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <h3 className="text-sm font-bold text-gray-800">Equipment Owner / Vendor Steps</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {(content.workflow?.vendorSteps || []).map((step, idx) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                        <span className="text-[10px] font-bold text-gray-400">Step {idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Step Title"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold"
                          value={step.title || ''}
                          onChange={(e) => updateArrayItem('workflow', 'vendorSteps', idx, 'title', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Description"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                          value={step.desc || ''}
                          onChange={(e) => updateArrayItem('workflow', 'vendorSteps', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Worker Steps */}
                <div className="border-t pt-5">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <h3 className="text-sm font-bold text-gray-800">Independent Worker Steps</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {(content.workflow?.workerSteps || []).map((step, idx) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                        <span className="text-[10px] font-bold text-gray-400">Step {idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Step Title"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold"
                          value={step.title || ''}
                          onChange={(e) => updateArrayItem('workflow', 'workerSteps', idx, 'title', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Description"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                          value={step.desc || ''}
                          onChange={(e) => updateArrayItem('workflow', 'workerSteps', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VIDEO TUTORIALS */}
            {activeSection === 'videoTutorials' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Video Tutorials Section</h2>
                  <p className="text-xs text-gray-500">Edit titles, Hindi guide prompts, and feature bullets per role.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Badge Text</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.videoTutorials?.badge || ''}
                      onChange={(e) => updateField('videoTutorials', 'badge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Title</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.videoTutorials?.title || ''}
                      onChange={(e) => updateField('videoTutorials', 'title', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Subtitle</label>
                    <textarea
                      rows={2}
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.videoTutorials?.subtitle || ''}
                      onChange={(e) => updateField('videoTutorials', 'subtitle', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Click to Play Prompt</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.videoTutorials?.playPrompt || ''}
                      onChange={(e) => updateField('videoTutorials', 'playPrompt', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Bottom Footer Note</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.videoTutorials?.note || ''}
                      onChange={(e) => updateField('videoTutorials', 'note', e.target.value)}
                    />
                  </div>
                </div>

                {/* Role Specific Guides */}
                <div className="border-t pt-5 space-y-4">
                  <h3 className="text-sm font-bold text-gray-800">Role Walkthrough Headlines</h3>
                  {['farmer', 'worker', 'vendor'].map((roleKey) => {
                    const guide = content.videoTutorials?.guides?.[roleKey] || {};
                    return (
                      <div key={roleKey} className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase text-green-700">
                            {roleKey.toUpperCase()} GUIDE
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-gray-600">Badge</label>
                            <input
                              type="text"
                              className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                              value={guide.badge || ''}
                              onChange={(e) => {
                                const newGuides = { ...content.videoTutorials?.guides };
                                newGuides[roleKey] = { ...newGuides[roleKey], badge: e.target.value };
                                updateField('videoTutorials', 'guides', newGuides);
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-gray-600">Button CTA</label>
                            <input
                              type="text"
                              className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                              value={guide.ctaText || ''}
                              onChange={(e) => {
                                const newGuides = { ...content.videoTutorials?.guides };
                                newGuides[roleKey] = { ...newGuides[roleKey], ctaText: e.target.value };
                                updateField('videoTutorials', 'guides', newGuides);
                              }}
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[11px] font-bold text-gray-600">Title</label>
                            <input
                              type="text"
                              className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold"
                              value={guide.title || ''}
                              onChange={(e) => {
                                const newGuides = { ...content.videoTutorials?.guides };
                                newGuides[roleKey] = { ...newGuides[roleKey], title: e.target.value };
                                updateField('videoTutorials', 'guides', newGuides);
                              }}
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[11px] font-bold text-gray-600">Subtitle</label>
                            <textarea
                              rows={2}
                              className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                              value={guide.subtitle || ''}
                              onChange={(e) => {
                                const newGuides = { ...content.videoTutorials?.guides };
                                newGuides[roleKey] = { ...newGuides[roleKey], subtitle: e.target.value };
                                updateField('videoTutorials', 'guides', newGuides);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ECOSYSTEM */}
            {activeSection === 'ecosystem' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Ecosystem Journey & Actors</h2>
                  <p className="text-xs text-gray-500">Edit the 6-step end-to-end lifecycle and stakeholder descriptions.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Badge Text</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.ecosystem?.badge || ''}
                      onChange={(e) => updateField('ecosystem', 'badge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Completion Badge</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.ecosystem?.completionBadge || ''}
                      onChange={(e) => updateField('ecosystem', 'completionBadge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Title Part 1</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.ecosystem?.titlePart1 || ''}
                      onChange={(e) => updateField('ecosystem', 'titlePart1', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Title Part 2 (Green Highlight)</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.ecosystem?.titlePart2 || ''}
                      onChange={(e) => updateField('ecosystem', 'titlePart2', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Subtitle</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.ecosystem?.subtitle || ''}
                      onChange={(e) => updateField('ecosystem', 'subtitle', e.target.value)}
                    />
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">6 Journey Milestones</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(content.ecosystem?.steps || []).map((step, idx) => (
                      <div key={idx} className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-400">Step {idx + 1}</span>
                          <input
                            type="text"
                            placeholder="Actor (e.g. Farmer)"
                            className="w-32 px-2 py-0.5 border rounded text-[11px] font-bold"
                            value={step.actor || ''}
                            onChange={(e) => updateArrayItem('ecosystem', 'steps', idx, 'actor', e.target.value)}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Action (e.g. Registers & Requests)"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold"
                          value={step.action || ''}
                          onChange={(e) => updateArrayItem('ecosystem', 'steps', idx, 'action', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Detail explanation"
                          className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                          value={step.detail || ''}
                          onChange={(e) => updateArrayItem('ecosystem', 'steps', idx, 'detail', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* FEATURES */}
            {activeSection === 'features' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Modern Features Section</h2>
                  <p className="text-xs text-gray-500">Edit key platform capabilities such as live tracking, scheduling, and OTP.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Badge Text</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.features?.badge || ''}
                      onChange={(e) => updateField('features', 'badge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Live Indicator Badge</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.features?.liveTrackingBadge || ''}
                      onChange={(e) => updateField('features', 'liveTrackingBadge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Title</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.features?.title || ''}
                      onChange={(e) => updateField('features', 'title', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Subtitle</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.features?.subtitle || ''}
                      onChange={(e) => updateField('features', 'subtitle', e.target.value)}
                    />
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Feature Cards</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(content.features?.items || []).map((feat, idx) => (
                      <div key={idx} className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2">
                        <span className="text-[10px] font-bold text-green-700 uppercase">Feature #{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Title"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                          value={feat.title || ''}
                          onChange={(e) => updateArrayItem('features', 'items', idx, 'title', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Description"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs"
                          value={feat.desc || ''}
                          onChange={(e) => updateArrayItem('features', 'items', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VISION & SCALABILITY */}
            {activeSection === 'companyDeepDive' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Vision, Mission & Scalability</h2>
                  <p className="text-xs text-gray-500">Edit company vision quotes, market statistics, and leadership titles.</p>
                </div>

                {/* Vision Quotes */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Vision Badge</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.companyDeepDive?.visionBadge || ''}
                        onChange={(e) => updateField('companyDeepDive', 'visionBadge', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Vision Title Part 1</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.companyDeepDive?.visionTitlePart1 || ''}
                        onChange={(e) => updateField('companyDeepDive', 'visionTitlePart1', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Vision Title Part 2 (Italic)</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.companyDeepDive?.visionTitlePart2 || ''}
                        onChange={(e) => updateField('companyDeepDive', 'visionTitlePart2', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Vision Mission Quote</label>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-1.5 border rounded-lg text-xs font-medium"
                      value={content.companyDeepDive?.visionQuote || ''}
                      onChange={(e) => updateField('companyDeepDive', 'visionQuote', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-red-600">Problem Urgency Callout</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold text-red-600"
                      value={content.companyDeepDive?.problemQuote || ''}
                      onChange={(e) => updateField('companyDeepDive', 'problemQuote', e.target.value)}
                    />
                  </div>
                </div>

                {/* Market Opportunity */}
                <div className="border-t pt-5 space-y-3">
                  <h3 className="text-sm font-bold text-gray-800">Market Opportunity Headline</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Title</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.companyDeepDive?.marketTitle || ''}
                        onChange={(e) => updateField('companyDeepDive', 'marketTitle', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Subtitle Prefix</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.companyDeepDive?.marketSubtitlePrefix || ''}
                        onChange={(e) => updateField('companyDeepDive', 'marketSubtitlePrefix', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Highlighted Text</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold text-green-700"
                        value={content.companyDeepDive?.marketSubtitleHighlight || ''}
                        onChange={(e) => updateField('companyDeepDive', 'marketSubtitleHighlight', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                    {(content.companyDeepDive?.marketStats || []).map((st, idx) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-400">Stat #{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Value"
                          className="w-full px-2 py-1 border rounded text-xs font-black text-green-700"
                          value={st.value || ''}
                          onChange={(e) => updateArrayItem('companyDeepDive', 'marketStats', idx, 'value', e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Label"
                          className="w-full px-2 py-1 border rounded text-xs font-bold"
                          value={st.label || ''}
                          onChange={(e) => updateArrayItem('companyDeepDive', 'marketStats', idx, 'label', e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Desc"
                          className="w-full px-2 py-1 border rounded text-[11px]"
                          value={st.desc || ''}
                          onChange={(e) => updateArrayItem('companyDeepDive', 'marketStats', idx, 'desc', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scalability & Leadership */}
                <div className="border-t pt-5 space-y-4">
                  <h3 className="text-sm font-bold text-gray-800">Scalability & Organization</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Scalability Title</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                        value={content.companyDeepDive?.scalabilityTitle || ''}
                        onChange={(e) => updateField('companyDeepDive', 'scalabilityTitle', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Scalability Tag 1</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.companyDeepDive?.scalabilityTag1 || ''}
                        onChange={(e) => updateField('companyDeepDive', 'scalabilityTag1', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-gray-700">Scalability Description</label>
                      <textarea
                        rows={2}
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.companyDeepDive?.scalabilityDesc || ''}
                        onChange={(e) => updateField('companyDeepDive', 'scalabilityDesc', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Founder</label>
                      <input
                        type="text"
                        placeholder="Founder Role"
                        className="w-full px-2 py-1 border rounded text-xs"
                        value={content.companyDeepDive?.founderRole || ''}
                        onChange={(e) => updateField('companyDeepDive', 'founderRole', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Founder Name"
                        className="w-full px-2 py-1 border rounded text-xs font-bold"
                        value={content.companyDeepDive?.founderName || ''}
                        onChange={(e) => updateField('companyDeepDive', 'founderName', e.target.value)}
                      />
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Co-Founder</label>
                      <input
                        type="text"
                        placeholder="Co Founder Role"
                        className="w-full px-2 py-1 border rounded text-xs"
                        value={content.companyDeepDive?.cofounderRole || ''}
                        onChange={(e) => updateField('companyDeepDive', 'cofounderRole', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Co Founder Name"
                        className="w-full px-2 py-1 border rounded text-xs font-bold"
                        value={content.companyDeepDive?.cofounderName || ''}
                        onChange={(e) => updateField('companyDeepDive', 'cofounderName', e.target.value)}
                      />
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Company Entity</label>
                      <input
                        type="text"
                        placeholder="Company Label"
                        className="w-full px-2 py-1 border rounded text-xs"
                        value={content.companyDeepDive?.companyLabel || ''}
                        onChange={(e) => updateField('companyDeepDive', 'companyLabel', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Company Name"
                        className="w-full px-2 py-1 border rounded text-xs font-bold"
                        value={content.companyDeepDive?.companyName || ''}
                        onChange={(e) => updateField('companyDeepDive', 'companyName', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FAQ */}
            {activeSection === 'faq' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">FAQ Section</h2>
                  <p className="text-xs text-gray-500">Edit support center questions and answers categorized by user roles.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Badge Text</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.faq?.badge || ''}
                      onChange={(e) => updateField('faq', 'badge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Section Title</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.faq?.title || ''}
                      onChange={(e) => updateField('faq', 'title', e.target.value)}
                    />
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Questions & Answers</h3>
                  <div className="space-y-3">
                    {(content.faq?.faqs || []).map((fq, idx) => (
                      <div key={idx} className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-green-700 uppercase">Question #{idx + 1}</span>
                          <select
                            className="px-2 py-1 border rounded text-xs bg-white font-bold"
                            value={fq.category || 'General'}
                            onChange={(e) => updateArrayItem('faq', 'faqs', idx, 'category', e.target.value)}
                          >
                            <option value="Farmer">Farmer</option>
                            <option value="Owner">Owner</option>
                            <option value="General">General</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          placeholder="Question"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                          value={fq.question || ''}
                          onChange={(e) => updateArrayItem('faq', 'faqs', idx, 'question', e.target.value)}
                        />
                        <textarea
                          rows={2}
                          placeholder="Answer"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs"
                          value={fq.answer || ''}
                          onChange={(e) => updateArrayItem('faq', 'faqs', idx, 'answer', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* BOTTOM CTA */}
            {activeSection === 'cta' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Bottom Call-to-Action (CTA)</h2>
                  <p className="text-xs text-gray-500">Edit the large conversion banner at the bottom of the landing page.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Badge Text</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.cta?.badge || ''}
                      onChange={(e) => updateField('cta', 'badge', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Title Prefix</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.cta?.titlePrefix || ''}
                      onChange={(e) => updateField('cta', 'titlePrefix', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Highlighted Word (Yellow)</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm font-bold text-yellow-600"
                      value={content.cta?.titleHighlight || ''}
                      onChange={(e) => updateField('cta', 'titleHighlight', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700">Subtitle</label>
                    <textarea
                      rows={2}
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.cta?.subtitle || ''}
                      onChange={(e) => updateField('cta', 'subtitle', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Primary Button Label</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.cta?.ctaPrimary || ''}
                      onChange={(e) => updateField('cta', 'ctaPrimary', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Secondary Button Label</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2 border rounded-xl text-sm"
                      value={content.cta?.ctaSecondary || ''}
                      onChange={(e) => updateField('cta', 'ctaSecondary', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* NAVBAR & FOOTER */}
            {activeSection === 'navbarFooter' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Navbar & Footer Settings</h2>
                  <p className="text-xs text-gray-500">Edit branding, contact information, social links, and copyright text.</p>
                </div>

                {/* Navbar */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-800">Navbar Header</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Brand Wordmark</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs font-black"
                        value={content.navbar?.brandName || ''}
                        onChange={(e) => updateField('navbar', 'brandName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Brand Tagline</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.navbar?.brandTagline || ''}
                        onChange={(e) => updateField('navbar', 'brandTagline', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Join as User Button</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.navbar?.joinUserBtn || ''}
                        onChange={(e) => updateField('navbar', 'joinUserBtn', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Join as Vendor Button</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.navbar?.joinVendorBtn || ''}
                        onChange={(e) => updateField('navbar', 'joinVendorBtn', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Join as Worker Button</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.navbar?.joinWorkerBtn || ''}
                        onChange={(e) => updateField('navbar', 'joinWorkerBtn', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Mobile Quick Button</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.navbar?.bookNowBtn || ''}
                        onChange={(e) => updateField('navbar', 'bookNowBtn', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Info */}
                <div className="border-t pt-5 space-y-3">
                  <h3 className="text-sm font-bold text-gray-800">Footer Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Tagline (e.g. By Chinmay Anand)</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.footer?.tagline || ''}
                        onChange={(e) => updateField('footer', 'tagline', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Copyright Text</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.footer?.copyright || ''}
                        onChange={(e) => updateField('footer', 'copyright', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-gray-700">About Description</label>
                      <textarea
                        rows={2}
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.footer?.aboutText || ''}
                        onChange={(e) => updateField('footer', 'aboutText', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Phone</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.footer?.phone || ''}
                        onChange={(e) => updateField('footer', 'phone', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Email</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.footer?.email || ''}
                        onChange={(e) => updateField('footer', 'email', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-gray-700">Physical Address</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.footer?.address || ''}
                        onChange={(e) => updateField('footer', 'address', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Newsletter Title</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.footer?.newsletterTitle || ''}
                        onChange={(e) => updateField('footer', 'newsletterTitle', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Newsletter Subtitle</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        value={content.footer?.newsletterSubtitle || ''}
                        onChange={(e) => updateField('footer', 'newsletterSubtitle', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-end space-x-3 pt-6 border-t mt-6">
              <button
                type="button"
                onClick={handleResetSection}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Reset Section
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <FiSave size={15} />
                <span>{saving ? 'Saving Changes...' : 'Save All Changes'}</span>
              </button>
            </div>
          </CardShell>
        </div>
      </div>
    </div>
  );
};

export default LandingPageEditor;
