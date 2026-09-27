
export const APP_NAME = "MedExam Generator";

// TELEMETRY CONFIGURATION
// To monitor usage automatically:
// 1. Create a Google Sheet > Extensions > Apps Script.
// 2. Paste a simple doPost(e) script to append rows.
// 3. Deploy as Web App (Execute as: Me, Who has access: Anyone).
// 4. Paste the 'Current web app URL' below.
export const TELEMETRY_ENDPOINT = "https://script.google.com/macros/s/AKfycbwc1e4uWf_vt-72eNmfg5XPntQVNzXazPdEKCrTweXQm8iedvuaI1H7BCK2gGb-XlJL/exec";

export { SYSTEM_INSTRUCTION as SYSTEM_INSTRUCTION_BASE } from './lib/examRules';
