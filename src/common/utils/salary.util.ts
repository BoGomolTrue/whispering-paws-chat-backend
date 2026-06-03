const SALARY_BASE_MS = 5 * 60 * 1000;
const SALARY_EXTRA_MS = 30 * 1000;

export function getSalaryCooldownRemain(
  lastSalaryAt: number,
  salaryClaimCount: number,
): number {
  const cd = SALARY_BASE_MS + (salaryClaimCount || 0) * SALARY_EXTRA_MS;
  return Math.max(0, cd - (Date.now() - (lastSalaryAt || 0)));
}

export function getSalaryTotalCooldownMs(salaryClaimCount: number): number {
  return SALARY_BASE_MS + (salaryClaimCount || 0) * SALARY_EXTRA_MS;
}
