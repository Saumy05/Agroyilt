// One readable line from an address object: house / flat, street or Google address, city, state, pincode.
// A part that is already inside the text so far (Google's address usually contains the city and state) is not repeated.
export const formatFullAddress = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  if (address.fullAddress && String(address.fullAddress).trim()) {
    return [address.addressLine2, address.fullAddress].filter(Boolean).map(s => String(s).trim()).join(', ');
  }
  let text = '';
  [address.addressLine2, address.addressLine1, address.landmark, address.city, address.state, address.pincode].forEach((part) => {
    const p = String(part || '').trim();
    if (p && !text.toLowerCase().includes(p.toLowerCase())) text = text ? `${text}, ${p}` : p;
  });
  return text;
};
