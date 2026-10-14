import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCalendar, FiBookOpen, FiShare2, FiTag } from 'react-icons/fi';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import TranslatedText from '../../../components/TranslatedText';
import flutterBridge from '../../../utils/flutterBridge';

const ArticleDetail = () => {
    const { id } = useParams();
    const [article, setArticle] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        window.scrollTo(0, 0);
        const fetchArticle = async () => {
            try {
                const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/public/website/articles`);
                if (res.data.success) {
                    const found = res.data.data.find(a => a._id === id);
                    setArticle(found);
                }
            } catch (error) {
                console.error("Error fetching article:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchArticle();
    }, [id]);

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-orange-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div></div>;
    if (!article) return <div className="min-h-screen flex items-center justify-center bg-orange-50"><div className="text-center"><h1 className="text-4xl font-bold mb-4">Article Not Found</h1><Link to="/articles" className="text-orange-600 font-bold underline">Back to Articles</Link></div></div>;

    return (
        <div className="min-h-screen bg-white">
            <Navbar />
            
            {/* Header section for Articles */}
            <div className="pt-32 pb-20 bg-orange-50 px-4">
                <div className="max-w-5xl mx-auto">
                    <Link to="/articles" className="inline-flex items-center gap-2 text-orange-600 font-black mb-10 hover:gap-4 transition-all uppercase tracking-widest text-xs border border-orange-200 px-4 py-2 rounded-full">
                        <FiArrowLeft /> <TranslatedText>Featured Articles</TranslatedText>
                    </Link>
                    <div className="flex items-center gap-3 mb-6">
                        <span className="bg-orange-600 text-white text-[10px] font-black uppercase px-4 py-1.5 rounded-full shadow-lg shadow-orange-950/20">{article.category}</span>
                        <span className="h-1 w-1 bg-orange-300 rounded-full"></span>
                        <span className="text-orange-950 font-bold text-xs flex items-center gap-2"><FiCalendar /> Published: {new Date(article.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black text-gray-900 leading-tight mb-8">
                        {article.title}
                    </h1>
                </div>
            </div>

            {/* Featured Image - full width within container */}
            <div className="max-w-6xl mx-auto px-4 -mt-12 mb-20 relative z-10">
                <div className="aspect-video lg:aspect-[21/9] rounded-[48px] overflow-hidden shadow-2xl shadow-orange-950/20 border-8 border-white">
                    <img src={article.image || "https://placehold.jp/1200x600.png"} alt={article.title} className="w-full h-full object-cover" />
                </div>
            </div>

            {/* Content Container */}
            <article className="max-w-4xl mx-auto px-4 pb-32 relative z-10">
                {/* Body Text */}
                <div className="prose prose-2xl prose-orange max-w-none text-gray-800 leading-[1.7] font-medium tracking-tight">
                    {article.content.split('\n').map((para, i) => (
                        <p key={i} className="mb-8">{para}</p>
                    ))}
                </div>

                {/* Footer Section in Article */}
                <div className="mt-24 p-12 bg-gray-50 rounded-[48px] flex flex-col items-center text-center border-2 border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-6">
                        <FiBookOpen size={32} />
                    </div>
                    <h3 className="text-2xl font-black mb-4">Deepen your knowledge</h3>
                    <p className="text-gray-500 mb-8 max-w-sm">Join our network of progressive farmers and experts to share knowledge and experience.</p>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => flutterBridge.shareContent({
                                title: article.title,
                                text: `Check out this article on Agroyilt: ${article.title}`,
                                url: window.location.href
                            })}
                            className="flex items-center gap-2 text-gray-900 font-black border-2 border-gray-900 px-8 py-3 rounded-2xl hover:bg-gray-900 hover:text-white transition-all">
                            <FiShare2 /> Share Resource
                        </button>
                        <Link to="/vendor/login" className="flex items-center gap-2 bg-orange-600 text-white font-black px-8 py-3 rounded-2xl hover:bg-orange-700 transition-all shadow-xl shadow-orange-950/20">
                            Become a vendor
                        </Link>
                    </div>
                </div>
            </article>

            <Footer />
        </div>
    );
};

export default ArticleDetail;
