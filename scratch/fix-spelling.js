import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    envVars[key] = value;
  }
});

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("Fixing 'Inida' spelling to 'India'...");

  // Update organizations
  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .update({ country: 'India' })
    .ilike('country', 'inida')
    .select();
  if (orgErr) console.error("Error organizations:", orgErr);
  else console.log(`Updated ${orgs?.length || 0} organizations.`);

  // Update profiles
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .update({ hq_country: 'India' })
    .ilike('hq_country', 'inida')
    .select();
  if (profErr) console.error("Error profiles:", profErr);
  else console.log(`Updated ${profiles?.length || 0} profiles.`);

  // Update warehouses
  const { data: warehouses, error: whErr } = await supabase
    .from('warehouses')
    .update({ country: 'India' })
    .ilike('country', 'inida')
    .select();
  if (whErr) console.error("Error warehouses:", whErr);
  else console.log(`Updated ${warehouses?.length || 0} warehouses.`);

  console.log("Completed!");
}

main().catch(console.error);
