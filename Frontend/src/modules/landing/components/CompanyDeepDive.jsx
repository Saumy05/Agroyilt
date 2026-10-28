import React, { useMemo, useRef, useState } from 'react';
import { motion, useInView, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { FiTrendingUp, FiTarget, FiBox, FiUsers, FiGlobe, FiShield } from 'react-icons/fi';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

// Color palette per card index
const cardColors = [
    { bg: 'from-green-500 to-green-700', glow: 'rgba(34₹97,94,0.35)', light: 'bg-green-50', text: 'text-green-700' },
    { bg: 'from-blue-500 to-blue-700', glow: 'rgba(59₹30,246,0.35)', light: 'bg-blue-50', text: 'text-blue-700' },
    { bg: 'from-purple-500 to-purple-700', glow: 'rgba(168,85,247,0.35)', light: 'bg-purple-50', text: 'text-purple-700' },
    { bg: 'from-orange-500 to-orange-700', glow: 'rgba(249₹15,22,0.35)', light: 'bg-orange-50', text: 'text-orange-700' },
    { bg: 'from-cyan-500 to-cyan-700', glow: 'rgba(6₹82,212,0.35)', light: 'bg-cyan-50', text: 'text-cyan-700' },
    { bg: 'from-rose-500 to-rose-700', glow: 'rgba(244,63,94,0.35)', light: 'bg-rose-50', text: 'text-rose-700' },
];

const ImpactCard = ({ impact, idx, getTranslatedText }) => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-40px' });
    const [hovered, setHovered] = useState(false);

    // 3D tilt values
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 20 });
    const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 20 });

    const handleMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
        mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
    };
    const handleMouseLeave = () => {
        mouseX.set(0);
        mouseY.set(0);
    };

    const color = cardColors[idx % cardColors.length];

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{ delay: idx * 0.08, duration: 0.45 }}
            style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 800 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            className="relative flex flex-col items-center text-center p-2.5 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-gray-100 cursor-default overflow-hidden shadow-sm"
        >
            {/* Shimmer border on hover */}
            <motion.div
                className={`absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-br ${color.bg} opacity-0`}
                animate={{ opacity: hovered ? 0.08 : 0 }}
                transition={{ duration: 0.3 }}
            />
            {/* Glow shadow */}
            <motion.div
                className="absolute inset-0 rounded-xl sm:rounded-2xl"
                animate={{ boxShadow: hovered ? `0 12px 30px ${color.glow}` : '0 1px 4px rgba(0,0,0,0.03)' }}
                transition={{ duration: 0.35 }}
            />
            {/* Top shimmer line */}
            <motion.div
                className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${color.bg} rounded-t-xl sm:rounded-t-2xl`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: hovered ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                style={{ transformOrigin: 'left' }}
            />

            {/* Icon */}
            <div className="relative z-10 mb-1.5 sm:mb-2.5">
                <div
                    className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm ${color.light}`}
                >
                    <span className={`${color.text}`}>
                        {React.cloneElement(impact.icon, { size: 16, className: 'sm:text-[20px]' })}
                    </span>
                </div>
            </div>

            {/* Title */}
            <p className="relative z-10 text-[9px] sm:text-[10px] font-black uppercase tracking-tight leading-tight text-gray-800">
                {getTranslatedText(impact.title)}
            </p>
        </motion.div>
    );
};

const CompanyDeepDive = () => {
    const allTexts = useMemo(() => [
        "Our Vision & Mission",
        "Organizing the Unstructured",
        "Agricultural Service Sector",
        "To build India's—and eventually the world's—largest digital ecosystem for farm mechanization and smart agriculture, enabling farmers to access modern equipment, AI-driven advisory, and agricultural inputs efficiently.",
        "No farmers should lose income because a tractor or harvester arrived late.",
        "Market Opportunity",
        "India has tractors, India has farmers, but India doesn't have a system.",
        "We are building the system.",
        "With over 140 million households depending on agriculture, the shift toward Agritech is not just a trend—it's a necessity.",
        "Impact on Rural Ecosystem",
        "Farmers in India", "The backbone of the Indian economy.",
        "GDP Contribution", "Agriculture's significant share in national GDP.",
        "Mechanization", "Huge scope for digital mechanization platforms.",
        "Opportunity", "Agricultural services market is scaling rapidly.",
        "Increase Productivity", "Reduce Equipment Costs", "Create Rural Employment",
        "Improve Farmers' Income", "Modern Tech to Villages", "Timely Availability",
        "Scalability",
        "Designed for rapid expansion through districts and villages, integrating AI and data-driven farming. Our framework scales across multi-state regions and global economies.",
        "AI Integration", "District Expansion",
        "Founder & CEO", "Designating Partner", "Co Founder",
        "Transforming agriculture through technology.",
        "Company",
    ], []);

    const { getTranslatedText } = usePageTranslation(allTexts);

    const marketStats = [
        { label: "Farmers in India", value: "140M+", desc: "The backbone of the Indian economy." },
        { label: "GDP Contribution", value: "18%", desc: "Agriculture's significant share in national GDP." },
        { label: "Mechanization", value: "Low", desc: "Huge scope for digital mechanization platforms." },
        { label: "Opportunity", value: "Billions", desc: "Agricultural services market is scaling rapidly." }
    ];
    const impacts = [
        { title: "Increase Productivity", icon: <FiTrendingUp /> },
        { title: "Reduce Equipment Costs", icon: <FiShield /> },
        { title: "Create Rural Employment", icon: <FiUsers /> },
        { title: "Improve Farmers' Income", icon: <FiBox /> },
        { title: "Modern Tech to Villages", icon: <FiGlobe /> },
        { title: "Timely Availability", icon: <FiTarget /> }
    ];

    return (
        <section id="company" className="py-8 sm:py-12 md:py-16 bg-white overflow-hidden">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">

                {/* Vision Section */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="mb-8 sm:mb-12 text-center max-w-4xl mx-auto"
                >
                    <h2 className="text-[10px] sm:text-xs text-green-700 font-bold tracking-[0.3em] uppercase mb-2 sm:mb-4">{getTranslatedText("Our Vision & Mission")}</h2>
                    <p className="text-xl sm:text-2xl md:text-4xl font-black text-gray-900 leading-tight mb-4 sm:mb-6 tracking-tighter">
                        {getTranslatedText("Organizing the Unstructured")} <br />
                        <span className="text-green-600 font-serif italic text-lg sm:text-xl md:text-3xl">{getTranslatedText("Agricultural Service Sector")}</span>
                    </p>
                    <p className="text-xs sm:text-sm md:text-base text-gray-600 leading-relaxed font-medium bg-gray-50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-gray-100 italic shadow-inner">
                        "{getTranslatedText("To build India's—and eventually the world's—largest digital ecosystem for farm mechanization and smart agriculture, enabling farmers to access modern equipment, AI-driven advisory, and agricultural inputs efficiently.")}"
                    </p>
                    <p className="mt-4 sm:mt-6 text-sm sm:text-base md:text-lg font-black text-red-600">
                        ➡️ {getTranslatedText("No farmers should lose income because a tractor or harvester arrived late.")}
                    </p>
                </motion.div>

                {/* Market Opportunity */}
                <div className="mb-10 sm:mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="max-w-4xl mx-auto"
                    >
                        <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 sm:mb-4 tracking-tight text-center">{getTranslatedText("Market Opportunity")}</h3>
                        <p className="text-gray-600 mb-6 sm:mb-8 leading-relaxed text-xs sm:text-sm md:text-base text-center max-w-2xl mx-auto">
                            {getTranslatedText("India has tractors, India has farmers, but India doesn't have a system.")}
                            <strong className="text-green-700"> {getTranslatedText("We are building the system.")}</strong> {getTranslatedText("With over 140 million households depending on agriculture, the shift toward Agritech is not just a trend—it's a necessity.")}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
                            {marketStats.map((stat, i) => (
                                <div key={i} className="p-3 sm:p-5 bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:border-green-200 transition-all text-center">
                                    <p className="text-xl sm:text-2xl font-black text-green-700 mb-0.5 sm:mb-1 tracking-tighter">{stat.value}</p>
                                    <p className="text-[9px] sm:text-[10px] font-black text-gray-800 mb-0.5 uppercase tracking-wider">{getTranslatedText(stat.label)}</p>
                                    <p className="text-[8px] sm:text-[9px] text-gray-400 font-bold uppercase truncate">{getTranslatedText(stat.desc)}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Impact Section */}
                <div className="mb-10 sm:mb-16">
                    <motion.h3
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-xl sm:text-2xl font-black text-gray-900 text-center mb-2 uppercase tracking-tight"
                    >
                        {getTranslatedText("Impact on Rural Ecosystem")}
                    </motion.h3>
                    <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: '3rem' }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="h-1 bg-green-500 rounded-full mx-auto mb-6 sm:mb-10"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
                        {impacts.map((impact, i) => (
                            <ImpactCard
                                key={i}
                                impact={impact}
                                idx={i}
                                getTranslatedText={getTranslatedText}
                            />
                        ))}
                    </div>
                </div>

                {/* Scalability & Team */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    <div className="lg:col-span-2 bg-gradient-to-br from-green-600 to-green-800 p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                            <FiTrendingUp size={80} />
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black mb-2 sm:mb-4">{getTranslatedText("Scalability")}</h3>
                        <p className="text-green-100 mb-4 sm:mb-6 leading-relaxed font-medium text-xs sm:text-sm">
                            {getTranslatedText("Designed for rapid expansion through districts and villages, integrating AI and data-driven farming. Our framework scales across multi-state regions and global economies.")}
                        </p>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            <span className="bg-white/10 backdrop-blur-md px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold border border-white/20 uppercase tracking-wider">{getTranslatedText("AI Integration")}</span>
                            <span className="bg-white/10 backdrop-blur-md px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold border border-white/20 uppercase tracking-wider">{getTranslatedText("District Expansion")}</span>
                        </div>
                    </div>

                    <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-gray-100 shadow-md flex flex-col justify-center">
                        <div className="flex flex-col gap-3 sm:gap-4 mb-3 sm:mb-4">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-green-700 mb-1">{getTranslatedText("Founder & CEO")}</p>
                                <h3 className="text-lg sm:text-2xl font-black text-gray-900 leading-tight">Chinmay Anand</h3>
                                <p className="text-[11px] sm:text-xs text-gray-500 font-bold">Designated Partner</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-green-700 mb-1">{getTranslatedText("Co Founder")}</p>
                                <h3 className="text-lg sm:text-2xl font-black text-gray-900 leading-tight">Ifat Khanam</h3>
                            </div>
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-gray-600 font-medium leading-relaxed italic border-l-4 border-green-600 pl-3 sm:pl-4 mt-1 sm:mt-2">
                            "{getTranslatedText("Transforming agriculture through technology.")}"
                        </p>
                        <div className="mt-4 sm:mt-6">
                            <p className="text-[8px] sm:text-[9px] font-black uppercase text-gray-400 tracking-wider mb-0.5">{getTranslatedText("Company")}</p>
                            <p className="text-[10px] sm:text-[11px] font-black text-gray-800 leading-tight">GLOBAL RURAL OUTREACH ORGANISATION LLP</p>
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
};

export default CompanyDeepDive;
