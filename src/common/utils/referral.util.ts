export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at < 0) return trimmed;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  const plus = local.indexOf("+");
  if (plus >= 0) {
    local = local.slice(0, plus);
  }

  if (domain === "gmail.com") {
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

export type ReferralContext = {
  registrationIp: string;
  email: string;
};

export type ReferralCandidate = {
  id: number;
  email: string;
  registrationIp: string | null;
};

export function isReferralAllowed(
  referrer: ReferralCandidate,
  newUserId: number,
  context: ReferralContext,
): boolean {
  if (referrer.id === newUserId) return false;
  if (normalizeEmail(context.email) === normalizeEmail(referrer.email)) {
    return false;
  }

  const ip = context.registrationIp.trim();
  if (!ip) return true;

  if (referrer.registrationIp && referrer.registrationIp === ip) {
    return false;
  }

  return true;
}

export const REFERRAL_SALARY_RATING_STEP = 500;
export const REFERRAL_SALARY_MAX_PER_USER = 5;

export function getReferralSalaryBonusPercent(rating: number): number {
  return Math.min(
    REFERRAL_SALARY_MAX_PER_USER,
    Math.floor(rating / REFERRAL_SALARY_RATING_STEP),
  );
}

export function getTotalReferralSalaryBonusPercent(ratings: number[]): number {
  return ratings.reduce(
    (sum, rating) => sum + getReferralSalaryBonusPercent(rating),
    0,
  );
}
