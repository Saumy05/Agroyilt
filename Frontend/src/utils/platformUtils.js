/**
 * Platform Detection Utilities
 * Detects: Desktop browser, Mobile browser, Flutter WebView
 *
 * Rules:
 *  - Any browser (desktop or phone) → shows the landing page at /
 *  - Flutter WebView                → redirects / to /app (app entry screen)
 */

/**
 * Returns true if the current device is a mobile/tablet (touch device with small viewport).
 * Uses user-agent AND touch capability check for reliability.
 */
export const isMobileDevice = () => {
  const ua = navigator.userAgent || navigator.vendor || '';

  // Explicit mobile/tablet user agent patterns
  const mobileRegex =
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;

  if (mobileRegex.test(ua)) return true;

  // Touch-capable device with narrow screen (e.g. Surface/iPad in portrait)
  const hasTouchScreen =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0;

  const isNarrowScreen = window.innerWidth <= 820;

  // For robust testing and responsive behavior, if screen is very narrow, treat as mobile
  return isNarrowScreen || hasTouchScreen;
};

/**
 * Returns true when running inside a Flutter InAppWebView container.
 */
export const isFlutterWebView = () => {
  return !!(window.flutter_inappwebview && window.flutter_inappwebview.callHandler);
};

/**
 * Returns true when the app should render in "mobile app" mode:
 * - Inside Flutter WebView, OR
 * - Accessed from a real mobile browser
 *
 * Desktop browser → returns false → shows landing page
 */
export const isMobileApp = () => {
  return isFlutterWebView() || isMobileDevice();
};
