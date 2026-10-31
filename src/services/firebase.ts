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

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const saveAuthSession = (token: string, expiresInSeconds = 86400 * 30) => {
  cachedAccessToken = token;
  try {
    const expiry = Date.now() + expiresInSeconds * 1000;
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_EXPIRY_KEY, String(expiry));
  } catch (e) {
    console.warn('Could not save auth to localStorage:', e);
  }
};

export const getSavedToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  try {
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
