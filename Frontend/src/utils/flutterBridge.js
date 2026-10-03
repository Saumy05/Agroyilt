/**
 * Production-Ready Flutter JS Bridge
 * Handles secure and optimized communication with native mobile features.
 */
class FlutterBridge {
  constructor() {
    this.isFlutter =
      typeof window !== "undefined" &&
      window.flutter_inappwebview;
  }

  /**
   * Waits for the native WebView bride to be fully available.
   */
  waitForFlutter() {
    return new Promise((resolve) => {
      if (this.isFlutter) return resolve(true);

      window.addEventListener(
        "flutterInAppWebViewPlatformReady",
        () => {
          this.isFlutter = true;
          resolve(true);
        },
        { once: true }
      );

      // 1-second timeout as safety
      setTimeout(() => resolve(false), 1000);
    });
  }

  /**
   * Universal call to any Flutter JS Handler with availability check.
   */
  async callHandler(handlerName, data = {}) {
    await this.waitForFlutter();

    if (!this.isFlutter) {
      console.warn(`[FlutterBridge] Bridge not available for ${handlerName}`);
      return { success: false, error: "Not inside Flutter WebView" };
    }

    try {
      return await window.flutter_inappwebview.callHandler(handlerName, data);
    } catch (error) {
      console.error(`[FlutterBridge] Error calling native handler ${handlerName}:`, error);
      return { success: false, error: error.message };
    }
  }

  /* ================================
        CAMERA (NATIVE)
  ================================== */
  async openCamera() {
    try {
      const result = await this.callHandler("openCamera");

      if (result && result.success) {
        const response = await fetch(
          `data:${result.mimeType};base64,${result.base64}`
        );
        const blob = await response.blob();

        return new File([blob], result.fileName || `cam_${Date.now()}.jpg`, {
          type: result.mimeType || 'image/jpeg',
        });
      }
      return null;
    } catch (error) {
      console.error("[FlutterBridge] Camera Error:", error);
      return null;
    }
  }

  /* ================================
        LOCATION (NATIVE + FALLBACK)
  ================================== */
  async getCurrentLocation() {
    try {
      const result = await this.callHandler("getLocation");

      if (result && result.success) {
        return {
          latitude: result.latitude,
          longitude: result.longitude,
          source: 'flutter_native'
        };
      }

      // If native bridge result is failure, throw to trigger fallback
      throw new Error("Native location failed");
    } catch (error) {
      console.warn("[FlutterBridge] Flutter Location Error, falling back to browser GPS:", error);

      // Browser fallback (Web Geolocation API)
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation not supported by browser"));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              source: 'browser_gps'
            });
          },
          (err) => {
            console.error("[FlutterBridge] Browser fallback also failed:", err.message);
            reject(err);
          },
          {
            enableHighAccuracy: false, 
            timeout: 30000, // Increased to 30 seconds
            maximumAge: 60000 // Allow up to 60 seconds old cached location for faster response
          }
        );
      });
    }
  }

  /**
   * Triggers native haptic feedback.
   */
  async hapticFeedback(type = "medium") {
    return this.callHandler("haptic", { type });
  }

  /* ================================
        DOWNLOADS (NATIVE BRIDGE)
  ================================== */
  async downloadFile(url, fileName) {
    if (this.isFlutter) {
      return this.callHandler("downloadFile", { url, fileName });
    } else {
      // Browser Fallback (handles Cross-Origin URLs)
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
        return { success: true };
      } catch (error) {
        // Fallback if fetch fails due to CORS
        window.open(url, '_blank');
        return { success: true };
      }
    }
  }

  /* ================================
        SHARING (NATIVE BRIDGE)
  ================================== */
  async shareContent(data = { title: '', text: '', url: '' }) {
    if (this.isFlutter) {
      return this.callHandler("share", data);
    } else if (navigator.share) {
      try {
        await navigator.share(data);
        return { success: true };
      } catch (error) {
        console.error("Web Share failed:", error);
        return { success: false, error: error.message };
      }
    } else {
      // Fallback: Copy to clipboard?
      try {
        await navigator.clipboard.writeText(data.url || data.text);
        return { success: true, message: 'Link copied to clipboard' };
      } catch (err) {
        return { success: false, error: 'Sharing not supported' };
      }
    }
  }

  /* ================================
        IN-WEBVIEW NAVIGATION
  ================================== */
  /**
   * Navigates to an internal SPA path without letting Flutter intercept it
   * as a native route. Calls the 'navigateWebView' Flutter handler so the
   * Flutter app knows to stay in the WebView. Falls back to pushState/href
   * when not inside Flutter.
   *
   * @param {string} path  - e.g. '/worker/job/abc123/timeline'
   * @param {Function} reactNavigate - React Router navigate() fn (optional)
   */
  async navigateTo(path, reactNavigate = null) {
    if (this.isFlutter) {
      // Try to call a Flutter handler that whitelists WebView-internal navigation.
      // If the handler doesn't exist yet the bridge silently no-ops and we fall through.
      try {
        await window.flutter_inappwebview.callHandler('navigateWebView', { path });
        return;
      } catch (_) {
        // Handler not registered in Flutter yet — fall through to pushState.
      }
      // Fallback: use pushState so Flutter's shouldOverrideUrlLoading is NOT triggered
      // (pushState doesn't fire a full navigation event that Flutter intercepts).
      window.history.pushState({}, '', path);
      // Dispatch a popstate so React Router picks up the change.
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      return;
    }

    // Not in Flutter — use React Router if provided, otherwise location.
    if (reactNavigate) {
      reactNavigate(path);
    } else {
      window.location.href = path;
    }
  }
}

const bridgeInstance = new FlutterBridge();
export default bridgeInstance;
export const flutterBridge = bridgeInstance;
