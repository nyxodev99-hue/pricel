// A random identifier generated once per browser and kept in localStorage.
// It is NOT a device fingerprint (nothing is derived from hardware/browser
// characteristics) - it's just a sticky "have I signed up from here before"
// flag, sent alongside the account creation request. Combined server-side
// with a per-IP cap (see backend/src/middleware/auth.js) to make repeated
// account creation from the same browser/network harder, without pretending
// to guarantee "one account per physical device" (nothing purely
// client-side can promise that: clearing localStorage or using another
// browser resets it).
const STORAGE_KEY = 'pc_device_token';

export function getDeviceToken() {
  try {
    let token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, token);
    }
    return token;
  } catch (_) {
    // localStorage unavailable (private mode / disabled) - fall back to an
    // in-memory token for this page load only. Signup will still work, it
    // just won't be remembered as "already used" next time.
    return crypto.randomUUID();
  }
}
