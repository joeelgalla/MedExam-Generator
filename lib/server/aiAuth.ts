import type {VercelRequest,VercelResponse} from '@vercel/node';
import {createClient} from '@supabase/supabase-js';
// Verify remotely; never trust a decoded token or browser-supplied identity.
export async function requireAIUser(req:VercelRequest,res:VercelResponse):Promise<boolean> {
  const header=req.headers?.authorization;
  if(typeof header!=='string'||!header.startsWith('Bearer ')){res.status(401).json({error:'Sign in to use built-in AI. Importing exams does not require AI access.'});return false;}
  const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if(!url||!key){res.status(503).json({error:'AI authentication is not configured. Use an imported exam while this is resolved.'});return false;}
  try {
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data:{user},error}=await client.auth.getUser(header.slice(7));
    if(error||!user||user.is_anonymous){res.status(401).json({error:'Your sign-in expired. Sign in again before using AI.'});return false;}
    // Joe opened built-in AI to all signed-in accounts on 2026-11-08.
    // Remote token verification still applies; no owner allowlist is required.
    return true;
  } catch {res.status(503).json({error:'Unable to verify your account. Try again shortly.'});return false;}
}
