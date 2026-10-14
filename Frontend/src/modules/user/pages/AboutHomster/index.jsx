import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiUsers, FiShield, FiClock, FiAward, FiHeart, FiGlobe, FiSmile, FiSmartphone } from 'react-icons/fi';
import { gsap } from 'gsap';
import Logo from '../../../../components/common/Logo';
import api from '../../../../services/api';

const AboutAgroyilt = () => {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [aboutContent, setAboutContent] = useState(null);
  const [dynamicStats, setDynamicStats] = useState({
    farmers: '10K+',
    owners: '500+'
  });

  useEffect(() => {
    // Fetch Platform Stats
    api.get('/public/stats')
      .then(res => {
        if (res.data?.success && res.data?.data) {
          const formatNumber = (num) => {
             if (num >= 1000) return (num / 1000).toFixed(1) + 'K+';
             if (num > 0) return num + '+';
             return num;
          };
          setDynamicStats({
             farmers: res.data.data.farmers > 10000 ? formatNumber(res.data.data.farmers) : (res.data.data.farmers || '0'),
             owners: res.data.data.owners > 500 ? formatNumber(res.data.data.owners) : (res.data.data.owners || '0')
          });
        }
      })
      .catch(err => console.error("Failed to fetch stats", err));

    // Fetch About content from API
    api.get('/content/about')
      .then(res => {
        if (res.data?.success && res.data?.data) {
          setAboutContent(res.data.data);
        }
      })
      .catch(err => console.error("Failed to fetch about content", err));

    // Simple entrance animation
    const ctx = gsap.context(() => {
      gsap.from('.animate-item', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out'
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // Gradient Definition for re-use in inline styles
  const grooGradient = 'linear-gradient(135deg, #347989 0%, #BB5F36 100%)';
  const grooTextGradient = {
    background: grooGradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  const features = [
    {
      icon: FiUsers,
      title: 'Expert Providers',
      description: 'Verified professionals for all your needs'
    },
    {
      icon: FiShield,
      title: 'Safe & Secure',
      description: 'Your safety is our top priority'
    },
    {
      icon: FiClock,
      title: 'On-Time Service',
      description: 'Punctual delivery at your convenience'
    },
    {
      icon: FiAward,
      title: 'Quality Assured',
      description: 'Service with 100% satisfaction guarantee'
    }
  ];

  const stats = [
    { number: dynamicStats.farmers, label: 'Happy Farmers' },
    { number: dynamicStats.owners, label: 'Vendors' },
    { number: '4.8', label: 'App Rating' },
  ];

  const parseMarkdownToHtml = (text) => {
    if (!text) return '';
    let html = text;
    
    // Headers
    html = html.replace(/^####\s+(.*$)/gim, '<h4 class="text-[17px] font-bold mt-6 mb-2">$1</h4>');
    html = html.replace(/^###\s+(.*$)/gim, '<h3 class="text-[19px] font-bold mt-6 mb-3">$1</h3>');
    html = html.replace(/^##\s+(.*$)/gim, '<h2 class="text-[21px] font-bold mt-7 mb-3">$1</h2>');
    html = html.replace(/^#\s+(.*$)/gim, '<h1 class="text-[24px] font-extrabold mt-8 mb-4">$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    
    // Bullet points (handle * or -)
    html = html.replace(/^[\*\-]\s+(.*$)/gim, '<li class="ml-5 list-disc mb-2 pl-1">$1</li>');
    
    // Group list items into ul
    html = html.replace(/(<li.*?>.*?<\/li>\n?)+/gim, '<ul class="mb-5 mt-2">$&</ul>');
    
    // Paragraphs: Split by double newline to form paragraphs
    html = html.split(/\n{2,}/).map(p => {
       p = p.trim();
       if (!p) return '';
       if (p.startsWith('<h') || p.startsWith('<ul')) return p;
       // Replace single newlines inside paragraphs with <br>
       return `<p class="mb-4">${p.replace(/\n/g, '<br/>')}</p>`;
    }).join('\n');
    
    return html;
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-50 pb-10">
      {/* SVG Gradient Definition */}
      <svg width="0" height="0" className="absolute">
        <linearGradient id="groo-about-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#347989" />
          <stop offset="50%" stopColor="#D68F35" />
          <stop offset="100%" stopColor="#BB5F36" />
        </linearGradient>
      </svg>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-30 border-b border-gray-100">
        <div className="px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => window.history.state && window.history.state.idx > 0 ? navigate(-1) : navigate('/user')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
          >
            <FiArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <span className="text-xl font-bold" style={grooTextGradient}>About Agroyilt</span>
        </div>
      </header>

      <main className="px-5 py-6 space-y-8">
        {/* Hero Section */}
        <div className="animate-item text-center">
          <div className="relative w-28 h-28 mx-auto mb-6">
            {/* Spinning Border */}
            <div
              className="absolute inset-[-3px] rounded-full opacity-70"
              style={{
                background: 'conic-gradient(from 0deg, #347989, #D68F35, #BB5F36, #347989)',
                animation: 'spin 4s linear infinite',
              }}
            />
            {/* White Background */}
            <div className="absolute inset-0 bg-white rounded-full shadow-lg flex items-center justify-center">
              <Logo className="w-16 h-16 object-contain" />
            </div>
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
            Welcome to <span style={grooTextGradient}>Agroyilt</span>
          </h1>
          <p className="text-gray-500 max-w-xs mx-auto leading-relaxed">
            Your trusted platform for premium agriculture and farm care services.
          </p>
        </div>

        {/* Stats Row */}
        <div className="animate-item flex justify-between bg-white rounded-2xl p-6 shadow-sm border border-gray-100 divide-x divide-gray-100">
          {stats.map((stat, idx) => (
            <div key={idx} className="flex-1 text-center px-2">
              <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#347989] to-[#BB5F36]">
                {stat.number}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Dynamic About Content from Backend */}
        {aboutContent ? (
          <div className="animate-item">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{aboutContent.title || 'About Us'}</h3>
              <div 
                className="text-[15px] text-gray-700 leading-relaxed prose prose-sm max-w-none prose-p:mb-4 prose-headings:text-gray-900 prose-strong:text-gray-900"
                dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(aboutContent.content) }}
              />
            </div>
          </div>
        ) : (
          /* Fallback Mission Statement */
          <div className="animate-item">
            <div className="bg-gradient-to-br from-[#347989]/5 to-[#BB5F36]/5 rounded-2xl p-6 border border-[#347989]/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <FiGlobe className="w-24 h-24" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-3">Our Mission</h3>
              <p className="text-sm text-gray-600 leading-relaxed relative z-10">
                Agroyilt is dedicated to revolutionizing how you experience agriculture equipment and services. We connect you with top-tier equipment owners to deliver safe, reliable, and high-quality services right at your farm. We believe in making farming simpler, one service at a time.
              </p>
            </div>
          </div>
        )}

        {/* Why Choose Us Grid */}
        <div className="animate-item">
          <h3 className="text-lg font-bold text-gray-800 mb-4 px-1">Why Choose Agroyilt?</h3>
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow group"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300"
                  style={{ background: 'linear-gradient(135deg, rgba(52, 121, 137, 0.1), rgba(187, 95, 54, 0.1))' }}>
                  <feature.icon className="w-5 h-5" style={{ stroke: 'url(#groo-about-gradient)' }} />
                </div>
                <h4 className="text-sm font-bold text-gray-800 mb-1">{feature.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div className="animate-item">
          <h3 className="text-lg font-bold text-gray-800 mb-4 px-1">How We Work</h3>
          <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
            {[
              { title: 'Book Details', desc: 'Select service & schedule time', icon: FiSmartphone },
              { title: 'Get Matched', desc: 'We assign a top-rated pro', icon: FiUsers },
              { title: 'Relax', desc: 'Enjoy high-quality service', icon: FiSmile },
            ].map((step, i) => (
              <div key={i} className="flex items-center p-4 border-b last:border-0 border-gray-50 relative">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 mr-4 shadow-sm text-white font-bold text-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#347989] to-[#BB5F36]" />
                  <span className="relative z-10">{i + 1}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">{step.title}</h4>
                  <p className="text-xs text-gray-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Info */}
        <div className="animate-item text-center pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-1">Designed & Developed by</p>
          <span className="text-sm font-bold tracking-wide" style={grooTextGradient}>Agroyilt Team</span>
          <p className="text-[10px] text-gray-300 mt-4">v1.2.1 ? Made with ❤️ in India</p>
        </div>
      </main>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AboutAgroyilt;
