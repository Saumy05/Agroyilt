import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiArrowRight, FiCalendar, FiTag, FiFileText } from 'react-icons/fi';
import axios from 'axios';
import { Link } from 'react-router-dom';
import TranslatedText from '../../../components/TranslatedText';

const LiveContentSection = () => {
    const [blogs, setBlogs] = useState([]);
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const apiBase = import.meta.env.VITE_API_BASE_URL || '';
                const [blogRes, articleRes] = await Promise.all([
                    axios.get(`${apiBase}/public/website/blogs`),
                    axios.get(`${apiBase}/public/website/articles`)
                ]);
                
                if (blogRes.data.success) {
                    const data = blogRes.data.data;
                    setBlogs(Array.isArray(data) ? data.filter(b => b.isActive).slice(0, 3) : []);
                }
                if (articleRes.data.success) {
                    const data = articleRes.data.data;
                    setArticles(Array.isArray(data) ? data.filter(a => a.isActive).slice(0, 3) : []);
                }
            } catch (error) {
                console.error("Error fetching content:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading || (blogs.length === 0 && articles.length === 0)) return null;

    return (
        <section id="insights" className="py-8 sm:py-14 md:py-20 bg-white relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 sm:mb-10 md:mb-14 gap-3">
                    <div>
                        <motion.span 
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-green-100 text-green-700 px-3 sm:px-4 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold tracking-widest uppercase mb-2 sm:mb-3 inline-block shadow-sm"
                        >
                            <TranslatedText>Knowledge Center</TranslatedText>
                        </motion.span>
                        <motion.h2 
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-2xl sm:text-4xl md:text-5xl font-black text-gray-900"
                        >
                            <TranslatedText>Latest Blogs & Articles</TranslatedText>
                        </motion.h2>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10 md:gap-16">
                    {/* Blogs Section */}
                    {blogs.length > 0 && (
                        <div className="flex flex-col">
                            <div className="flex items-center justify-between w-full mb-3 sm:mb-4 border-b border-gray-100 pb-2.5 px-1">
                                <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <FiFileText className="text-green-600" /> <TranslatedText>Recent Blogs</TranslatedText>
                                </h3>
                                <Link to="/blogs" className="text-green-600 font-bold text-xs flex items-center gap-1 hover:gap-1.5 transition-all">
                                    <TranslatedText>Explore All</TranslatedText> <FiArrowRight size={12} />
                                </Link>
                            </div>
                            
                            <div className="space-y-2.5 w-full">
                                {blogs.map((blog) => (
                                    <Link 
                                        to={`/blogs/${blog._id}`} 
                                        key={blog._id}
                                        className="group block bg-gray-50 hover:bg-green-50/40 p-2.5 sm:p-3 rounded-2xl border border-gray-100 hover:border-green-200 transition-all shadow-sm"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 border border-gray-100 bg-gray-200">
                                                <img 
                                                    src={blog.image || "https://placehold.jp/300x200.png"} 
                                                    alt={blog.title} 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="text-xs sm:text-sm font-bold text-gray-900 group-hover:text-green-700 transition-colors line-clamp-2 leading-snug">
                                                    {blog.title}
                                                </h4>
                                                <span className="text-[10px] sm:text-xs text-green-600 font-semibold mt-1 inline-flex items-center gap-1">
                                                    <TranslatedText>Read Blog</TranslatedText> <FiArrowRight size={10} />
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Articles Section */}
                    {articles.length > 0 && (
                        <div className="flex flex-col">
                            <div className="flex items-center justify-between w-full mb-3 sm:mb-4 border-b border-gray-100 pb-2.5 px-1">
                                <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <FiTag className="text-orange-500" /> <TranslatedText>Featured Articles</TranslatedText>
                                </h3>
                                <Link to="/articles" className="text-orange-500 font-bold text-xs flex items-center gap-1 hover:gap-1.5 transition-all">
                                    <TranslatedText>Explore All</TranslatedText> <FiArrowRight size={12} />
                                </Link>
                            </div>
                            
                            <div className="space-y-2.5 w-full">
                                {articles.map((article) => (
                                    <Link 
                                        to={`/articles/${article._id}`} 
                                        key={article._id}
                                        className="group block bg-gray-50 hover:bg-orange-50/40 p-2.5 sm:p-3 rounded-2xl border border-gray-100 hover:border-orange-200 transition-all shadow-sm"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 border border-gray-100 bg-gray-200">
                                                <img 
                                                    src={article.image || "https://placehold.jp/300x200.png"} 
                                                    alt={article.title} 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="text-xs sm:text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-2 leading-snug">
                                                    {article.title}
                                                </h4>
                                                <span className="text-[10px] sm:text-xs text-orange-600 font-semibold mt-1 inline-flex items-center gap-1">
                                                    <TranslatedText>Read Article</TranslatedText> <FiArrowRight size={10} />
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 translate-y-1/2 -translate-x-1/2"></div>
        </section>
    );
};

export default LiveContentSection;
