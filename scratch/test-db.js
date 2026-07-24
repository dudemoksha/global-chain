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
  const { data, error } = await supabase.from('inventory_items').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Fields:', Object.keys(data[0] || {}));
  }
}
main();
