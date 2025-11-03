import { createClient } from '@supabase/supabase-js';

// Replace these with your actual Supabase project credentials
// Get them from: https://app.supabase.com/project/_/settings/api
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Check if credentials are configured
if (supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY') {
  console.warn('⚠️ SUPABASE NOT CONFIGURED: Please create .env file with your credentials');
  console.warn('📝 See QUICK_START.md for setup instructions');
} else {
  console.log('🔌 Supabase client initialized');
  console.log('📍 Project URL:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

