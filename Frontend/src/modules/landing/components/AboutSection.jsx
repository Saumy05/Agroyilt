import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    FiTruck,
    FiShoppingBag,
    FiWind,
    FiSettings,
    FiUsers,
    FiSun,
    FiDroplet
} from 'react-icons/fi';
import TranslatedText from '../../../components/TranslatedText';
import axios from 'axios';

const getYouTubeEmbedUrl = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11)
      ? `https://www.youtube.com/embed/${match[2]}`
      : null;
};

const AboutSection = () => {
    const [aboutContent, setAboutContent] = useState(null);
    const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

    useEffect(() => {
        const fetchAbout = async () => {
            try {
                const res = await axios.get(`${API_URL}/content/about`);
                if (res.data.success && res.data.data) {
                    setAboutContent(res.data.data);
                }
            } catch (err) {
                console.error("Error fetching About content:", err);
            }
        };
        fetchAbout();
    }, []);
    const services = [
        {
            icon: <FiTruck className="text-green-600" size={24} />,
            title: "Tractor & Harvester Booking",
            desc: "Get tractors, harvesters, threshers, sprayers, cultivators, and rotavators on rent."
        },
        {
            icon: <FiShoppingBag className="text-orange-500" size={24} />,
            title: "Seeds & Fertilizer Ordering",
            desc: "Order farm items easily from nearby shops"
        },
        {
            icon: <FiWind className="text-blue-500" size={24} />,
            title: "Drone & Modern Farming Services",
            desc: "Access new farming technology and equipment."
        },
        {
            icon: <FiSettings className="text-red-500" size={24} />,
            title: "Heavy Machinary",
            desc: "Book heavy machines like Jcb, cranes, dumpers, loaders, drilling machines."
        },
        {
            icon: <FiDroplet className="text-cyan-500" size={24} />,
            title: "Borewell Services",
            desc: "Get borewll services when needed"
        },
        {
            icon: <FiSun className="text-yellow-500" size={24} />,
            title: "Weather & Farming Support",
            desc: "Get useful updates and support for better planning."
        }
    ];

    return (
        <section id="about" className="py-12 md:py-24 bg-white overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-12 md:mb-20">
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-8">
                            <TranslatedText>{aboutContent ? aboutContent.title : "About AgroYilt"}</TranslatedText>
                        </h2>
                        {aboutContent && aboutContent.content ? (
                            <div className="space-y-6 text-lg text-gray-600 leading-relaxed whitespace-pre-line">
                                {aboutContent.content}
                            </div>
                        ) : (
                            <div className="space-y-6 text-lg text-gray-600 leading-relaxed">
                                <p>
                                    <TranslatedText>
                                        AgroYilt is made to help farmers with daily farming needs in one place. They can also book tractors, harvesters, rotavators, drones, JCB, borewell machines, and other equipment on rent.
                                    </TranslatedText>
                                </p>
                                <p>
                                    <TranslatedText>
                                        Farmers can order seeds, fertilizers, and other farm items from nearby shops. AgroYilt aims to make farming work easy, fast, and on time with useful support and modern technology.
                                    </TranslatedText>
                                </p>
                            </div>
                        )}

                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative"
                    >
                        <div className="aspect-square rounded-[2rem] bg-green-50 flex items-center justify-center p-6 md:p-10 overflow-hidden shadow-2xl shadow-green-900/10 border border-green-100/50">
                            {aboutContent && aboutContent.images && aboutContent.images.length > 0 ? (
                                aboutContent.images.length === 1 ? (
                                    <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-xl group">
                                        <img 
                                            src={aboutContent.images[0].url} 
                                            alt={aboutContent.images[0].name || "About AgroYilt"} 
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                                            <span className="text-white font-bold text-lg drop-shadow-md">
                                                <TranslatedText>{aboutContent.images[0].name}</TranslatedText>
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`grid ${aboutContent.images.length > 4 ? 'grid-cols-3 md:grid-cols-2' : 'grid-cols-2'} gap-4 w-full h-full overflow-y-auto no-scrollbar p-2`}>
                                        {aboutContent.images.map((img, idx) => (
                                            <div 
                                                key={idx} 
                                                className={`bg-white rounded-2xl shadow-sm overflow-hidden group relative aspect-square border-4 border-white ${
                                                    aboutContent.images.length <= 4 && (idx === 1 ? 'translate-y-8' : idx === 2 ? '-translate-y-8' : '')
                                                }`}
                                            >
                                                <img 
                                                    src={img.url} 
                                                    alt={img.name || `About ${idx}`} 
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end justify-center p-3">
                                                    <span className="text-white font-bold text-[10px] md:text-xs text-center drop-shadow-sm uppercase tracking-wider">
                                                        <TranslatedText>{img.name}</TranslatedText>
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                <div className="grid grid-cols-2 gap-4 w-full h-full">
                                    <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                                            <FiTruck className="text-green-600" size={24} />
                                        </div>
                                        <span className="font-bold text-xs"><TranslatedText>Rental</TranslatedText></span>
                                    </div>
                                    <div className="bg-white rounded-2xl shadow-sm p-4 translate-y-8 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-2">
                                            <FiShoppingBag className="text-orange-600" size={24} />
                                        </div>
                                        <span className="font-bold text-xs"><TranslatedText>Shop</TranslatedText></span>
                                    </div>
                                    <div className="bg-white rounded-2xl shadow-sm p-4 -translate-y-8 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                                            <FiWind className="text-blue-600" size={24} />
                                        </div>
                                        <span className="font-bold text-xs"><TranslatedText>Drone</TranslatedText></span>
                                    </div>
                                    <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center mb-2">
                                            <FiDroplet className="text-cyan-600" size={24} />
                                        </div>
                                        <span className="font-bold text-xs"><TranslatedText>Borewell</TranslatedText></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Videos Section Distributed Below */}
                {(aboutContent?.videos?.length > 0 || aboutContent?.videoUrl) && (
                    <div className="mb-16 md:mb-24">
                        <div className="text-center mb-8">
                            <h3 className="text-2xl md:text-3xl font-black text-gray-900">
                                <TranslatedText>Watch & Learn</TranslatedText>
                            </h3>
                        </div>
                        <div className={`grid grid-cols-1 ${aboutContent?.videos?.length > 1 ? 'md:grid-cols-2 lg:grid-cols-2' : 'max-w-3xl mx-auto'} gap-8`}>
                            {aboutContent?.videos?.length > 0 ? (
                                aboutContent.videos.map((vid, idx) => (
                                    <motion.div 
                                        key={idx} 
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        className="rounded-3xl overflow-hidden shadow-2xl border border-gray-100 bg-white flex flex-col h-full hover:shadow-3xl transition-shadow"
                                    >
                                        <div className="flex-grow">
                                            {getYouTubeEmbedUrl(vid.url) ? (
                                                <iframe
                                                    width="100%"
                                                    height="315"
                                                    src={getYouTubeEmbedUrl(vid.url)}
                                                    title={`YouTube video player ${idx + 1}`}
                                                    frameBorder="0"
                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                    allowFullScreen
                                                    className="w-full aspect-video"
                                                ></iframe>
                                            ) : (
                                                <video 
                                                    width="100%" 
                                                    height="315" 
                                                    controls 
                                                    className="w-full aspect-video object-cover"
                                                    src={vid.url}
                                                >
                                                    Your browser does not support the video tag.
                                                </video>
                                            )}
                                        </div>
                                        {vid.description && (
                                            <div className="p-5 bg-gradient-to-b from-gray-50 to-white border-t border-gray-100 mt-auto">
                                                <p className="text-gray-700 text-sm md:text-base text-center font-medium leading-relaxed">
                                                    <TranslatedText>{vid.description}</TranslatedText>
                                                </p>
                                            </div>
                                        )}
                                    </motion.div>
                                ))
                            ) : (
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    className="rounded-3xl overflow-hidden shadow-2xl border border-gray-100 bg-white flex flex-col h-full hover:shadow-3xl transition-shadow"
                                >
                                    <div className="flex-grow">
                                        {getYouTubeEmbedUrl(aboutContent.videoUrl) ? (
                                            <iframe
                                                width="100%"
                                                height="315"
                                                src={getYouTubeEmbedUrl(aboutContent.videoUrl)}
                                                title="YouTube video player"
                                                frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                                className="w-full aspect-video"
                                            ></iframe>
                                        ) : (
                                            <video 
                                                width="100%" 
                                                height="315" 
                                                controls 
                                                className="w-full aspect-video object-cover"
                                                src={aboutContent.videoUrl}
                                            >
                                                Your browser does not support the video tag.
                                            </video>
                                        )}
                                    </div>
                                    {aboutContent.videoDescription && (
                                        <div className="p-5 bg-gradient-to-b from-gray-50 to-white border-t border-gray-100 mt-auto">
                                            <p className="text-gray-700 text-sm md:text-base text-center font-medium leading-relaxed">
                                                <TranslatedText>{aboutContent.videoDescription}</TranslatedText>
                                            </p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    </div>
                )}

                <div>
                    <div className="text-center mb-8 md:mb-12">
                        <h3 className="text-3xl font-black text-gray-900">
                            <TranslatedText>Our Services</TranslatedText>
                        </h3>
                    </div>

                    {/* Mobile Slider */}
                    <div className="sm:hidden -mx-4">
                        <div className="flex flex-nowrap items-stretch overflow-x-auto w-full gap-4 pb-8 no-scrollbar snap-x snap-mandatory px-4 touch-pan-x relative">
                            {services.map((service, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 1, y: 0 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white p-6 rounded-3xl hover:shadow-2xl transition-all border border-green-100 h-full flex flex-col text-center items-center flex-shrink-0 w-[85%] min-w-0 snap-center shadow-xl shadow-green-900/5"
                                >
                                    <div className="mb-4 p-3 bg-white rounded-xl shadow-sm">
                                        {service.icon}
                                    </div>
                                    <h4 className="font-bold text-gray-900 mb-2 truncate w-full">
                                        <TranslatedText>{service.title}</TranslatedText>
                                    </h4>
                                    <p className="text-sm text-gray-600 leading-relaxed whitespace-normal break-words w-full px-2">
                                        <TranslatedText>{service.desc}</TranslatedText>
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Desktop Grid */}
                    <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
                        {services.map((service, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-gray-50 p-6 rounded-2xl hover:bg-white hover:shadow-xl transition-all border border-transparent hover:border-gray-100 h-full flex flex-col text-center items-center"
                            >
                                <div className="mb-4 p-3 bg-white rounded-xl shadow-sm">
                                    {service.icon}
                                </div>
                                <h4 className="font-bold text-gray-900 mb-2 truncate w-full">
                                    <TranslatedText>{service.title}</TranslatedText>
                                </h4>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    <TranslatedText>{service.desc}</TranslatedText>
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AboutSection;
