import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
    // Current Language State (Default English)
    const [language, setLanguage] = useState(localStorage.getItem('userLanguage') || 'English');
    const [isChangingLanguage, setIsChangingLanguage] = useState(false);

    /**
     * Fetch active languages from backend
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

                // If currently selected language is not in active list, fallback to default
                const currentSaved = localStorage.getItem('userLanguage') || 'English';
                const exists = list.some(
                    l => l.name.toLowerCase() === currentSaved.toLowerCase() || l.code.toLowerCase() === currentSaved.toLowerCase()
                );
                if (!exists) {
                    const defaultLang = list.find(l => l.isDefault) || list[0];
                    if (defaultLang) {
                        setLanguage(defaultLang.name);
                        localStorage.setItem('userLanguage', defaultLang.name);
                        localStorage.setItem('userLanguageCode', defaultLang.code);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to refresh active languages:', err);
        }
    }, []);

    useEffect(() => {
        refreshLanguages();
    }, [refreshLanguages]);

    /**
     * Change Current Language (accepts either name like 'Hindi' or code like 'hi')
     */
    const changeLanguage = (newLang) => {
        if (!newLang) return;

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

        const langName = matched.name || matched.label;
        const langCode = matched.code;

        setIsChangingLanguage(true);
        setLanguage(langName);
        localStorage.setItem('userLanguage', langName);
        localStorage.setItem('userLanguageCode', langCode);

        // Notify any window listeners (such as Google Maps or external scripts)
        window.dispatchEvent(new CustomEvent('agroyilt-language-changed', {
            detail: { code: langCode, name: langName }
        }));

        setTimeout(() => setIsChangingLanguage(false), 200);
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

    const value = {
        language,
        languages,
        activeLanguagesList,
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
