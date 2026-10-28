import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiMinus, FiHelpCircle } from 'react-icons/fi';
import TranslatedText from '../../../components/TranslatedText';
import axios from 'axios';

const FAQSection = () => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeTab, setActiveTab] = useState('Farmer');
    const [faqs, setFaqs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const tabs = ['Farmer', 'Owner', 'General'];
    const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

    const mockFaqs = [
        { question: "Is registration free on AgroYilt?", answer: "Yes, registration for both farmers and shop/machine owners is completely free. You only pay for the services you use or when you make a sale.", category: "General", color: "blue" },
        { question: "How do I book a tractor or harvester?", answer: "Simply login as a farmer, browse 'Agricultural Services', choose your machine, select a vendor based on ratings, and pick your date to confirm the booking.", category: "Farmer", color: "green" },
        { question: "How can I register my shop or machinery?", answer: "Click on 'Join as Vendor', enter your business details and upload necessary documents. Once approved by the admin, you can start listing your items.", category: "Owner", color: "orange" },
        { question: "Can I set my own rental prices for machines?", answer: "Yes, as an owner, you have full control over your pricing. You can set hourly or per-acre rates and update them anytime from your dashboard.", category: "Owner", color: "orange" },
        { question: "How do I track my seed or fertilizer order?", answer: "You can see the real-time status of your order in the 'My Orders' section of the app. You will also get notifications when your order is out for delivery.", category: "Farmer", color: "green" },
        { question: "What if a machine breaks down during the work?", answer: "Vendors are responsible for machine maintenance. If a breakdown occurs, you can contact the vendor directly through the app to request a replacement or repair.", category: "Farmer", color: "green" },
        { question: "When and how will I receive my payments?", answer: "Payments for completed services are credited to your AgroYilt wallet. You can withdraw this money to your bank account anytime via UPI or Bank Transfer.", category: "Owner", color: "orange" },
        { question: "Can I cancel my booking if my plans change?", answer: "Yes, you can cancel your booking. However, please check the vendor's cancellation policy as some may have a small fee if cancelled at the last moment.", category: "Farmer", color: "green" },
        { question: "How do I contact support for help?", answer: "You can use the 'Help & Support' section in the app to chat with us or call our helpline number available on the contact page.", category: "General", color: "blue" },
        { question: "Is my personal data safe on AgroYilt?", answer: "Absolutely. We use high-level encryption to ensure your data, location, and payment details are always secure and never shared without your permission.", category: "General", color: "blue" },
        { question: "Can I rent heavy machines like JCB or Borewell?", answer: "Yes, AgroYilt has a dedicated section for heavy machinery where you can find JCB, Cranes, and Borewell services for your farm needs.", category: "Farmer", color: "green" },
        { question: "How do I manage multiple machines as an owner?", answer: "Our vendor dashboard allows you to add and manage multiple machines easily. You can see independent bookings and income for each machine in one place.", category: "Owner", color: "orange" }
    ];

    useEffect(() => {
        const fetchFAQs = async () => {
            try {
                const response = await axios.get(`${API_URL}/content/faq`);
                if (response.data.success && response.data.data.length > 0) {
                    setFaqs(response.data.data);
                } else {
                    setFaqs(mockFaqs); // Fallback if no data in db
                }
            } catch (error) {
                console.error("Error fetching FAQs:", error);
                setFaqs(mockFaqs); // Fallback on error
            } finally {
                setIsLoading(false);
            }
        };
        fetchFAQs();
    }, []);

    const filteredFaqs = faqs.filter(faq => faq.category === activeTab);

    return (
        <section id="faq" className="py-8 sm:py-14 md:py-20 bg-white relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-green-50 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl opacity-50 z-0 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-50 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl opacity-50 z-0 pointer-events-none" />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center mb-6 sm:mb-10 md:mb-12">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <span className="text-green-600 font-black tracking-widest uppercase text-[10px] sm:text-xs mb-2 sm:mb-3 block">
                            <TranslatedText>Support Center</TranslatedText>
                        </span>
                        <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-gray-900 mb-3 sm:mb-6 leading-tight">
                            <TranslatedText>Frequently Asked Questions</TranslatedText>
                        </h2>
                        <div className="h-1 sm:h-1.5 w-16 sm:w-20 bg-green-600 mx-auto rounded-full mb-6 sm:mb-8" />
                        
                        {/* Tab Selector */}
                        <div className="flex items-center justify-center p-1 bg-gray-100 rounded-xl sm:rounded-2xl max-w-xs sm:max-w-sm mx-auto mb-6 sm:mb-10 overflow-x-auto no-scrollbar">
                            {tabs.map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setActiveTab(tab);
                                        setActiveIndex(0); // Reset accordion to first item in new tab
                                    }}
                                    className={`flex-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                                        activeTab === tab 
                                        ? 'bg-white text-green-600 shadow-md transform scale-[1.02]' 
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <TranslatedText>{tab}</TranslatedText>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>

                <div className="space-y-3 sm:space-y-4 min-h-[350px]">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-2.5 sm:space-y-4"
                        >
                            {filteredFaqs.map((faq, idx) => (
                                <motion.div
                                    key={`${activeTab}-${idx}`}
                                    className={`group border rounded-2xl sm:rounded-3xl transition-all duration-300 ${activeIndex === idx
                                            ? 'border-green-500 bg-white ring-2 sm:ring-4 ring-green-50 shadow-lg sm:shadow-2xl shadow-green-900/5'
                                            : 'border-gray-100 bg-gray-50/50 hover:bg-white hover:border-green-200'
                                        }`}
                                >
                                    <button
                                        onClick={() => setActiveIndex(activeIndex === idx ? -1 : idx)}
                                        className="w-full px-4 py-3.5 sm:px-6 sm:py-5 md:px-8 flex items-center justify-between text-left focus:outline-none"
                                    >
                                        <div className="flex items-center gap-3 sm:gap-4 md:gap-6 min-w-0">
                                            <div className={`hidden sm:flex w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl items-center justify-center shrink-0 transition-colors ${activeIndex === idx ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-400 border border-gray-100'}`}>
                                                <FiHelpCircle size={16} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className={`font-bold text-gray-900 text-xs sm:text-sm md:text-base transition-colors leading-snug ${activeIndex === idx ? 'text-green-600' : 'group-hover:text-green-600'}`}>
                                                    <TranslatedText>{faq.question}</TranslatedText>
                                                </h4>
                                            </div>
                                        </div>
                                        <div className={`flex-shrink-0 transition-all duration-300 ml-2.5 sm:ml-4 ${activeIndex === idx ? 'rotate-180 bg-green-600 text-white shadow-sm' : 'bg-white text-gray-400 border border-gray-100'} w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center`}>
                                            <FiPlus className={activeIndex === idx ? 'rotate-45 text-white' : 'text-gray-500'} size={12} />
                                        </div>
                                    </button>

                                    <AnimatePresence>
                                        {activeIndex === idx && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: "easeOut" }}
                                            >
                                                <div className="px-4 pb-4 sm:px-6 sm:pb-6 md:px-8 md:pl-24 text-gray-600 leading-relaxed text-xs sm:text-sm border-t border-gray-50 pt-3 sm:pt-5">
                                                    <div className="bg-white rounded-xl sm:rounded-2xl shadow-inner border border-green-50 p-3 sm:p-5 italic relative overflow-hidden">
                                                        <div className="absolute top-0 right-0 opacity-5 -translate-y-2 pointer-events-none">
                                                            <FiHelpCircle size={60} />
                                                        </div>
                                                        <TranslatedText>{faq.answer}</TranslatedText>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </section>
    );
};

export default FAQSection;
