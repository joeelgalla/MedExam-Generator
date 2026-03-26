import { TELEMETRY_ENDPOINT } from '../constants';

export type TelemetryEvent = 
  | 'session_start'
  | 'beta_login_success'
  | 'beta_login_fail'
  | 'user_registered'
  | 'exam_generated'
  | 'exam_completed'
  | 'feature_used'
  | 'admin_action'; // Added for Admin specific logs

interface TelemetryPayload {
  [key: string]: any;
}

// Internal state to track the current user for logging
let currentTelemetryUser: string | null = null;

export const setTelemetryUser = (user: string | null) => {
  currentTelemetryUser = user;
};

const getSessionId = () => {
  let sid = sessionStorage.getItem('medexam_sid');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('medexam_sid', sid);
  }
  return sid;
};

export const logEvent = async (event: TelemetryEvent, payload: TelemetryPayload = {}) => {
  const sessionId = getSessionId();
  const timestamp = new Date().toISOString();

  const data = {
    sessionId,
    userId: currentTelemetryUser || 'anonymous', // Automatically attach user
    timestamp,
    event,
    payload,
    userAgent: navigator.userAgent,
    screenSize: `${window.innerWidth}x${window.innerHeight}`
  };

  // 1. Always log to console in development
  if (!TELEMETRY_ENDPOINT) {
    console.debug(`[Telemetry] [${currentTelemetryUser || 'anon'}] ${event}`, payload);
    return;
  }

  // 2. Send to Google Sheet
  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors', 
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error("Failed to send telemetry", err);
  }
};