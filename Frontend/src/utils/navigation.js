/**
 * Open the login page after a finished registration so that Back lands on the welcome
 * screen instead of walking back through the signup and PIN-setup pages.
 * The PIN page is replaced by the welcome screen, then login is pushed on top of it.
 */
export const goToLoginAfterRegistration = (navigate) => {
  navigate('/app', { replace: true });
  navigate('/app/login');
};
