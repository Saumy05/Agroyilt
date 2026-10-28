import React from 'react';
import { FaFacebook, FaTwitter, FaInstagram, FaLinkedin } from 'react-icons/fa';
import Logo from '../../../components/common/Logo';

const Footer = () => {
    return (
        <footer className="bg-gray-950 text-gray-400 py-10 sm:py-16 md:py-20 border-t border-gray-900">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 md:gap-12 mb-10 sm:mb-16">
                    {/* Brand Section */}
                    <div className="space-y-4 sm:space-y-6">
                        <div className="mb-2 sm:mb-4">
                            <Logo className="h-9 sm:h-12 w-auto brightness-0 invert" />
                        </div>
                        <p className="text-yellow-500 font-black tracking-widest text-[10px] uppercase mt-1 sm:mt-2 mb-2 sm:mb-4">
                            By Chinmay Anand
                        </p>
                        <p className="leading-relaxed text-xs sm:text-sm">
                            AgriTech Platform for On-Demand Farm Machinery & Smart Agriculture.
                            <strong className="text-gray-300"> GLOBAL RURAL OUTREACH ORGANISATION LLP</strong>. Smart farming for a smarter future.
                        </p>
                        <div className="flex space-x-4 sm:space-x-5 pt-1">
                            <a href="https://www.facebook.com/share/1YgEfFD8jW/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors"><FaFacebook size={20} className="sm:text-[24px]" /></a>
                            <a href="https://www.instagram.com/agroyilt?igsh=MWticXBlbHR4YnVjMQ==" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors"><FaInstagram size={20} className="sm:text-[24px]" /></a>
                            <a href="https://www.linkedin.com/in/global-rural-outreach-organisation-llp-groo-4923873b8/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors"><FaLinkedin size={20} className="sm:text-[24px]" /></a>
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="text-white font-bold text-base sm:text-lg mb-3 sm:mb-6">Explore AgroYilt</h4>
                        <ul className="space-y-2.5 sm:space-y-4 text-xs sm:text-sm">
                            <li><a href="/user/machinery-explorer" className="hover:text-yellow-500 transition-colors">Rent Equipment</a></li>
                            <li><a href="/blogs" className="hover:text-yellow-500 transition-colors">Latest Agriculture News</a></li>
                            <li><a href="/#workflow" className="hover:text-yellow-500 transition-colors">How to Book</a></li>
                            <li><a href="/vendor/login" className="hover:text-yellow-500 transition-colors">Owner Dashboard</a></li>
                            <li><a href="/worker/login" className="hover:text-yellow-500 transition-colors">Worker Portal</a></li>
                        </ul>
                    </div>

                    {/* Support & Contact */}
                    <div>
                        <h4 className="text-white font-bold text-base sm:text-lg mb-3 sm:mb-6">Contact Support</h4>
                        <ul className="space-y-2.5 sm:space-y-4 text-xs sm:text-sm">
                            <li className="flex items-start sm:items-center space-x-2.5 sm:space-x-3">
                                <span className="text-green-500 text-sm mt-0.5 sm:mt-0">📍</span>
                                <span>gulni kushaha Banka bihar 813211</span>
                            </li>
                            <li className="flex items-center space-x-2.5 sm:space-x-3">
                                <span className="text-green-500 text-sm">📞</span>
                                <div>
                                    <p className="font-bold text-gray-300">+91 91177 04450</p>
                                </div>
                            </li>
                            <li className="flex items-center space-x-2.5 sm:space-x-3">
                                <span className="text-green-500 text-sm">📧</span>
                                <span className="text-gray-300">agroyilt@gmail.com</span>
                            </li>
                            <li className="pt-1">
                                <a
                                    href="/terms"
                                    className="hover:text-yellow-500 transition-colors underline decoration-gray-800 underline-offset-4 mr-3"
                                >
                                    Terms & Conditions
                                </a>
                                <a
                                    href="/privacy"
                                    className="hover:text-yellow-500 transition-colors underline decoration-gray-800 underline-offset-4"
                                >
                                    Privacy Policy
                                </a>
                            </li>
                        </ul>
                    </div>

                    {/* Newsletter */}
                    <div>
                        <h4 className="text-white font-bold text-base sm:text-lg mb-3 sm:mb-6">Stay Updated</h4>
                        <p className="text-xs sm:text-sm mb-3 sm:mb-6 leading-relaxed">Get the latest harvest season offers and new machine alerts.</p>
                        <form className="flex" onSubmit={(e) => e.preventDefault()}>
                            <input 
                                type="email" 
                                placeholder="Your email" 
                                className="bg-gray-900 border border-gray-800 rounded-l-lg px-3.5 py-2.5 sm:py-3 text-xs sm:text-sm focus:outline-none focus:border-green-600 w-full"
                            />
                            <button className="bg-green-700 text-white px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-r-lg hover:bg-green-800 transition-colors font-bold text-[10px] sm:text-xs uppercase tracking-widest shrink-0">
                                Subscribe
                            </button>
                        </form>
                    </div>
                </div>

                <div className="pt-6 sm:pt-8 border-t border-gray-900 text-center text-[10px] sm:text-xs uppercase tracking-widest font-medium text-gray-500">
                    <p>&copy; {new Date().getFullYear()} AgroYilt Technologies. Building the future of farming.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
