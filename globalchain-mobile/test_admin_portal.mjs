import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://aimvbfrwpwsyowbmtdzr.supabase.co';
const publishableKey = 'sb_publishable_JARm9_UvdHLo3uOyfQ18QQ_OU6neIZy';

const supabase = createClient(supabaseUrl, publishableKey);

async function run() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'nmokshasai7@gmail.com',
    password: '111111',
  });

  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }

  console.log('Auth success! User ID:', authData.user.id);
  console.log('Session token:', authData.session.access_token);

  // Let's test direct Supabase SELECT queries as this user (under RLS)
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, is_approved');

  console.log('Direct select profiles:', profiles || pErr);

  const { data: userRoles, error: rErr } = await supabase
    .from('user_roles')
    .select('*');

  console.log('Direct select user_roles:', userRoles || rErr);
}

run();
