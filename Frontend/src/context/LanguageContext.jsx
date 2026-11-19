import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { normalizeLanguageCode, isRTLLanguage } from '../utils/languageUtils';
import { getActiveLanguages, FALLBACK_LANGUAGES } from '../services/languageService';

const LanguageContext = createContext();

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) throw new Error('useLanguage must be used within LanguageProvider');
    return context;
};

export const LanguageProvider = ({ children }) => {
    // Languages map (by name for backwards compatibility)
    const [languages, setLanguages] = useState(FALLBACK_LANGUAGES);
    // Active languages list from DB/API
    const [activeLanguagesList, setActiveLanguagesList] = useState(Object.values(FALLBACK_LANGUAGES));

    // Initial language detection
    const getInitialLanguage = () => {
        const hasExplicitChoice = localStorage.getItem('userLanguageExplicit') === 'true';
        if (hasExplicitChoice) {
            return localStorage.getItem('userLanguage') || 'English';
        }
        // If not explicit, prioritize the cached system default, then stored language, then English
        return localStorage.getItem('systemDefaultLanguage') || localStorage.getItem('userLanguage') || 'English';
    };

    const [language, setLanguage] = useState(getInitialLanguage);
    const [isChangingLanguage, setIsChangingLanguage] = useState(false);
    const languageRef = useRef(language);
    languageRef.current = language;

    /**
     * Internal helper to apply a language
     */
    const applyLanguage = useCallback((matched, isExplicit = false) => {
        if (!matched) return;
        const langName = matched.name || matched.label;
        const langCode = matched.code;

        setIsChangingLanguage(true);
        setLanguage(langName);

        if (isExplicit) {
            localStorage.setItem('userLanguageExplicit', 'true');
        }
        localStorage.setItem('userLanguage', langName);
        localStorage.setItem('userLanguageCode', langCode);

        // Notify any window listeners (such as Google Maps or external scripts)
        window.dispatchEvent(new CustomEvent('agroyilt-language-changed', {
            detail: { code: langCode, name: langName, isExplicit }
        }));

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
                    map[item.name] = {
                        label: item.name,
                        name: item.name,
                        nativeName: item.nativeName || item.name,
                        code: item.code,
                        flag: item.flag || '🌐',
                        isDefault: item.isDefault,
                        isRTL: item.isRTL
                    };
                });
                setLanguages(map);

                // Identify the active system default language
                const defaultLang = list.find(l => l.isDefault) || list[0];
                const prevDefaultCode = localStorage.getItem('systemDefaultLanguageCode');

                if (defaultLang) {
                    localStorage.setItem('systemDefaultLanguage', defaultLang.name);
                    localStorage.setItem('systemDefaultLanguageCode', defaultLang.code);
                }

                const hasExplicitChoice = localStorage.getItem('userLanguageExplicit') === 'true';
                const currentSaved = localStorage.getItem('userLanguage') || languageRef.current || 'English';
                const currentSavedCode = localStorage.getItem('userLanguageCode');

                // Check if current language still exists in active list
                const exists = list.some(
                    l => l.name.toLowerCase() === currentSaved.toLowerCase() || l.code.toLowerCase() === (currentSavedCode || '').toLowerCase()
                );

                if (defaultLang) {
                    // Scenario 1: User never explicitly chose a language -> Always follow system default
                    if (!hasExplicitChoice) {
                        if (currentSaved.toLowerCase() !== defaultLang.name.toLowerCase()) {
                            applyLanguage(defaultLang, false);
                        }
                    } 
                    // Scenario 2: Admin changed default language AND user was on the old default -> Transition to new default
                    else if (prevDefaultCode && prevDefaultCode !== defaultLang.code && (currentSavedCode === prevDefaultCode || currentSaved.toLowerCase() === prevDefaultCode.toLowerCase())) {
                        applyLanguage(defaultLang, false);
                    }
                    // Scenario 3: Currently chosen language was deleted / deactivated
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
    const changeLanguage = (newLang, options = {}) => {
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
        applyLanguage(matched, isExplicit);
    };

    /**
     * Set HTML lang and dir attribute on language change
     */
    useEffect(() => {
        const code = normalizeLanguageCode(language);
        localStorage.setItem('userLanguageCode', code);
        document.documentElement.lang = code;
        document.documentElement.dir = isRTLLanguage(code) ? 'rtl' : 'ltr';
    }, [language]);

    const defaultLanguageObj = activeLanguagesList.find(l => l.isDefault) || null;

    const value = {
        language,
        languages,
        activeLanguagesList,
        defaultLanguage: defaultLanguageObj,
        changeLanguage,
        isChangingLanguage,
        currentCode: normalizeLanguageCode(language),
        refreshLanguages
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};
