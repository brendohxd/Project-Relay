export const DOCTOR_STATUS = Object.freeze({
  PASS: "PASS",
  WARN: "WARN",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN"
});

export function summarizeDoctor(checks) {
  const counts = Object.fromEntries(
    Object.values(DOCTOR_STATUS).map((status) => [
      status,
      checks.filter((check) => check.status === status).length
    ])
  );
  return {
    counts,
    healthy: counts.FAIL === 0 && counts.UNKNOWN === 0,
    exitCode: counts.FAIL > 0 || counts.UNKNOWN > 0 ? 1 : 0
  };
}
