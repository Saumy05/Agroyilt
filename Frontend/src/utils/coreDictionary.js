/**
 * AgroYilt Instant Core UI Dictionary
 * Provides instantaneous (0ms latency) UI translations for high-frequency
 * interface elements (navigation, buttons, common states, and agricultural terms)
 * in Hindi and key regional languages, with seamless Google Cloud Translate fallback
 * for custom or dynamic content.
 */

export const CORE_DICTIONARY = {
  hi: {
    // Navigation & Portals
    'Home': 'होम',
    'Settings': 'सेटिंग्स',
    'Profile': 'प्रोफ़ाइल',
    'Bookings': 'बुकिंग',
    'Machinery': 'मशीनरी',
    'Equipment': 'उपकरण',
    'Workers': 'श्रमिक',
    'Wallet': 'वॉलेट',
    'Support': 'सहायता',
    'Services': 'सेवाएं',
    'Notifications': 'सूचनाएं',
    'Language': 'भाषा',
    'Account': 'खाता',
    'Farmer': 'किसान',
    'Worker': 'श्रमिक',
    'Vendor': 'विक्रेता',
    'Equipment Owner': 'उपकरण मालिक',

    // Common Actions
    'Book Now': 'अभी बुक करें',
    'Select': 'चुनें',
    'Selected': 'चुना गया',
    'Active': 'सक्रिय',
    'Inactive': 'निष्क्रिय',
    'Confirm': 'पुष्टि करें',
    'Cancel': 'रद्द करें',
    'Save': 'सहेजें',
    'Submit': 'सबमिट करें',
    'Continue': 'जारी रखें',
    'Back': 'पीछे',
    'Next': 'आगे',
    'Done': 'संपन्न',
    'Edit': 'संपादित करें',
    'Delete': 'हटाएं',
    'Delete Account': 'खाता हटाएं',
    'Log Out': 'लॉग आउट',
    'Logout': 'लॉग आउट',
    'Login': 'लॉगिन',
    'Register': 'रजिस्टर करें',
    'Verify': 'सत्यापित करें',
    'Resend': 'पुनः भेजें',
    'Resend code': 'कोड पुनः भेजें',
    'Add': 'जोड़ें',
    'Remove': 'हटाएं',
    'Call': 'कॉल करें',
    'View Details': 'विवरण देखें',
    'Pay': 'भुगतान करें',
    'Pay Now': 'अभी भुगतान करें',
    'Search': 'खोजें',
    'Close': 'बंद करें',
    'Apply': 'लागू करें',

    // Statuses
    'Pending': 'लंबित',
    'Approved': 'स्वीकृत',
    'Rejected': 'अस्वीकृत',
    'Completed': 'पूर्ण',
    'In Progress': 'प्रगति पर',
    'Verified': 'सत्यापित',
    'Success': 'सफल',
    'Failed': 'असफल',
    'Cancelled': 'रद्द',

    // Form & Common Field Labels
    'Mobile Number': 'मोबाइल नंबर',
    'Phone Number': 'फ़ोन नंबर',
    'Full Name': 'पूरा नाम',
    'Name': 'नाम',
    'Email': 'ईमेल',
    'Address': 'पता',
    'City': 'शहर',
    'State': 'राज्य',
    'District': 'जिला',
    'Pincode': 'पिनकोड',
    'Date': 'तारीख',
    'Time': 'समय',
    'Price': 'मूल्य',
    'Total': 'कुल',
    'Amount': 'राशि',
    'Hourly': 'प्रति घंटा',
    'Daily': 'प्रति दिन',
    'Acre': 'एकड़',
    'Hours': 'घंटे',
    'Days': 'दिन',

    // Settings & Auth Specific
    'Sign In': 'साइन इन',
    'Sign Up': 'साइन अप',
    'Save Changes': 'परिवर्तन सहेजें',
    'Select Language': 'भाषा चुनें',
    'App Language': 'ऐप भाषा',
    'Help & Support': 'सहायता और समर्थन',
    'Dashboard': 'डैशबोर्ड',
    'Orders': 'ऑर्डर',
    'Transactions': 'लेन-देन',
    'Terms of Service': 'सेवा की शर्तें',
    'Privacy Policy': 'गोपनीयता नीति',
    'Welcome Back': 'वापसी पर स्वागत है',
    'Enter OTP': 'ओटीपी दर्ज करें',
    'Verify OTP': 'ओटीपी सत्यापित करें',
    'Push Notifications': 'पुश सूचनाएं',
    'Sound Alerts': 'ध्वनि अलर्ट',
    'Privacy & data': 'गोपनीयता और डेटा',
    'Order related messages': 'ऑर्डर संबंधी संदेश',
    'Set / Change MPIN': 'एमपिन सेट / बदलें',
    'Manage your 4-digit login pin': 'अपना 4-अंकीय लॉगिन पिन प्रबंधित करें',
    'Test Push Notifications': 'पुश सूचना का परीक्षण करें',
    'Language preference saved': 'भाषा प्राथमिकता सहेजी गई',
    'Language updated': 'भाषा अपडेट हो गई'
  }
};

/**
 * Checks if text exists in the instant core dictionary
 * @param {string} text - English text
 * @param {string} targetLang - Language code (e.g. 'hi')
 * @returns {string|null} - Translated text or null
 */
export const getFromCoreDictionary = (text, targetLang) => {
  if (!text || !targetLang || targetLang === 'en') return null;
  const dict = CORE_DICTIONARY[targetLang.toLowerCase()];
  if (!dict) return null;

  const trimmed = text.trim();
  if (dict[trimmed]) {
    // Preserve leading/trailing whitespace
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    return lead + dict[trimmed] + trail;
  }

  return null;
};
