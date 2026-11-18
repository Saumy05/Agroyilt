import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

export const DEFAULT_LANDING_CONTENT = {
  hero: {
    badge: 'Founded in India',
    headline: 'AGROYILT',
    tagline: 'Grow more with AGROYILT',
    description: 'AgroYilt is made for farmers. Farmers can book tractors, harvesters, rotavators, drones, JCB, borewell machines, labour, and other equipment on rent. With AgroYilt, they can also easily order seeds, fertilizers, and other farming items from nearby shops. Our goal is to make farming work easy, fast, and on time. Farmers can get modern technology, useful services, weather updates, and support in one place. AgroYilt helps save time, reduce trouble, and improve farming work. We want every farmer to get the right machine, right service, and right support at the right time.',
    btnBookNow: 'Book Now',
    btnOwner: 'Owner Registration',
    btnWorker: 'Worker Join',
    btnWatchGuides: 'Watch Guides',
    stat1Label: 'Happy Farmers',
    stat2Label: 'Verified Owners',
    stat3Label: 'Verified Workers'
  },
  about: {
    badge: 'About AgroYilt',
    title: 'Connecting Farmers, Machine Owners, and Workers on One Smart Platform',
    description: 'AgroYilt connects farmers with verified equipment owners, certified laborers, and quality farm supplies in one transparent platform.',
    missionTitle: 'Our Mission',
    missionText: 'To make modern agricultural equipment and skilled labor accessible and affordable to every Indian farmer, ensuring no crop suffers due to lack of machinery.',
    visionTitle: 'Our Vision',
    visionText: 'To build India’s largest connected rural ecosystem for mechanized, profitable, and stress-free farming.'
  },
  problemSolution: {
    badge: 'Challenges & Solutions',
    title: 'Why Indian Agriculture Needs AgroYilt',
    subtitle: 'Bridging the gap between equipment owners and farmers with technology',
    problemsTitle: 'Traditional Farming Challenges',
    problems: [
      'High cost of modern farm machinery',
      'Limited access to technology in rural areas',
      'Middleman dependency & unorganized services',
      'Lack of timely weather, soil, and crop insights',
      'Small farmers cannot afford high-cost equipment',
      'Labour shortage & rising wages'
    ],
    solutionsTitle: 'The AgroYilt Solution',
    solutions: [
      { title: 'On-Demand Rentals', desc: 'Rent nearby machinery via app' },
      { title: 'Pay-As-You-Go', desc: 'Pay for actual usage hours' },
      { title: 'Verified Vendors', desc: '100% verified owners' },
      { title: 'AI-Advised Farming', desc: 'Weather & crop advisory' }
    ],
    bottomQuote: 'Empowering 140M+ farmers with on-demand mechanization.'
  },
  services: {
    badge: 'Premium Solution',
    title: 'Agriculture Services',
    subtitle: 'Smart farming solutions designed for modern agriculture.',
    btnViewDetails: 'View Details',
    btnBookNow: 'Book Now via App',
    items: [
      { id: 1, title: 'Tractor Rental', desc: 'Top HP tractors for plowing, tilling and transport.', details: 'Our fleet includes top brands like Mahindra, John Deere, and Swaraj.', specs: ['30HP - 90HP Range', 'Verified Operators', 'Attachments available'] },
      { id: 2, title: 'Harvester Booking', desc: 'Modern harvesters for minimal grain loss during harvest.', details: 'High-performance combine harvesters that minimize grain loss.', specs: ['Minimal Grain Loss', 'GPS-linked Billing', '24/7 Season Support'] },
      { id: 3, title: 'Drone Spraying', desc: 'Precision pesticide & fertilizer spraying using drones.', details: 'Drones cover 1 acre in just 10-15 minutes, 90% water saving.', specs: ['10 min per Acre', '90% Water Saving', 'Precision Targeting'] },
      { id: 4, title: 'Farm Workforce', desc: 'Verified skilled and general farm labor on-demand.', details: 'Verified farm laborers and crews for sowing, weeding, harvesting, and field prep.', specs: ['Verified Workers', 'Daily & Acre Wage', 'Direct Booking'] },
      { id: 5, title: 'Seeds & Fertilizer', desc: 'Certified high-yield seeds & organic fertilizers.', details: 'Certified, high-germination seeds and premium fertilizers.', specs: ['Certified Seeds', 'Quality Checked', 'Doorstep Delivery'] },
      { id: 6, title: 'Crop Advisory', desc: 'Expert advice on crop selection based on weather forecasts.', details: 'AI-driven and expert-verified advice based on soil & weather data.', specs: ['Weather Alerts', 'Expert Consultations', 'Pest Risk Alerts'] }
    ]
  },
  workflow: {
    title: 'How It Works',
    subtitle: "A seamless experience built for India's agriculture ecosystem.",
    farmerLabel: 'Farmer Journey',
    farmerSteps: ['OTP Login', 'Select Location', 'Search Machine', 'Check Slot', 'Secure Pay', 'Review'],
    ownerLabel: 'Owner Journey',
    ownerSteps: ['KYC Auth', 'List Machine', 'Admin Verify', 'Get Orders', 'Start Work', 'Direct Pay'],
    adminLabel: 'Admin Journey',
    adminSteps: ['Verify KYC', 'Fleet Monitor', 'Global Push', 'Escrow Pay', 'Analytics', 'Support'],
    transparencyNote: 'Integrated with Real-time OTP & GPS Tracking for complete transparency'
  },
  videoTutorials: {
    title: 'Video Guides',
    subtitle: 'Watch how easy it is to use AgroYilt for farmers, workers, and owners.',
    farmerBadge: 'FOR FARMERS / किसान भाई',
    farmerTitle: 'Farmer Guide: Rent Machinery & Book Workers',
    farmerSubtitle: 'Learn how to book tractors, hire farm labour with Reach OTP, and make secure escrow payments.',
    workerBadge: 'FOR WORKERS / मज़दूर साथी',
    workerTitle: 'Worker Guide: Find Jobs & Get Direct Pay',
    workerSubtitle: 'Learn how to apply for farm labor requests, track working hours, and receive instant wage payouts.',
    vendorBadge: 'FOR OWNERS / मशीन मालिक',
    vendorTitle: 'Owner Guide: List Fleet & Receive Bookings',
    vendorSubtitle: 'Learn how equipment owners register tractors, set hourly rates, and accept booking requests.'
  },
  ecosystem: {
    badge: 'Connected Rural Infrastructure',
    title: 'The Complete AgroYilt Ecosystem',
    subtitle: 'How Indian Agriculture Connects',
    summaryTitle: 'Every stakeholder is protected',
    summarySubtitle: 'From OTP start to geo-fenced work completion and automated escrow release.'
  },
  features: {
    badge: 'Modern Farming Features',
    title: 'Built for Modern Farmers',
    subtitle: 'Packed with features that simplify every step of the agriculture process.',
    items: [
      { title: 'Real-time Tracking', desc: 'Live GPS tracking of your booked tractor or harvester in real-time.' },
      { title: 'Easy Scheduling', desc: 'Pre-book machines for your harvest season to avoid last-minute rushes.' },
      { title: 'Verified Operators', desc: 'Every machine comes with a skilled and verified operator for efficiency.' },
      { title: 'Weather Alerts', desc: 'In-app weather monitoring to help you plan your farming activities better.' },
      { title: 'Proof of Work', desc: 'Secure image & speedometer proof uploads for transparent billing.' },
      { title: 'OTP Security', desc: 'Fully secure transactions with mobile OTP based work verification.' }
    ]
  },
  companyDeepDive: {
    badge: 'Company',
    visionBadge: 'Our Vision & Mission',
    title1: 'Organizing the Unstructured',
    title2: 'Agricultural Service Sector',
    statement: "To build India's—and eventually the world's—largest digital ecosystem for farm mechanization and smart agriculture, enabling farmers to access modern equipment, AI-driven advisory, and agricultural inputs efficiently.",
    quote: 'No farmers should lose income because a tractor or harvester arrived late.',
    marketTitle: 'Market Opportunity',
    marketQuote1: "India has tractors, India has farmers, but India doesn't have a system.",
    marketQuote2: 'We are building the system.',
    marketDesc: "With over 140 million households depending on agriculture, the shift toward Agritech is not just a trend—it's a necessity.",
    impactTitle: 'Impact on Rural Ecosystem',
    scalabilityTitle: 'Scalability',
    scalabilityDesc: 'Designed for rapid expansion through districts and villages, integrating AI and data-driven farming. Our framework scales across multi-state regions and global economies.'
  },
  faq: {
    badge: 'Support Center',
    title: 'Frequently Asked Questions'
  },
  cta: {
    titlePrefix: 'Ready to Revolutionize Your',
    titleHighlight: 'Farm?',
    subtitle: 'Join thousands of smart farmers and equipment owners who are already growing their digital presence with AgroYilt.',
    btnFarmer: 'Get Started as Farmer',
    btnOwner: 'Register Equipment',
    badgeText: 'No Credit Card Required • Instant Activation'
  },
  footer: {
    tagline: 'By Chinmay Anand',
    aboutText: 'AgriTech Platform for On-Demand Farm Machinery & Smart Agriculture. GLOBAL RURAL OUTREACH ORGANISATION LLP. Smart farming for a smarter future.',
    address: 'gulni kushaha Banka bihar 813211',
    phone: '+91 91177 04450',
    email: 'agroyilt@gmail.com',
    newsletterTitle: 'Stay Updated',
    newsletterSubtitle: 'Get the latest harvest season offers and new machine alerts.',
    copyright: 'AgroYilt Technologies. Building the future of farming.',
    facebook: 'https://www.facebook.com/share/1YgEfFD8jW/',
    instagram: 'https://www.instagram.com/agroyilt?igsh=MWticXBlbHR4YnVjMQ==',
    linkedin: 'https://www.linkedin.com/in/global-rural-outreach-organisation-llp-groo-4923873b8/'
  },
  navbar: {
    brandName: 'AGROYILT',
    brandTagline: 'Smart Agriculture',
    joinUserBtn: 'Join as User',
    joinVendorBtn: 'Join as Vendor',
    joinWorkerBtn: 'Join as Worker',
    bookNowBtn: 'Book Now'
  }
};

const LandingContentContext = createContext({
  content: DEFAULT_LANDING_CONTENT,
  loading: false,
  reloadContent: () => {}
});

// Deep merge helper ensuring default structure remains intact
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const result = { ...target };
  Object.keys(source).forEach(key => {
    if (source[key] !== null && source[key] !== undefined) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key]) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  });
  return result;
}

export const LandingContentProvider = ({ children }) => {
  const [content, setContent] = useState(DEFAULT_LANDING_CONTENT);
  const [loading, setLoading] = useState(true);

  const fetchContent = useCallback(async () => {
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await axios.get(`${apiBase}/public/website/landing-content`);
      if (res.data?.success && res.data?.data) {
        setContent(prev => deepMerge(prev, res.data.data));
      }
    } catch {
      // Fallback silently to defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const value = useMemo(() => ({
    content,
    loading,
    reloadContent: fetchContent
  }), [content, loading, fetchContent]);

  return (
    <LandingContentContext.Provider value={value}>
      {children}
    </LandingContentContext.Provider>
  );
};

export const useLandingContent = () => useContext(LandingContentContext);
export default LandingContentContext;
