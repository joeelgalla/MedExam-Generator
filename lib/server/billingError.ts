/** An explicit provider payment failure is not a transient request limit. */
export function billingError(error: unknown) {
  const e = error as { status?: number; code?: number; message?: string };
  const message = typeof error === 'string' ? error : e?.message || '';
  if (e?.status === 402 || e?.code === 402 || /"code"\s*:\s*402\b|prepayment credits are depleted/i.test(message)) {
    return { status: 402, code: 'billing', error: 'Google reports that the app’s prepaid Gemini credits are depleted. The app owner needs to restore credits in Google AI Studio before AI generation or tutoring can run. Waiting will not restore these credits. Saved exams, answers and explanations still work.' };
  }
  return null;
}
