'use strict';

/**
 * How a machine's rate and its attachment's rate combine.
 *
 *  • Service listings ("total" model, flagged `attachmentRates: 'total'`): the attachment's rate IS the rate for that job
 *    (e.g. Trolley ₹100/km, Rotavator ₹800/acre). A blank attachment rate means "same as the machine's own rate".
 *  • Rental listings, and older service listings without the flag ("add-on" model): the machine's rate plus the
 *    attachment's rate on top, as before.
 *
 * Search, booking, the live timer and the final bill all go through here so a farmer is quoted what they are billed.
 */

const idOf = (v) => String(v?._id || v || '');
const rateOf = (p) => (p?.isEnabled && Number(p.price) > 0 ? Number(p.price) : 0);

const isTotalModel = (equipment) => equipment?.attachmentRates === 'total' && equipment?.listingType !== 'rental';

const findAttachment = (equipment, implementId) =>
  implementId ? (equipment?.implements || []).find((i) => idOf(i.subCategoryId) === idOf(implementId)) : null;

/**
 * Per-unit rates for hourly / land_based / daily.
 * @returns {{tractorUnitRate:number, implementUnitRate:number, machineRate:number, attachmentRate:number}}
 *   In the total model the whole rate is returned as tractorUnitRate and implementUnitRate is 0.
 */
const unitRates = (equipment, implementId, rentalType) => {
  const machineRate = rateOf(equipment?.pricing?.[rentalType]);
  const attachmentRate = rateOf(findAttachment(equipment, implementId)?.pricing?.[rentalType]);
  if (isTotalModel(equipment)) {
    return { tractorUnitRate: attachmentRate > 0 ? attachmentRate : machineRate, implementUnitRate: 0, machineRate, attachmentRate };
  }
  return { tractorUnitRate: machineRate, implementUnitRate: attachmentRate, machineRate, attachmentRate };
};

module.exports = { idOf, rateOf, isTotalModel, findAttachment, unitRates };
