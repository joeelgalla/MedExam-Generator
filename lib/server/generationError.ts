/** User-facing errors based on the provider's actual response, never a guessed plan. */
export function generationError(message:string) {
  if (/429|RESOURCE_EXHAUSTED/i.test(message)) {
    if (/quota|free_tier/i.test(message)) {
      const zero=/limit["']?\s*:\s*0\b/i.test(message);
      return {status:429,code:'quota',error:zero
        ? 'Google reports zero quota for the app’s question model. The app owner needs to check quota and billing in Google AI Studio. Waiting alone will not fix a zero quota. Your saved exams still work; you can also use your own AI below.'
        : 'Google reports that the app’s question-model quota is exhausted. Your saved exams still work. Use your own AI below, or check again after quota is restored.'};
    }
    return {status:429,code:'rate_limit',error:'Google is receiving too many requests. Wait a moment, then try again. Your saved exams are unchanged.'};
  }
  if (/403|PERMISSION_DENIED/.test(message)) return {status:403,code:'access',error:'Google denied access to the question model. The app owner needs to check the server API configuration.'};
  if (/503|UNAVAILABLE/.test(message)) return {status:503,code:'unavailable',error:'The AI model is temporarily overloaded. Please try again shortly.'};
  return {status:500,code:'generation',error:'Failed to generate exam. Please try again. Your saved exams are unchanged.'};
}
