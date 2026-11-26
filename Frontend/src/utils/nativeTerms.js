import { getScript } from './languageUtils.js';

/**
 * Translation services leave abbreviations such as OTP or UPI in English letters.
 * These tables write them in the script of the chosen language, e.g. OTP -> ओटीपी.
 */
const LETTERS = ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'Y', 'L', 'V'];

// Letter names in the order of LETTERS, then the words "PIN" and "PAN"
const SCRIPTS = {
  deva: { letters: 'ए सी डी ई एफ जी एच आई के एम एन ओ पी क्यू आर एस टी यू वाई एल वी', pin: 'पिन', pan: 'पैन' },
  beng: { letters: 'এ সি ডি ই এফ জি এইচ আই কে এম এন ও পি কিউ আর এস টি ইউ ওয়াই এল ভি', pin: 'পিন', pan: 'প্যান' },
  guru: { letters: 'ਏ ਸੀ ਡੀ ਈ ਐੱਫ ਜੀ ਐੱਚ ਆਈ ਕੇ ਐੱਮ ਐੱਨ ਓ ਪੀ ਕਿਊ ਆਰ ਐੱਸ ਟੀ ਯੂ ਵਾਈ ਐੱਲ ਵੀ', pin: 'ਪਿੰਨ', pan: 'ਪੈਨ' },
  gujr: { letters: 'એ સી ડી ઈ એફ જી એચ આઈ કે એમ એન ઓ પી ક્યૂ આર એસ ટી યુ વાય એલ વી', pin: 'પિન', pan: 'પાન' },
  orya: { letters: 'ଏ ସି ଡି ଇ ଏଫ୍ ଜି ଏଚ୍ ଆଇ କେ ଏମ୍ ଏନ୍ ଓ ପି କ୍ୟୁ ଆର୍ ଏସ୍ ଟି ୟୁ ୱାଇ ଏଲ୍ ଭି', pin: 'ପିନ୍', pan: 'ପ୍ୟାନ୍' },
  taml: { letters: 'ஏ சி டி ஈ எஃப் ஜி ஹெச் ஐ கே எம் என் ஓ பி க்யூ ஆர் எஸ் டி யூ ஒய் எல் வி', pin: 'பின்', pan: 'பான்' },
  telu: { letters: 'ఏ సి డి ఈ ఎఫ్ జి హెచ్ ఐ కె ఎం ఎన్ ఓ పి క్యూ ఆర్ ఎస్ టి యు వై ఎల్ వి', pin: 'పిన్', pan: 'పాన్' },
  knda: { letters: 'ಎ ಸಿ ಡಿ ಇ ಎಫ್ ಜಿ ಎಚ್ ಐ ಕೆ ಎಂ ಎನ್ ಒ ಪಿ ಕ್ಯೂ ಆರ್ ಎಸ್ ಟಿ ಯು ವೈ ಎಲ್ ವಿ', pin: 'ಪಿನ್', pan: 'ಪ್ಯಾನ್' },
  mlym: { letters: 'എ സി ഡി ഇ എഫ് ജി എച്ച് ഐ കെ എം എൻ ഒ പി ക്യു ആർ എസ് ടി യു വൈ എൽ വി', pin: 'പിൻ', pan: 'പാൻ' },
  arab: { letters: 'اے سی ڈی ای ایف جی ایچ آئی کے ایم این او پی کیو آر ایس ٹی یو وائی ایل وی', pin: 'پن', pan: 'پین', joiner: ' ' }
};

// Only these are rewritten, so booking numbers, IFSC values and emails stay as they are
const TERM_PATTERN = /(?<![A-Za-z0-9@._/-])(MPIN|PIN|PAN|OTP|UPI|VPA|IFSC|NEFT|RTGS|IMPS|FAQ|KYC|GST|PDF|SMS|GPS|API|APMC|SSL|AI|QR|HP|ID)(?![A-Za-z0-9@_/]|\.[A-Za-z])/g;
// Horsepower is usually written against the number, as in 45HP
const HORSEPOWER_PATTERN = /(?<=\d)HP(?![A-Za-z0-9])/g;

export const usesDevanagari = (code) => getScript(code) === 'Deva';

export const localizeTerms = (text, code) => {
  const script = SCRIPTS[getScript(code)?.toLowerCase()];
  if (!script || !text) return text;
  const names = script.letters.split(' ');
  const spell = (word) => word.split('').map((l) => names[LETTERS.indexOf(l)]).join(script.joiner || '');
  return text.replace(HORSEPOWER_PATTERN, () => spell('HP')).replace(TERM_PATTERN, (term) => {
    if (term === 'PIN') return script.pin;
    if (term === 'PAN') return script.pan;
    if (term === 'MPIN') return `${names[LETTERS.indexOf('M')]}${script.joiner || ''}${script.pin}`;
    return spell(term);
  });
};
