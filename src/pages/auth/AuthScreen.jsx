import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  validate,
  loginSchema,
  registerSchema,
  otpPasswordSchema,
  passwordResetSchema
} from '../../services/validation';
import { makeId } from '../../services/storage';
import { roles } from '../../services/permissions';
import { isSupabaseConfigured } from '../../lib/supabase';

/**
 * AuthScreen component handles login, registration, and password reset
 * Replaces the App.jsx AuthScreen with Zustand store integration
 */
export function AuthScreen() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState('login');
  const [values, setValues] = useState({
    identifier: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    email: '',
    mobile: '',
    otpCode: ''
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitError('');
    setSuccessMessage('');

    // Diagnostic: log submit mode (no sensitive data)
    try {
      // eslint-disable-next-line no-console
      console.log('[auth] submit', {
        mode,
        identifier: String(values.identifier || ''),
        hasPassword: Boolean(values.password),
        isSupabaseConfigured
      });
    } catch (err) {
      // ignore
    }

    if (mode === 'login') {
      const result = validate(loginSchema, values);
      setErrors(result.errors);
      if (!result.data) return;
      if (!values.password || values.password.trim().length === 0) {
        setErrors((current) => ({ ...current, password: 'Password is required' }));
        setSubmitError('Password is required');
        return;
      }
    }

    if (mode === 'register') {
      async function requestOtp() {
        const result = validate(registerSchema, values);
        setErrors(result.errors);
        if (!result.data) return false;

        try {
          setSubmitting(true);
          await signIn(null, { mode: 'sendOtp', values: result.data });
          setOtpSent(true);
          setSuccessMessage(
            'OTP sent to your email. Enter the code and create a password to finish registration.'
          );
          return true;
        } catch (error) {
          setSubmitError(error.message);
          return false;
        } finally {
          setSubmitting(false);
        }
      }

      if (!otpSent) {
        await requestOtp();
        return;
      }

      const result = validate(otpPasswordSchema, values);
      setErrors(result.errors);
      if (!result.data) return;
    }

    if (mode === 'resetPassword') {
      const result = validate(passwordResetSchema, values);
      setErrors(result.errors);
      if (!result.data) return;
    }

    try {
      setSubmitting(true);
      await signIn(
        {
          id: makeId('usr'),
          name: values.fullName || 'Demo User',
          role: roles.MEMBER,
          language: 'en',
          groupIds: ['grp_sakhi']
        },
        { mode, values }
      );
      if (mode === 'resetPassword') {
        setSuccessMessage('If this email exists, a password reset link has been sent.');
      }
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Bachat Gat SaaS</p>
          <h1>
            {mode === 'login'
              ? 'Login'
              : mode === 'resetPassword'
                ? 'Reset password'
                : 'Register group user'}
          </h1>
          <p>
            {isSupabaseConfigured
              ? 'Secure login is enabled.'
              : 'Demo mode is active until secure login is enabled.'}
          </p>
        </div>
        <form className="form-grid" onSubmit={submit} autoComplete="off">
          {mode === 'login' ? (
            <>
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={values.identifier}
                onChange={(value) => update('identifier', value)}
                error={errors.identifier}
              />
              <Field
                label="Password"
                name="current-password"
                type="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(value) => {
                  setPasswordTouched(true);
                  update('password', value);
                }}
                error={passwordTouched ? errors.password : undefined}
              />
            </>
          ) : mode === 'resetPassword' ? (
            <>
              <Field
                label="Email"
                value={values.email}
                onChange={(value) => update('email', value)}
                error={errors.email}
              />
            </>
          ) : (
            <>
              <Field
                label="Full name"
                required
                value={values.fullName}
                onChange={(value) => update('fullName', value)}
                error={errors.fullName}
              />
              <Field
                label="Email"
                required
                value={values.email}
                onChange={(value) => update('email', value)}
                error={errors.email}
              />
              <Field
                label="Mobile number"
                type="tel"
                value={values.mobile}
                onChange={(value) => update('mobile', value)}
                error={errors.mobile}
              />
              {otpSent && (
                <>
                  <Field
                    label="OTP code"
                    value={values.otpCode}
                    onChange={(value) => update('otpCode', value)}
                    error={errors.otpCode}
                  />
                  <Field
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={values.password}
                    onChange={(value) => update('password', value)}
                    error={errors.password}
                  />
                  <Field
                    label="Confirm password"
                    type={showPassword ? 'text' : 'password'}
                    value={values.confirmPassword || ''}
                    onChange={(value) => update('confirmPassword', value)}
                    error={errors.confirmPassword}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={submitting}
                    onClick={async () => {
                      setSubmitError('');
                      setSuccessMessage('');
                      const result = validate(registerSchema, values);
                      setErrors(result.errors);
                      if (!result.data) return;
                      try {
                        setSubmitting(true);
                        await signIn(null, { mode: 'sendOtp', values: result.data });
                        setSuccessMessage('A new OTP has been sent to your email.');
                      } catch (error) {
                        setSubmitError(error.message);
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    Resend OTP
                  </button>
                  <label className="field checkbox-field">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(event) => setShowPassword(event.target.checked)}
                    />
                    <span>Show password</span>
                  </label>
                </>
              )}
            </>
          )}
          {submitError && <div className="form-error">{submitError}</div>}
          {successMessage && <div className="form-success">{successMessage}</div>}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting
              ? 'Please wait'
              : mode === 'login'
                ? 'Login'
                : mode === 'resetPassword'
                  ? 'Send reset link'
                  : otpSent
                    ? 'Verify OTP and create account'
                    : 'Send OTP'}
          </button>
        </form>
        <button
          className="secondary-button"
          type="button"
          onClick={() => signIn(null, { mode: 'google', values: {} })}
        >
          Continue with Google
        </button>
        <NavLink className="secondary-button" to="/guide">
          User Guide
        </NavLink>
        {mode === 'login' ? (
          <>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setMode('resetPassword');
                setErrors({});
                setSubmitError('');
                setSuccessMessage('');
                setOtpSent(false);
                setShowPassword(false);
              }}
            >
              Forgot password?
            </button>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setMode('register');
                setValues({
                  identifier: '',
                  password: '',
                  fullName: '',
                  email: '',
                  mobile: '',
                  otpCode: '',
                  confirmPassword: ''
                });
                setErrors({});
                setSubmitError('');
                setSuccessMessage('');
                setOtpSent(false);
                setShowPassword(false);
              }}
            >
              Create new account
            </button>
          </>
        ) : mode === 'resetPassword' ? (
          <>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setMode('login');
                setValues({
                  identifier: '',
                  password: '',
                  fullName: '',
                  email: '',
                  mobile: '',
                  otpCode: '',
                  confirmPassword: ''
                });
                setErrors({});
                setSubmitError('');
                setSuccessMessage('');
                setOtpSent(false);
                setShowPassword(false);
              }}
            >
              Back to login
            </button>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setMode('register');
                setValues({
                  identifier: '',
                  password: '',
                  fullName: '',
                  email: '',
                  mobile: '',
                  otpCode: '',
                  confirmPassword: ''
                });
                setErrors({});
                setSubmitError('');
                setSuccessMessage('');
                setOtpSent(false);
                setShowPassword(false);
              }}
            >
              Create new account
            </button>
          </>
        ) : (
          <button
            className="link-button"
            type="button"
            onClick={() => {
              setMode('login');
              setValues({
                identifier: '',
                password: '',
                fullName: '',
                email: '',
                mobile: '',
                otpCode: '',
                confirmPassword: ''
              });
              setErrors({});
              setSubmitError('');
              setSuccessMessage('');
              setOtpSent(false);
              setShowPassword(false);
            }}
          >
            Back to login
          </button>
        )}
      </section>
    </main>
  );
}

/**
 * Temporary Field component stub - import from actual location
 */
function Field({ label, value, onChange, error, required, ...props }) {
  return (
    <label className="field">
      {label}
      {required && <span className="required">*</span>}
      <input value={value} onChange={(e) => onChange(e.target.value)} {...props} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
