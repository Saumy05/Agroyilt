// The sidebar badges poll on a timer; pages call refreshAdminCounts() after they change a queue
// (approve / reject / claim) so the badge updates right away.
export const ADMIN_COUNTS_REFRESH = 'admin:counts-refresh';

export const refreshAdminCounts = () => {
  window.dispatchEvent(new Event(ADMIN_COUNTS_REFRESH));
};
