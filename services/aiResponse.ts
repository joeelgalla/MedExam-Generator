// Hosting failures can return plain text or HTML before an API handler runs.
// Keep those failures actionable without exposing a JSON parser error to learners.
export async function readAIResponse(response: Response): Promise<any> {
  const body = await response.text();
  try {
    const data = JSON.parse(body);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid response');
    return data;
  } catch {
    const message = response.ok
      ? 'The AI service returned an unreadable response. Your existing exams are unchanged. Try again later.'
      : `The AI service could not complete the request (HTTP ${response.status}). Your existing exams are unchanged. Try again later.`;
    throw Object.assign(new Error(message), { status: response.status, code: 'invalid_response' });
  }
}
