// Starter Terms & Privacy text shown until an admin saves their own version
// (Website Settings > Policies). Admins should have these reviewed before going live.

const PRIVACY_COMMON = (who) => `PRIVACY POLICY - ${who}

1. Information we collect
We collect the details you give us (name, phone number, email, address, identity and bank details where needed), your location while you use the app, and your booking, payment and activity history on AgroYilt.

2. How we use it
We use your information to verify your account, match and complete bookings, process payments and payouts, send service updates, prevent fraud and improve the platform.

3. Sharing
We share only what is needed to complete a booking (for example your name, phone number and job location with the other party). We use trusted service providers for payments, SMS and email. We never sell your personal data.

4. Security
Your data is stored securely and access is limited to people who need it. No system is completely risk free, so please keep your MPIN and OTP private.

5. Your choices
You can update your profile details in the app. You can ask us to delete your account and data through Help & Support, subject to records we must keep by law.

6. Contact
For any privacy question, write to agroyilt@gmail.com or use Help & Support in the app.`;

const DEFAULT_POLICIES = {
  user: {
    terms: `TERMS & CONDITIONS - FARMERS

1. Using AgroYilt
AgroYilt connects farmers with equipment owners (vendors) and farm workers. By creating an account or placing a booking you agree to these terms.

2. Your account
Give correct details and keep your MPIN and OTP private. You are responsible for all activity on your account.

3. Bookings & payments
Book and pay only through the AgroYilt app. Prices are shown before you confirm and may include GST. Do not pay vendors or workers outside the app for bookings made here.

4. Cancellations & refunds
Cancellation rules and any refunds are as shown in the app's Cancellation Policy at the time of booking.

5. Safe work environment
Make sure the work site is safe for machinery and people, and tell the vendor or worker about any hazards beforehand. Give accurate land location and work details.

6. Conduct
Treat vendors and workers with respect. Misuse, false complaints, fraud or harassment can lead to suspension of your account.

7. Disputes
If something goes wrong, raise it from the booking in the app or through Help & Support. AgroYilt will review it and its decision on the booking is final.

8. Changes
We may update these terms from time to time. Continuing to use the app means you accept the updated terms.`,
    privacy: PRIVACY_COMMON('FARMERS')
  },
  vendor: {
    terms: `TERMS & CONDITIONS - VENDORS (EQUIPMENT OWNERS)

1. Using AgroYilt
AgroYilt lets equipment owners list machinery and receive bookings from farmers. By registering or listing equipment you agree to these terms.

2. Verification
You must give correct KYC and machine documents. Equipment goes live only after admin approval, and AgroYilt may ask for documents again at any time.

3. Equipment & service quality
Keep your machines in good working condition and use skilled operators who follow safety rules. Show up on time for confirmed bookings.

4. Pricing, fees & payouts
Rates are set by you within the options in the app. AgroYilt charges a platform fee, shown when you list equipment. Earnings are settled after the work is completed and verified.

5. Bookings in the app
Accept, track and complete jobs only through the app. Do not take bookings made on AgroYilt outside the platform.

6. Cancellations & penalties
Repeated cancellations, no-shows or poor service can lead to penalties, reduced visibility or suspension.

7. Conduct
Treat farmers and workers with respect. Fraud, false documents or misuse of the platform can lead to permanent removal.

8. Changes
We may update these terms from time to time. Continuing to use the app means you accept the updated terms.`,
    privacy: PRIVACY_COMMON('VENDORS')
  },
  worker: {
    terms: `TERMS & CONDITIONS - WORKERS

1. Using AgroYilt
AgroYilt connects farm workers and team leaders with farmers who need work done. By registering you agree to these terms.

2. Registration & verification
Give your real name and a valid Aadhar and phone number. Your account is active only after admin approval, and you may be asked for documents again at any time.

3. Accepting & doing jobs
Accept jobs only if you can do them. Reach the work location on time, carry out the work properly and follow safety instructions. Use the app to start and finish each job.

4. Earnings & payments
Your earnings are credited to your AgroYilt wallet after the work is completed and verified. Any amounts you owe the platform, such as cash you collected, must be paid within the time shown in the app.

5. Cancellations & penalties
Cancelling accepted jobs, not turning up or poor behaviour can lead to penalties, lower job priority or suspension.

6. Team leaders
Team leaders are responsible for the members they add and for sharing earnings with them fairly.

7. Conduct
Treat farmers and other workers with respect. Fraud, false documents, taking payments outside the app or misuse of the platform can lead to permanent removal.

8. Changes
We may update these terms from time to time. Continuing to use the app means you accept the updated terms.`,
    privacy: PRIVACY_COMMON('WORKERS')
  }
};

module.exports = DEFAULT_POLICIES;
