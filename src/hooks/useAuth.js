import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { repository } from '../services/repository';
import { withTimeout } from '../services/stateHelpers';

const SUPABASE_BOOT_TIMEOUT_MS = 12000;

/**
 * Hook for authentication logic
 */
export function useAuth() {
  const navigate = useNavigate();
  const {
    session,
    setSession,
    setSelectedGroupId,
    setNotification
  } = useAppStore();

  const signIn = useCallback(
    async (user, credentials) => {
      if (!credentials || !repository.isConfigured()) {
        setSession({ signedIn: true, user });
        navigate('/home', { replace: true });
        return;
      }

      try {
        // Handle different auth modes
        if (credentials.mode === 'google') {
          await repository.signInWithGoogle();
          return;
        }

        if (credentials.mode === 'sendOtp') {
          await repository.sendRegistrationOtp(credentials.values.email, credentials.values);
          return;
        }

        if (credentials.mode === 'register') {
          const verified = await repository.verifyRegistrationOtp({
            email: credentials.values.email,
            otpCode: credentials.values.otpCode
          });

          if (!verified) {
            throw new Error('OTP verification failed. Please check the code and try again.');
          }

          await repository.setPassword(credentials.values.password);
        }

        if (credentials.mode === 'resetPassword') {
          await repository.resetPassword(credentials.values.email);
          return;
        }

        // Sign in
        const signedInUser =
          credentials.mode === 'login'
            ? await withTimeout(
                repository.signIn(credentials.values.identifier, credentials.values.password),
                SUPABASE_BOOT_TIMEOUT_MS,
                'Login'
              )
            : await withTimeout(repository.getSessionUser(), SUPABASE_BOOT_TIMEOUT_MS, 'Session check');

        setSession({ signedIn: true, user: signedInUser });
        navigate('/home', { replace: true });
      } catch (err) {
        console.error('Sign in failed:', err);
        const timeoutError = String(err?.message || '').toLowerCase().includes('timed out');
        const message = timeoutError
          ? `Login timed out after ${SUPABASE_BOOT_TIMEOUT_MS / 1000}s. Check your internet connection or Supabase configuration.`
          : err?.message || 'Sign in failed. Please check your credentials and network connection.';

        setNotification({
          type: 'error',
          message,
          details: err?.details || err?.toString?.() || String(err)
        });
        throw new Error(message);
      }
    },
    [navigate, setSession, setSelectedGroupId, setNotification]
  );

  const signOut = useCallback(async () => {
    console.log('[app] signOut clicked');
    if (repository.isConfigured()) {
      try {
        await repository.signOut();
        console.log('[app] repository.signOut succeeded');
      } catch (err) {
        console.error('Sign out failed:', err);
        // Continue to clear session locally even if remote signOut fails
      }
    } else {
      console.log('[app] Supabase not configured; skipping remote signOut');
    }

    setSelectedGroupId(null);
    setSession({ signedIn: false, user: {} });
    window.location.replace('/');
  }, [setSelectedGroupId, setSession]);

  return { signIn, signOut, session };
}
