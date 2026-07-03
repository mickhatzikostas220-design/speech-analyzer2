// Tester demo account.
//
// A single fixed account that is meant to be experienced as a brand-new user on
// every sign-in. When this account logs in, the app calls /api/tester/reset,
// which wipes all of its data and resets its profile back to a fresh, free-tier,
// un-onboarded state (see supabase/tester.sql -> reset_tester_account()).
//
// The email is pre-verified in Supabase, so this account never needs to confirm
// an email. Keep the credentials private: anyone who has them can sign in and
// consume AI/render credits, even though they can never see real user data.

/** The one account we treat as the disposable "brand new user" demo login. */
export const TESTER_EMAIL = 'tester67@speaker-hub.com';

// sessionStorage key marking that the tester was already reset this browser
// session. Shared by the login page and <TesterFreshStart /> so the wipe runs
// at most once per visit — never mid-demo while navigating around.
export const TESTER_RESET_FLAG = 'tester-fresh-start';

/** True when the given email is the tester demo account (case-insensitive). */
export function isTesterEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === TESTER_EMAIL;
}
