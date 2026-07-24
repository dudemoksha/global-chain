import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const getEnv = (key) => {
  const match = env.match(new RegExp(`^${key}=(?:"([^"]+)"|'([^']+)'|([^\\r\\n]+))`, 'm'));
  return match ? (match[1] || match[2] || match[3]) : null;
};

const url = getEnv('SUPABASE_URL');
const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

async function main() {
  // Find Test user
  const { data: profiles } = await supabase.from('profiles').select('*').ilike('legal_name', '%test%');
  console.log('Profiles matching Test:', profiles);

  if (profiles && profiles.length > 0) {
    const testUser = profiles[0];
    
    // Find trade requests from or to Test
    const { data: reqs } = await supabase.from('trade_requests').select('*').or(`from_user_id.eq.${testUser.id},to_user_id.eq.${testUser.id}`);
    console.log('Trade requests:', reqs);

    // Find suppliers for Test
    const { data: sups } = await supabase.from('suppliers').select('*').eq('owner_id', testUser.id);
    console.log('Suppliers for Test:', sups);
  }
}
main();
