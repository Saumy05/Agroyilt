// One script id and one library list for every screen. @react-google-maps/api throws
// "Loader must not be called again with different options" if two screens ask for different ones.
export const GOOGLE_MAPS_LOADER_ID = 'google-map-script';
export const GOOGLE_MAPS_LIBRARIES = ['places', 'geometry', 'drawing'];
