import React from 'react';
import { FaFacebook, FaTwitter, FaInstagram, FaLinkedin } from 'react-icons/fa';
import Logo from '../../../components/common/Logo';

const Footer = () => {
    return (
        <footer className="bg-gray-950 text-gray-400 py-20 border-t border-gray-900">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
                    {/* Brand Section */}
                    <div className="space-y-6">
                        <div className="mb-4">
                            <Logo className="h-12 w-auto brightness-0 invert" />
                        </div>
                        <p className="text-yellow-500 font-black tracking-widest text-[10px] uppercase mt-2 mb-4">
                            By Chinmay Anand
                        </p>
                        <p className="leading-relaxed text-sm">
                            AgriTech Platform for On-Demand Farm Machinery & Smart Agriculture.
                            <strong>GLOBAL RURAL OUTREACH ORGANISATION LLP</strong>. Smart farming for a smarter future.
                        </p>
                        <div className="flex space-x-5">
                            <a href="https://www.facebook.com/share/1YgEfFD8jW/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors"><FaFacebook size={24} /></a>
                            <a href="https://www.instagram.com/agroyilt?igsh=MWticXBlbHR4YnVjMQ==" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors"><FaInstagram size={24} /></a>
                            <a href="https://www.linkedin.com/in/global-rural-outreach-organisation-llp-groo-4923873b8/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors"><FaLinkedin size={24} /></a>
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="text-white font-bold text-lg mb-6">Explore AgroYilt</h4>
                        <ul className="space-y-4 text-sm">
                            <li><a href="/user/machinery-explorer" className="hover:text-yellow-500 transition-colors">Rent Equipment</a></li>
                            <li><a href="/blogs" className="hover:text-yellow-500 transition-colors">Latest Agriculture News</a></li>
                            <li><a href="/#workflow" className="hover:text-yellow-500 transition-colors">How to Book</a></li>
                            <li><a href="/vendor/login" className="hover:text-yellow-500 transition-colors">Owner Dashboard</a></li>
                            <li><a href="/worker/login" className="hover:text-yellow-500 transition-colors">Worker Portal</a></li>
                        </ul>
                    </div>

                    {/* Support & Contact */}
                    <div>
                        <h4 className="text-white font-bold text-lg mb-6">Contact Support</h4>
                        <ul className="space-y-4 text-sm">
                            <li className="flex items-center space-x-3">
                                <span className="text-green-600">📍</span>
                                <span>gulni kushaha Banka bihar 813211</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <span className="text-green-600">📞</span>
                                <div>
                                    <p className="font-bold">+91 91177 04450</p>
                                </div>
                            </li>
                            <li className="flex items-center space-x-3">
                                <span className="text-green-600">📧</span>
                                <span>agroyilt@gmail.com</span>
                            </li>
                            <li>
                                <a
                                    href="/terms"
                                    className="hover:text-yellow-500 transition-colors underline decoration-gray-800 underline-offset-4"
                                >
                                    Privacy & Terms
                                </a>
                            </li>
                        </ul>
                    </div>

                    {/* Newsletter */}
                    <div>
                        <h4 className="text-white font-bold text-lg mb-6">Stay Updated</h4>
                        <p className="text-sm mb-6">Get the latest harvest season offers and new machine alerts.</p>
                        <form className="flex" onSubmit={(e) => e.preventDefault()}>
                            <input 
                                type="email" 
                                placeholder="Your email" 
                                className="bg-gray-900 border border-gray-800 rounded-l-lg px-4 py-3 text-sm focus:outline-none focus:border-green-600 w-full"
                            />
                            <button className="bg-green-700 text-white px-4 py-3 rounded-r-lg hover:bg-green-800 transition-colors font-bold text-xs uppercase tracking-widest">
                                Subscribe
                            </button>
                        </form>
                    </div>
                </div>

                <div className="pt-8 border-t border-gray-900 text-center text-xs uppercase tracking-widest font-medium">
                    <p>&copy; {new Date().getFullYear()} AgroYilt Technologies. Building the future of farming.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
