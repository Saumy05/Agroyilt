import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import ctaBg from '../landing_images/fertilizer_seeds4.jpg';
import TranslatedText from '../../../components/TranslatedText';
import PlayStoreButton from './PlayStoreButton';

const CTA = () => {
    return (
        <section className="py-16 relative overflow-hidden bg-gray-900">
            <div className="absolute inset-0 z-0">
                <img
                    src={ctaBg}
                    className="w-full h-full object-cover opacity-30"
                    alt="AgroYilt Background"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-gray-900"></div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="bg-white/10 backdrop-blur-xl rounded-[3rem] p-10 md:p-14 text-center border border-white/20 shadow-2xl">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        className="max-w-3xl mx-auto"
                    >
                        <h2 className="text-3xl md:text-4xl font-black text-white mb-6 leading-tight">
                            <TranslatedText>Ready to Revolutionize Your</TranslatedText> <span className="text-yellow-400 font-serif italic"><TranslatedText>Farm?</TranslatedText></span>
                        </h2>
                        <p className="text-lg text-green-100 mb-10 leading-relaxed">
                            <TranslatedText>Join thousands of smart farmers and equipment owners who are already growing their digital presence with AgroYilt.</TranslatedText>
                        </p>

                        <div className="flex flex-col sm:flex-row justify-center gap-6">
                            <Link
                                to="/user/signup"
                                className="bg-white text-green-800 px-6 py-3 rounded-full text-lg font-bold hover:bg-yellow-500 hover:text-white transition-all transform hover:scale-105 shadow-xl"
                            >
                                <TranslatedText>Get Started as Farmer</TranslatedText>
                            </Link>
                            <Link
                                to="/vendor/signup"
                                className="bg-transparent border-2 border-white text-white px-6 py-3 rounded-full text-lg font-bold hover:bg-white hover:text-green-800 transition-all transform hover:scale-105 shadow-xl"
                            >
                                <TranslatedText>Register Equipment</TranslatedText>
                            </Link>
                            <PlayStoreButton className="bg-yellow-400 text-green-900 hover:bg-yellow-300 text-lg" />
                        </div>

                        <p className="mt-12 text-green-200 text-sm font-medium uppercase tracking-widest flex items-center justify-center space-x-3">
                            <span className="w-8 h-px bg-green-400"></span>
                            <span><TranslatedText>No Credit Card Required ? Instant Activation</TranslatedText></span>
                            <span className="w-8 h-px bg-green-400"></span>
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default CTA;
