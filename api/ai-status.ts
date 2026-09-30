import type {VercelRequest,VercelResponse} from '@vercel/node';
import {requireAIUser} from '../lib/server/aiAuth.js';
import {aiDisabled} from '../lib/server/aiPolicy.js';
// Availability check only: no Gemini request, tokens or generation cost.
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(aiDisabled(process.env))return res.status(503).json({error:'AI generation is unavailable in this preview. Imported exams still work.'});
  if(!(await requireAIUser(req,res)))return;
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'The app owner needs to configure Gemini before exams can be generated.'});
  return res.status(200).json({available:true});
}
