'use strict';

/**
 * The built-in agreement wording (used until the admin writes their own). It is a sensible starting point, NOT legal
 * advice: the admin should have it reviewed by a lawyer and edit it under Admin > Agreements > Templates.
 */

const AgreementTemplate = require('../models/AgreementTemplate');

// ── clauses ────────────────────────────────────────────────────────────────────────────────────
// Common to both lease types, in English and Hindi (kept in the same order so the two read alike).
const EN_SHARED_A = [
  'The tenant shall use the land only for growing crops. The tenant shall not sub-lease it, hand it over, or let anyone else cultivate it, and shall not use it for any other purpose or put up any permanent construction on it, without the landowner\'s written consent.',
  'The tenant shall take care of the land, keep the field bunds and boundary marks intact, and shall not dig, level the land, cut trees, or remove soil, sand or stone from it without the landowner\'s consent.',
  'The landowner declares that he or she is the owner or lawful holder of this land, and that the land is free of any court case, mortgage, attachment, or other lease for the period of this agreement. The landowner shall let the tenant use the land peacefully, with its water source and the path to the field, for the whole term.',
  'Land revenue and taxes on the land remain the landowner\'s responsibility unless both parties agree otherwise in writing.'
];
const HI_SHARED_A = [
  'काश्तकार भूमि का उपयोग केवल फसल उगाने के लिए करेगा। भूमि स्वामी की लिखित सहमति के बिना वह भूमि को आगे किराए पर नहीं देगा, किसी को सौंपेगा नहीं, किसी और से खेती नहीं कराएगा, उसे किसी अन्य काम में नहीं लेगा और उस पर कोई पक्का निर्माण नहीं करेगा।',
  'काश्तकार भूमि की देखभाल करेगा, खेत की मेड़ और सीमा-चिह्न सुरक्षित रखेगा, और भूमि स्वामी की सहमति के बिना खुदाई, भूमि का समतलीकरण, पेड़ों की कटाई, या मिट्टी, रेत, पत्थर निकालने का काम नहीं करेगा।',
  'भूमि स्वामी घोषणा करता है कि वह इस भूमि का मालिक या वैध धारक है, और इस अनुबंध की अवधि में भूमि पर कोई मुकदमा, बंधक, कुर्की या अन्य पट्टा नहीं है। भूमि स्वामी पूरी अवधि में काश्तकार को जल स्रोत और खेत तक रास्ते सहित भूमि का शांतिपूर्ण उपयोग करने देगा।',
  'भूमि का राजस्व और कर भूमि स्वामी की जिम्मेदारी रहेंगे, जब तक दोनों पक्ष लिखित में कुछ और तय न करें।'
];

const EN_SHARED_B = [
  'If the tenant breaks clause 1 or clause 2 above, the landowner may give written notice through the app. If the tenant does not put it right within 15 days, the landowner may end the lease.',
  'The tenant may leave before the end of the term by giving 30 days\' notice through the app. Rent (or the crop share) stays payable up to the end of the notice period.',
  'At the end of the term the tenant shall hand the land back in the condition in which it was received. A crop that the tenant sowed during the term and that is still standing may be harvested by the tenant within 30 days after the term ends, and the landowner\'s rent or share for it stays payable on the same terms.',
  'This agreement lets the tenant use the land for the term only. It does not transfer ownership of the land or create any permanent right in it, as far as the law allows.',
  'Payments are made through the AgroYilt app so that both parties have a record. Money paid outside the app is not recorded by AgroYilt, and AgroYilt cannot confirm it.',
  'Notices under this agreement are given through the AgroYilt app and to the registered mobile numbers shown above, and are treated as received when sent. Any change to this agreement is valid only if both parties sign a new agreement in the same way.',
  'Any dispute shall first be tried to be settled by talking, with the help of the village panchayat or AgroYilt support. If that fails, the courts of the district where the land lies have jurisdiction. This agreement is governed by the laws of India.',
  'Both parties agree that accepting this agreement electronically, by signing with their registered name and the one-time password sent to their registered mobile number, is their signature. Each party confirms that the name and mobile number shown are their own.',
  'Under the Registration Act, 1908, a lease for more than one year, or from year to year, or with a yearly rent, must be registered, and stamp duty is payable under the stamp law of the state. Where the law requires it, the parties shall register this lease together at the sub-registrar\'s office. An unregistered document may not be accepted by a court as proof of such a lease. AgroYilt is not a party to this agreement and does not give legal advice.'
];
const HI_SHARED_B = [
  'यदि काश्तकार ऊपर के खंड 1 या खंड 2 का उल्लंघन करता है, तो भूमि स्वामी ऐप के माध्यम से लिखित नोटिस दे सकता है। यदि काश्तकार 15 दिन में उसे ठीक नहीं करता, तो भूमि स्वामी पट्टा समाप्त कर सकता है।',
  'काश्तकार ऐप के माध्यम से 30 दिन का नोटिस देकर अवधि पूरी होने से पहले भूमि छोड़ सकता है। नोटिस अवधि के अंत तक किराया (या फसल का हिस्सा) देय रहेगा।',
  'अवधि पूरी होने पर काश्तकार भूमि उसी स्थिति में लौटाएगा जिसमें उसे मिली थी। अवधि में काश्तकार द्वारा बोई गई जो फसल अवधि पूरी होने पर भी खड़ी हो, उसे वह अवधि समाप्त होने के 30 दिन के भीतर काट सकता है, और उस पर भूमि स्वामी का किराया या हिस्सा उन्हीं शर्तों पर देय रहेगा।',
  'यह अनुबंध काश्तकार को केवल अवधि भर भूमि के उपयोग का अधिकार देता है। कानून की सीमा में, यह भूमि का स्वामित्व नहीं बदलता और उसमें कोई स्थायी अधिकार नहीं बनाता।',
  'भुगतान AgroYilt ऐप के माध्यम से किए जाएंगे ताकि दोनों पक्षों के पास रिकॉर्ड रहे। ऐप के बाहर दिया गया पैसा AgroYilt में दर्ज नहीं होता और AgroYilt उसकी पुष्टि नहीं कर सकता।',
  'इस अनुबंध के नोटिस AgroYilt ऐप के माध्यम से और ऊपर दिए पंजीकृत मोबाइल नंबरों पर दिए जाएंगे, और भेजने पर प्राप्त माने जाएंगे। इस अनुबंध में कोई भी बदलाव तभी मान्य होगा जब दोनों पक्ष इसी तरह नए अनुबंध पर हस्ताक्षर करें।',
  'कोई भी विवाद पहले आपसी बातचीत, ग्राम पंचायत या AgroYilt सहायता की मदद से सुलझाने का प्रयास किया जाएगा। न सुलझने पर भूमि जिस जिले में है वहाँ के न्यायालयों का क्षेत्राधिकार होगा। यह अनुबंध भारत के कानूनों के अधीन है।',
  'दोनों पक्ष मानते हैं कि अपने पंजीकृत नाम और पंजीकृत मोबाइल पर आए OTP से इस अनुबंध को इलेक्ट्रॉनिक रूप से स्वीकार करना ही उनका हस्ताक्षर है। हर पक्ष पुष्टि करता है कि यहाँ दिया गया नाम और मोबाइल नंबर उसी का है।',
  'पंजीकरण अधिनियम, 1908 के अनुसार एक वर्ष से अधिक के, या साल-दर-साल के, या वार्षिक किराए वाले पट्टे का पंजीकरण अनिवार्य है, और राज्य के स्टांप कानून के अनुसार स्टांप शुल्क देय है। जहाँ कानून आवश्यक करे, वहाँ दोनों पक्ष मिलकर उप-पंजीयक कार्यालय में यह पट्टा पंजीकृत कराएंगे। बिना पंजीकरण का दस्तावेज़ ऐसे पट्टे के प्रमाण के रूप में न्यायालय में मान्य न भी हो सकता है। AgroYilt इस अनुबंध का पक्ष नहीं है और कानूनी सलाह नहीं देता।'
];

// fixed rent: who pays what, what happens to a crop that fails, and when unpaid rent ends the lease
const EN_FIXED = [
  ...EN_SHARED_A,
  'The tenant bears the cost of seed, fertiliser, pesticide, irrigation, labour and any other expense of growing the crop.',
  'Any compensation or crop-insurance money for loss of the tenant\'s crop belongs to the tenant. The rent is payable even if the crop is damaged, unless both parties agree otherwise in writing.',
  'If the rent for two installments in a row is not paid, even after reminders, the landowner may end the lease by giving 15 days\' notice.',
  ...EN_SHARED_B
];
const HI_FIXED = [
  ...HI_SHARED_A,
  'बीज, खाद, कीटनाशक, सिंचाई, मज़दूरी और फसल उगाने का अन्य सारा खर्च काश्तकार उठाएगा।',
  'काश्तकार की फसल के नुकसान पर मिलने वाला कोई भी मुआवज़ा या फसल बीमा का पैसा काश्तकार का होगा। फसल खराब होने पर भी किराया देय रहेगा, जब तक दोनों पक्ष लिखित में कुछ और तय न करें।',
  'यदि याद दिलाने के बाद भी लगातार दो किस्तों का किराया नहीं दिया जाता, तो भूमि स्वामी 15 दिन का नोटिस देकर पट्टा समाप्त कर सकता है।',
  ...HI_SHARED_B
];
// batai: shared costs, shared crop loss relief, and an honest harvest declaration
const EN_BATAI = [
  ...EN_SHARED_A,
  'The cost of seed, fertiliser, pesticide, irrigation and labour is shared between the parties in the same ratio as their share of the crop, unless they agree otherwise in writing.',
  'The tenant shall grow the crops stated above, or other crops agreed with the landowner, and shall look after the crop properly. The landowner may visit the field at reasonable times to see the crop.',
  'Any compensation or crop-insurance money paid for loss of the crop is shared between the parties in the same ratio as the crop.',
  'The tenant shall state the true value of every harvest in the app. The tenant shall not sell the crop and keep the landowner\'s share. If the tenant does not declare the harvest and pay the landowner\'s share within 30 days of the harvest, the landowner may end the lease by giving 15 days\' notice.',
  ...EN_SHARED_B
];
const HI_BATAI = [
  ...HI_SHARED_A,
  'बीज, खाद, कीटनाशक, सिंचाई और मज़दूरी का खर्च दोनों पक्ष फसल में अपने हिस्से के अनुपात में उठाएंगे, जब तक वे लिखित में कुछ और तय न करें।',
  'काश्तकार ऊपर बताई गई फसलें, या भूमि स्वामी की सहमति से अन्य फसलें उगाएगा और फसल की ठीक से देखभाल करेगा। भूमि स्वामी उचित समय पर खेत देखने जा सकता है।',
  'फसल के नुकसान पर मिलने वाला कोई भी मुआवज़ा या फसल बीमा का पैसा दोनों पक्षों में फसल के हिस्से के अनुपात में बँटेगा।',
  'काश्तकार हर फसल की सही कीमत ऐप में दर्ज करेगा। वह फसल बेचकर भूमि स्वामी का हिस्सा नहीं रखेगा। यदि फसल कटने के 30 दिन के भीतर काश्तकार फसल घोषित कर भूमि स्वामी का हिस्सा नहीं देता, तो भूमि स्वामी 15 दिन का नोटिस देकर पट्टा समाप्त कर सकता है।',
  ...HI_SHARED_B
];

// ── sections ───────────────────────────────────────────────────────────────────────────────────
const EN_LAND = `## 1. The land
Khasra / Khata No.: {{khasra_no}}
Location: {{land_location}}
Area: {{land_area}}

The land is identified by the khasra number above and by its place on the map (latitude and longitude), shown below. This place forms part of this agreement, and both parties have seen it before signing.

{{boundary_table}}

{{boundary_map}}`;

const HI_LAND = `## 1. भूमि का विवरण
खसरा / खाता संख्या: {{khasra_no}}
स्थान: {{land_location}}
क्षेत्रफल: {{land_area}}

भूमि की पहचान ऊपर दी गई खसरा संख्या और नीचे दिखाए गए नक्शे पर उसके स्थान (अक्षांश और देशांतर) से की गई है। यह स्थान इस अनुबंध का हिस्सा है, और दोनों पक्षों ने हस्ताक्षर से पहले इसे देख लिया है।

{{boundary_table}}

{{boundary_map}}`;

const EN_HEAD = (title) => `# ${title}

**Agreement No.:** {{agreement_id}}
**Date:** {{agreement_date}}

This agreement is made through the AgroYilt app between:

**Landowner (Lessor):** {{landowner_name}}, mobile {{landowner_mobile}}
**Farmer (Lessee / Tenant):** {{farmer_name}}, mobile {{farmer_mobile}}`;

const HI_HEAD = (title) => `# ${title}

**अनुबंध क्रमांक:** {{agreement_id}}
**दिनांक:** {{agreement_date}}

यह अनुबंध AgroYilt ऐप के माध्यम से निम्न दोनों पक्षों के बीच किया गया है:

**भूमि स्वामी (पट्टादाता):** {{landowner_name}}, मोबाइल {{landowner_mobile}}
**किसान (पट्टाधारक / काश्तकार):** {{farmer_name}}, मोबाइल {{farmer_mobile}}`;

const EN_TERM = `## 2. Term and possession
The lease is for {{duration}}. It starts on {{start_rule}}. The landowner hands over possession of the land on the starting date, and the lease ends when the term is over.`;
const HI_TERM = `## 2. अवधि और कब्ज़ा
पट्टे की अवधि {{duration}} है। पट्टा {{start_rule}} प्रारंभ होगा। भूमि स्वामी प्रारंभ की तारीख को भूमि का कब्ज़ा सौंपेगा, और अवधि पूरी होने पर पट्टा समाप्त हो जाएगा।`;

const EN_SIGN = `## 5. Signatures
Both parties have read and understood this whole agreement and sign it digitally with their registered name and the one-time password sent to their registered mobile number.`;
const HI_SIGN = `## 5. हस्ताक्षर
दोनों पक्षों ने यह पूरा अनुबंध पढ़ और समझ लिया है और अपने पंजीकृत नाम तथा पंजीकृत मोबाइल पर आए OTP से इस पर डिजिटल हस्ताक्षर कर रहे हैं।`;

const DEFAULTS = [
  {
    type: 'FIXED_RENT', language: 'en', title: 'Land Lease Agreement (Fixed Rent)', standardClauses: EN_FIXED,
    content: `${EN_HEAD('LAND LEASE AGREEMENT (FIXED RENT)')}

${EN_LAND}

${EN_TERM}

## 3. Rent and payment
Rent: {{rent_amount}}. Total rent for the term: {{total_rent}}.
{{payment_terms}}

## 4. Terms and conditions
The tenant plans to grow: {{crops}}.
{{standard_clauses}}

${EN_SIGN}`
  },
  {
    type: 'FIXED_RENT', language: 'hi', title: 'भूमि पट्टा अनुबंध (निश्चित किराया)', standardClauses: HI_FIXED,
    content: `${HI_HEAD('भूमि पट्टा अनुबंध (निश्चित किराया)')}

${HI_LAND}

${HI_TERM}

## 3. किराया और भुगतान
किराया: {{rent_amount}}। पूरी अवधि का कुल किराया: {{total_rent}}।
{{payment_terms}}

## 4. शर्तें
काश्तकार इन फसलों की खेती करना चाहता है: {{crops}}।
{{standard_clauses}}

${HI_SIGN}`
  },
  {
    type: 'BATAI_CROP_SHARE', language: 'en', title: 'Land Lease Agreement (Batai / Crop Share)', standardClauses: EN_BATAI,
    content: `${EN_HEAD('LAND LEASE AGREEMENT (BATAI / CROP SHARE)')}

${EN_LAND}

${EN_TERM}

## 3. Sharing of the crop
The landowner's share is {{share_percentage}}% and the tenant's share is {{tenant_share_percentage}}% of the value of the crop. Crops: {{crops}}.
{{payment_terms}}

## 4. Terms and conditions
{{standard_clauses}}

${EN_SIGN}`
  },
  {
    type: 'BATAI_CROP_SHARE', language: 'hi', title: 'भूमि पट्टा अनुबंध (बटाई / फसल बँटवारा)', standardClauses: HI_BATAI,
    content: `${HI_HEAD('भूमि पट्टा अनुबंध (बटाई / फसल बँटवारा)')}

${HI_LAND}

${HI_TERM}

## 3. फसल का बँटवारा (बटाई)
फसल की कीमत में भूमि स्वामी का हिस्सा {{share_percentage}}% और काश्तकार का हिस्सा {{tenant_share_percentage}}% होगा। फसलें: {{crops}}।
{{payment_terms}}

## 4. शर्तें
{{standard_clauses}}

${HI_SIGN}`
  }
];

/**
 * The active template for a type + language. If the admin has none yet, the built-in one is saved and used, so making
 * an agreement never fails for lack of a template.
 */
const getActiveTemplate = async (type, language) => {
  let template = await AgreementTemplate.findOne({ type, language, isActive: true });
  if (template) return template;
  const fallback = DEFAULTS.find(d => d.type === type && d.language === language);
  if (!fallback) return null;
  try {
    template = await AgreementTemplate.create({ ...fallback, isActive: true, version: 1 });
  } catch (err) {
    if (err && err.code === 11000) return AgreementTemplate.findOne({ type, language, isActive: true }); // another request seeded it first
    throw err;
  }
  return template;
};

/**
 * Makes sure the built-in wording is saved (and active) wherever the admin has not activated their own, so the
 * Templates screen is never empty. Safe to run again.
 */
const ensureDefaultTemplates = async () => {
  for (const d of DEFAULTS) {
    const t = await getActiveTemplate(d.type, d.language);
    // A built-in that nobody has edited is brought up to the current wording (the admin's own edits are never touched).
    // Agreements already made keep the text they were made from.
    if (t && !t.createdBy && !t.updatedBy && (t.content !== d.content || JSON.stringify(t.standardClauses) !== JSON.stringify(d.standardClauses))) {
      t.content = d.content;
      t.standardClauses = d.standardClauses;
      t.title = d.title;
      t.version += 1;
      await t.save();
    }
  }
};

module.exports = { DEFAULTS, getActiveTemplate, ensureDefaultTemplates };
