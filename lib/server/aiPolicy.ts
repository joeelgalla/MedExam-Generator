export function aiDisabled(environment: Record<string, string | undefined>): boolean {
  return environment.VERCEL_ENV === 'preview' || environment.DISABLE_AI === '1';
}
