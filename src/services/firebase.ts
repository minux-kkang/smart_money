import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

// Provider with Drive and Sheets scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
// Note: We do NOT force 'select_account' so re-authentication happens seamlessly without re-picking the account!

const STORAGE_TOKEN_KEY = 'smart_money_google_token';
const STORAGE_EXPIRY_KEY = 'smart_money_token_expiry';
const STORAGE_SAVED_AT_KEY = 'smart_money_token_saved_at';

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const isAuthExpiredError = (err: any): boolean => {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err.message || JSON.stringify(err);
  const isExpired = (
    msg.includes('invalid authentication credentials') ||
    msg.includes('Expected OAuth 2 access token') ||
    msg.includes('AUTH_EXPIRED') ||
    msg.includes('Invalid Credentials') ||
    msg.includes('UNAUTHENTICATED') ||
    err?.status === 401 ||
    err?.code === 401
  );
  if (isExpired) {
    clearAuthSession();
  }
  return isExpired;
};

export const saveAuthSession = (token: string, expiresInSeconds = 3500) => {
  cachedAccessToken = token;
  try {
    const now = Date.now();
    const expiry = now + expiresInSeconds * 1000;
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_EXPIRY_KEY, String(expiry));
    localStorage.setItem(STORAGE_SAVED_AT_KEY, String(now));
  } catch (e) {
    console.warn('Could not save auth to localStorage:', e);
  }
};

export const getSavedToken = (): string | null => {
  try {
    const savedAtStr = localStorage.getItem(STORAGE_SAVED_AT_KEY);
    const expiryStr = localStorage.getItem(STORAGE_EXPIRY_KEY);
    const now = Date.now();

    // Google OAuth access tokens are valid for max 3600 seconds (1 hour).
    if (savedAtStr) {
      const savedAt = parseInt(savedAtStr, 10);
      if (now - savedAt > 3500 * 1000) {
        clearAuthSession();
        return null;
      }
    } else if (expiryStr) {
      const expiry = parseInt(expiryStr, 10);
      // If expiry is more than 3600s in the future or already past, it is invalid (legacy 30-day bug)
      if (expiry - now > 3600 * 1000 || now > expiry) {
        clearAuthSession();
        return null;
      }
    } else {
      // Legacy token with no expiry info: clear to force fresh clean token
      clearAuthSession();
      return null;
    }

    if (cachedAccessToken) return cachedAccessToken;

    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (token) {
      cachedAccessToken = token;
      return token;
    }
  } catch (e) {
    console.warn('Could not read auth from localStorage:', e);
  }
  return null;
};

export const clearAuthSession = () => {
  cachedAccessToken = null;
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    localStorage.removeItem(STORAGE_SAVED_AT_KEY);
  } catch (e) {
    console.warn('Could not clear auth session:', e);
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const savedToken = getSavedToken() || '';
      if (onAuthSuccess) onAuthSuccess(user, savedToken);
    } else {
      // User is genuinely logged out
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const refreshGoogleToken = async (): Promise<string | null> => {
  try {
    const res = await googleSignIn();
    return res?.accessToken || null;
  } catch (err) {
    console.warn('Silent token refresh failed:', err);
    return null;
  }
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    // If user is already known, hint the email to skip the account chooser modal
    if (auth.currentUser?.email) {
      provider.setCustomParameters({
        login_hint: auth.currentUser.email,
      });
    } else {
      provider.setCustomParameters({});
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google OAuth 액세스 토큰을 발급받지 못했습니다.');
    }

    saveAuthSession(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      console.warn('사용자가 로그인 팝업을 닫았습니다.');
      return null;
    }
    if (error.code === 'auth/unauthorized-domain') {
      console.error('Firebase Auth 미허용 도메인:', window.location.hostname);
      throw new Error(
        `[도메인 승인 필요] GitHub Pages 도메인(${window.location.hostname})이 Firebase 인증 도메인에 아직 등록되지 않았습니다.`
      );
    }
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return getSavedToken();
};

export const setCachedAccessToken = (token: string | null) => {
  if (token) {
    saveAuthSession(token);
  } else {
    clearAuthSession();
  }
};

export const logout = async () => {
  clearAuthSession();
  await signOut(auth);
};
