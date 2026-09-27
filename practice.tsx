import React from 'react';
import { createRoot } from 'react-dom/client';
import PrivatePractice from './components/PrivatePractice';
import './.generated/practice.css';

// Separate entry: no cloud app, Supabase, telemetry, document parsers or AI client.
createRoot(document.getElementById('root')!).render(<React.StrictMode><PrivatePractice /></React.StrictMode>);
