// Location ids the public category API filters by (state / district / sub-district / city scoped categories).
const idOf = (v) => (v && typeof v === 'object' ? (v._id || v.id || v.$oid) : v) || undefined;

/** Category-API location params for a vendor profile (ids may arrive populated as objects). */
export const locationParamsFromVendor = (vendor) => {
  const params = {
    stateId: idOf(vendor?.stateId),
    districtId: idOf(vendor?.districtId),
    subDistrictId: idOf(vendor?.subDistrictId),
    cityId: idOf(vendor?.address?.cityId) || idOf(vendor?.cityId)
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
  return params;
};
