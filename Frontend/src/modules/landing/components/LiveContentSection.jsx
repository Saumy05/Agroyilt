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
        <section id="insights" className="py-12 md:py-24 bg-white relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 md:mb-16 gap-6">
                    <div>
                        <motion.span 
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-green-100 text-green-700 px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-4 inline-block shadow-sm"
                        >
                            <TranslatedText>Knowledge Center</TranslatedText>
                        </motion.span>
                        <motion.h2 
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-4xl md:text-5xl font-black text-gray-900"
                        >
                            <TranslatedText>Latest Blogs & Articles</TranslatedText>
                        </motion.h2>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24">
                    {/* Blogs Section */}
                    {blogs.length > 0 && (
                        <div className="flex flex-col items-center">
                            <div className="flex items-center justify-between w-full mb-8 border-b border-gray-100 pb-4 px-2">
                                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <FiFileText className="text-green-600" /> <TranslatedText>Recent Blogs</TranslatedText>
                                </h3>
                                <Link to="/blogs" className="text-green-600 font-bold text-xs flex items-center gap-1 hover:gap-2 transition-all">
                                    <TranslatedText>Explore All</TranslatedText> <FiArrowRight />
                                </Link>
                            </div>
                            
                            <div className="flex -space-x-4 md:-space-x-8 hover:space-x-1 transition-all duration-500 py-4">
                                {blogs.map((blog, idx) => (
                                    <Link 
                                        to={`/blogs/${blog._id}`} 
                                        key={blog._id}
                                        className="relative group cursor-pointer"
                                    >
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: idx * 0.1 }}
                                            className="w-24 h-24 md:w-40 md:h-40 rounded-full border-4 border-white shadow-xl overflow-hidden group-hover:z-30 group-hover:scale-110 transition-all duration-300 ring-4 ring-green-50"
                                        >
                                            <img 
                                                src={blog.image || "https://placehold.jp/300x200.png"} 
                                                alt={blog.title} 
                                                className="w-full h-full object-cover group-hover:brightness-110 transition-all"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                                                <span className="text-white text-[10px] md:text-sm font-bold text-center leading-tight line-clamp-2">{blog.title}</span>
                                            </div>
                                        </motion.div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Articles Section */}
                    {articles.length > 0 && (
                        <div className="flex flex-col items-center">
                            <div className="flex items-center justify-between w-full mb-8 border-b border-gray-100 pb-4 px-2">
                                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <FiTag className="text-orange-500" /> <TranslatedText>Featured Articles</TranslatedText>
                                </h3>
                                <Link to="/articles" className="text-orange-500 font-bold text-xs flex items-center gap-1 hover:gap-2 transition-all">
                                    <TranslatedText>Explore All</TranslatedText> <FiArrowRight />
                                </Link>
                            </div>
                            
                            <div className="flex -space-x-4 md:-space-x-8 hover:space-x-1 transition-all duration-500 py-4">
                                {articles.map((article, idx) => (
                                    <Link 
                                        to={`/articles/${article._id}`} 
                                        key={article._id}
                                        className="relative group cursor-pointer"
                                    >
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: idx * 0.1 }}
                                            className="w-24 h-24 md:w-40 md:h-40 rounded-full border-4 border-white shadow-xl overflow-hidden group-hover:z-30 group-hover:scale-110 transition-all duration-300 ring-4 ring-orange-50"
                                        >
                                            <img 
                                                src={article.image || "https://placehold.jp/300x200.png"} 
                                                alt={article.title} 
                                                className="w-full h-full object-cover group-hover:brightness-110 transition-all"
                                            />
                                            <div className="absolute inset-0 bg-orange-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                                                <span className="text-white text-[10px] md:text-sm font-bold text-center leading-tight line-clamp-2">{article.title}</span>
                                            </div>
                                        </motion.div>
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
