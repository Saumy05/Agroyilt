import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { normalizeLanguageCode, isRTLLanguage } from '../utils/languageUtils';
import { saveLanguagePreference } from '../services/languagePreferenceService';
import { getActiveLanguages, FALLBACK_LANGUAGES } from '../services/languageService';
import authStorage from '../utils/authStorage';

const LanguageContext = createContext();

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) throw new Error('useLanguage must be used within LanguageProvider');
    return context;
};

export const LanguageProvider = ({ children }) => {
    // Languages map (by name and code for backwards compatibility)
    const [languages, setLanguages] = useState(FALLBACK_LANGUAGES);
    // Active languages list from DB/API
    const [activeLanguagesList, setActiveLanguagesList] = useState(Object.values(FALLBACK_LANGUAGES));

    // Initial language detection
    const getInitialLanguage = () => {
        if (typeof window === 'undefined') return 'English';
        const hasExplicitChoice = localStorage.getItem('userLanguageExplicit') === 'true';
        if (hasExplicitChoice) {
            return localStorage.getItem('userLanguage') || 'English';
        }
        // Check if an authenticated user profile has a saved preference
        try {
            const role = authStorage.getCurrentPortalRole();
            const session = authStorage.getAuthSession(role);
            const userLang = session?.user?.settings?.language || session?.user?.language;
            if (userLang) return userLang;
        } catch (e) {}
        return localStorage.getItem('systemDefaultLanguage') || localStorage.getItem('userLanguage') || 'English';
    };

    const [language, setLanguage] = useState(getInitialLanguage);
    const [isChangingLanguage, setIsChangingLanguage] = useState(false);
    const languageRef = useRef(language);
    languageRef.current = language;

    // The code comes from the admin's language list, so any language added there works.
    // Until the list loads, use the code saved with the last choice.
    const currentCode = useMemo(() => {
        const listed = languages[language]?.code;
        if (listed) return normalizeLanguageCode(listed);
        const saved = typeof localStorage !== 'undefined' && localStorage.getItem('userLanguage') === language
            ? localStorage.getItem('userLanguageCode')
            : null;
        return normalizeLanguageCode(saved || language);
    }, [language, languages]);
    const currentCodeRef = useRef(currentCode);
    currentCodeRef.current = currentCode;

    /**
     * Internal helper to apply a language
     */
    const applyLanguage = useCallback((matched, isExplicit = false) => {
        if (!matched) return;
        const langName = matched.name || matched.label;
        const langCode = matched.code || normalizeLanguageCode(langName);

        setIsChangingLanguage(true);
        setLanguage(langName);

        if (typeof window !== 'undefined') {
            if (isExplicit) {
                localStorage.setItem('userLanguageExplicit', 'true');
            }
            localStorage.setItem('userLanguage', langName);
            localStorage.setItem('userLanguageCode', langCode);

            // Update document language & direction
            document.documentElement.lang = langCode;
            document.documentElement.dir = matched.isRTL || isRTLLanguage(langCode) ? 'rtl' : 'ltr';

            // Notify external listeners (Google Maps, flutterBridge, etc.)
            window.dispatchEvent(new CustomEvent('agroyilt-language-changed', {
                detail: { code: langCode, name: langName, isExplicit }
            }));
        }

        setTimeout(() => setIsChangingLanguage(false), 200);
    }, []);

    /**
     * Fetch active languages from backend and apply system default
     */
    const refreshLanguages = useCallback(async () => {
        try {
            const list = await getActiveLanguages();
            if (Array.isArray(list) && list.length > 0) {
                setActiveLanguagesList(list);
                const map = {};
                list.forEach(item => {
                    const langObj = {
                        label: item.name,
                        name: item.name,
                        nativeName: item.nativeName || item.name,
                        code: item.code,
                        flag: item.flag || '🌐',
                        isDefault: item.isDefault,
                        isRTL: item.isRTL
                    };
                    map[item.name] = langObj;
                    map[item.code] = langObj; // Also map by code
                });
                setLanguages(map);

                // Identify the active system default language
                const defaultLang = list.find(l => l.isDefault) || list[0];
                const prevDefaultCode = typeof localStorage !== 'undefined' ? localStorage.getItem('systemDefaultLanguageCode') : null;

                if (defaultLang && typeof localStorage !== 'undefined') {
                    localStorage.setItem('systemDefaultLanguage', defaultLang.name);
                    localStorage.setItem('systemDefaultLanguageCode', defaultLang.code);
                }

                const hasExplicitChoice = typeof localStorage !== 'undefined' && localStorage.getItem('userLanguageExplicit') === 'true';
                const currentSaved = (typeof localStorage !== 'undefined' ? localStorage.getItem('userLanguage') : null) || languageRef.current || 'English';
                const currentSavedCode = typeof localStorage !== 'undefined' ? localStorage.getItem('userLanguageCode') : null;

                // Check if current language still exists in active list
                const exists = list.some(
                    l => l.name.toLowerCase() === currentSaved.toLowerCase() || l.code.toLowerCase() === (currentSavedCode || '').toLowerCase()
                );

                if (defaultLang) {
                    // Scenario 1: User never explicitly chose a language -> Always follow system default
                    if (!hasExplicitChoice) {
                        if (currentSaved.toLowerCase() !== defaultLang.name.toLowerCase() && currentSavedCode !== defaultLang.code) {
                            applyLanguage(defaultLang, false);
                        }
                    } 
                    // Scenario 2: User explicitly chose a language, but that language was deleted / deactivated by admin
                    else if (!exists) {
                        applyLanguage(defaultLang, false);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to refresh active languages:', err);
        }
    }, [applyLanguage]);

    useEffect(() => {
        refreshLanguages();
    }, [refreshLanguages]);

    /**
     * Change Current Language (accepts either name like 'Hindi' or code like 'hi')
     * @param {string} newLang
     * @param {object|boolean} options - { isExplicit: true/false } or boolean for isExplicit
     */
    const changeLanguage = useCallback((newLang, options = {}) => {
        if (!newLang) return;

        const isExplicit = typeof options === 'boolean' ? options : (options?.isExplicit ?? true);

        let matched = null;
        if (languages[newLang]) {
            matched = languages[newLang];
        } else {
            const list = activeLanguagesList.length > 0 ? activeLanguagesList : Object.values(languages);
            matched = list.find(
                l => l.code?.toLowerCase() === newLang.toLowerCase() || l.name?.toLowerCase() === newLang.toLowerCase()
            );
        }

        if (!matched) return;
        const isNewChoice = isExplicit && normalizeLanguageCode(matched.code || matched.name) !== currentCodeRef.current;
        applyLanguage(matched, isExplicit);
        if (isNewChoice) saveLanguagePreference(matched.code || normalizeLanguageCode(matched.name));
    }, [languages, activeLanguagesList, applyLanguage]);

    /**
     * Synchronize language preference from an authenticated user/worker/vendor profile
     */
    const syncProfileLanguage = useCallback((profileLangCode) => {
        if (!profileLangCode) return;
        changeLanguage(profileLangCode, { isExplicit: true });
    }, [changeLanguage]);

    /**
     * Listen for external sync events (e.g. login, profile updates)
     */
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleSyncEvent = (e) => {
            if (e?.detail?.language) {
                changeLanguage(e.detail.language, { isExplicit: true });
            }
        };
        window.addEventListener('agroyilt-sync-language', handleSyncEvent);
        return () => window.removeEventListener('agroyilt-sync-language', handleSyncEvent);
    }, [changeLanguage]);

    /**
     * Set HTML lang and dir attribute on language change
     */
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.lang = currentCode;
            document.documentElement.dir = languages[language]?.isRTL || isRTLLanguage(currentCode) ? 'rtl' : 'ltr';
        }
        if (typeof localStorage !== 'undefined' && currentCode) {
            if (!localStorage.getItem('userLanguageCode')) {
                localStorage.setItem('userLanguageCode', currentCode);
            }
        }
    }, [currentCode, language, languages]);

    const defaultLanguageObj = activeLanguagesList.find(l => l.isDefault) || null;
    const currentLangObj = activeLanguagesList.find(l => l.code === currentCode || l.name === language) || {
        name: language,
        code: currentCode,
        nativeName: language,
        flag: '🌐'
    };

    const value = {
        language,
        languages,
        currentLang: currentLangObj,
        activeLanguagesList,
        defaultLanguage: defaultLanguageObj,
        changeLanguage,
        syncProfileLanguage,
        isChangingLanguage,
        currentCode,
        refreshLanguages
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};
