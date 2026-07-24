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
  const { data: prof } = await supabase.from('profiles').select('*').eq('id', '1dd32a9a-546c-45f8-8107-6dc131f6df24').single();
  console.log('Varma Profile:', prof);

  if (prof) {
    const norm = prof.legal_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const { data: org } = await supabase.from('organizations').select('*').eq('name_norm', norm).maybeSingle();
    console.log('Varma Org (by name_norm):', org);
  }
}
main();
