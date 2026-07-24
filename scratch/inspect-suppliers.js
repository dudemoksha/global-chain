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
  console.log("Listing suppliers...");
  const { data: sups, error } = await supabase
    .from('suppliers')
    .select(`
      id, owner_id, category, criticality, product, supplier_org_id,
      organizations:supplier_org_id ( id, display_name, country, industry )
    `);
  if (error) {
    console.error("Error fetching suppliers:", error);
    return;
  }
  console.log(JSON.stringify(sups, null, 2));
}

main().catch(console.error);
