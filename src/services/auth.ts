import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { getSupabaseClient } from '../lib/supabase';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '';

export function isGoogleSignInConfigured(): boolean {
  return (
    googleWebClientId.length > 10 &&
    !googleWebClientId.includes('your-web-client-id')
  );
}

let googleConfigured = false;

export function configureGoogleSignIn(): void {
  if (googleConfigured || !isGoogleSignInConfigured()) {
    return;
  }

  GoogleSignin.configure({
    webClientId: googleWebClientId,
  });
  googleConfigured = true;
}

export async function signInWithGoogle(): Promise<void> {
  if (!isGoogleSignInConfigured()) {
    throw new Error('Google sign-in is unavailable in this build. Use Email & Password below.');
  }

  configureGoogleSignIn();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (isCancelledResponse(response)) {
      throw new Error('Google sign-in was cancelled.');
    }
    if (!isSuccessResponse(response)) {
      throw new Error('Google sign-in did not succeed.');
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error('Google sign-in did not return an ID token.');
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('Google sign-in was cancelled.');
      }
      if (err.code === statusCodes.IN_PROGRESS) {
        throw new Error('Google sign-in is already in progress.');
      }
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services is unavailable on this phone.');
      }
    }
    throw err instanceof Error ? err : new Error('Google sign-in failed.');
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Enter a valid email address');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ needsEmailConfirmation: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Enter a valid email address');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
  });
  if (error) {
    throw new Error(error.message);
  }

  return {
    needsEmailConfirmation: !data.session,
  };
}

export async function signOutAll(): Promise<void> {
  try {
    if (googleConfigured && GoogleSignin.hasPreviousSignIn()) {
      await GoogleSignin.signOut();
    }
  } catch {
    // Ignore native Google sign-out errors if user signed in via email/password or Expo Go
  }
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}
