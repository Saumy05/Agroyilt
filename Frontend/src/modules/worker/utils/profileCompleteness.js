/**
 * Utility to verify whether an independent worker's profile is complete enough
 * to receive job requests and switch availability to ONLINE.
 *
 * Requirements for an independent worker:
 * 1. Work Skills: At least 1 skill selected.
 * 2. Work Location: Address / city / coordinates configured.
 * 3. Pricing Rates: At least one rate (daily, hourly, or land rate) set (> 0).
 *    (Team members managed by a team leader are exempt from individual rates).
 */

export const checkWorkerProfileCompleteness = (profile) => {
  if (!profile) {
    return {
      isComplete: false,
      hasSkills: false,
      hasAddress: false,
      hasRates: false,
      missing: ['skills', 'address', 'rates'],
      completedCount: 0,
      totalSteps: 3,
      percentage: 0
    };
  }

  // If worker belongs to a team and is not the leader, their rates are governed by the team
  const isTeamMember = Boolean(profile.teamId && profile.workerType !== 'TEAM_LEADER');

  // 1. Skills: Must have at least 1 skill
  const hasSkills = Array.isArray(profile.skills) && profile.skills.length > 0;

  // 2. Address / Location: Must have fullAddress, city, or addressLine1
  const addr = profile.address || profile.rawAddress;
  const hasAddress = Boolean(
    addr && (
      (typeof addr === 'string' && addr.trim() !== '' && addr !== 'Not set') ||
      (typeof addr === 'object' && (
        Boolean(addr.fullAddress && addr.fullAddress.trim()) ||
        Boolean(addr.addressLine1 && addr.addressLine1.trim()) ||
        Boolean(addr.city && addr.city.trim())
      ))
    )
  );

  // 3. Rates: Must have at least one rate > 0 (unless a team member)
  const dailyRate = Number(profile.dailyRate) || 0;
  const hourlyRate = Number(profile.hourlyRate) || 0;
  const landRate = Number(profile.landRate) || 0;
  const hasRates = isTeamMember || (dailyRate > 0 || hourlyRate > 0 || landRate > 0);

  const missing = [];
  if (!hasSkills) missing.push('skills');
  if (!hasAddress) missing.push('address');
  if (!hasRates) missing.push('rates');

  const completedCount = 3 - missing.length;
  const percentage = Math.round((completedCount / 3) * 100);

  return {
    isComplete: missing.length === 0,
    hasSkills,
    hasAddress,
    hasRates,
    missing,
    completedCount,
    totalSteps: 3,
    percentage
  };
};
