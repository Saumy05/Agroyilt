/**
 * The work types a farmer can ask for and a worker can offer: one list for both, so a request and a profile speak the same words.
 * (The farmer's request form keeps its own templates keyed by these names.)
 */
export const WORKER_SERVICES = [
  'Harvesting',
  'Sowing',
  'Planting',
  'Irrigation',
  'Weeding',
  'Fertilizing',
  'Pesticide Spraying',
  'Land Preparation',
  'Threshing',
  'Loading & Unloading',
  'Tractor Operation',
  'General Farm Labour'
];

// Names workers saved before the two lists were unified -> the current name
const LEGACY_SERVICE_NAMES = {
  'drive tractor': 'Tractor Operation',
  'tractor driving': 'Tractor Operation',
  'drive harvester': 'Harvesting',
  'ploughing': 'Land Preparation',
  'plowing': 'Land Preparation',
  'sowing / seeding': 'Sowing',
  'harvesting (crop cutting)': 'Harvesting',
  'crop spraying': 'Pesticide Spraying',
  'loading / unloading': 'Loading & Unloading',
  'general farm helper': 'General Farm Labour'
};

/** Current name of a service (unchanged when it is already current or a custom entry) */
export const canonicalService = (name) => {
  const text = String(name ?? '').trim();
  return LEGACY_SERVICE_NAMES[text.toLowerCase()] || text;
};

/** A list of services in current names, without duplicates, keeping the order */
export const canonicalServices = (list) => {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(canonicalService)
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
};
