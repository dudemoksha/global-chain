import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const getEnv = (key) => {
  const match = env.match(new RegExp(`^${key}=(?:"([^"]+)"|'([^']+)'|([^\\r\\n]+))`, 'm'));
  return match ? (match[1] || match[2] || match[3]) : null;
};

const url = getEnv('SUPABASE_URL');
const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAdmin = createClient(url, key);

async function main() {
  const reqId = '14054fb7-8b92-4d6d-8ad5-90cccb82745e';
  const { data: req, error: rErr } = await supabaseAdmin
    .from("trade_requests")
    .select("*")
    .eq("id", reqId)
    .single();

  if (rErr) {
    console.error('Error fetching request:', rErr);
    return;
  }
  
  console.log('Fetched request:', req);

  const buyerUserId  = req.direction === "buy" ? req.from_user_id : req.to_user_id;
  const sellerUserId = req.direction === "buy" ? req.to_user_id : req.from_user_id;
  let sellerOrgId = req.direction === "buy" ? req.to_org_id : req.from_org_id;

  console.log({ buyerUserId, sellerUserId, sellerOrgId });

  if (buyerUserId && sellerOrgId) {
    const insertData = {
      owner_id: buyerUserId,
      supplier_org_id: sellerOrgId,
      category: req.category || "",
      criticality: "medium",
      annual_spend_bucket: "",
      product: req.product || "",
      notes: req.product
        ? `Auto-linked via trade request: ${req.product}${req.quantity ? ` × ${req.quantity}` : ""}`
        : "Auto-linked via accepted trade request",
    };
    
    console.log('Attempting insert with:', insertData);
    
    const { data: insData, error: insErr } = await supabaseAdmin
      .from("suppliers")
      .insert(insertData)
      .select();

    if (insErr) {
      console.error('Insert error:', insErr);
    } else {
      console.log('Successfully inserted supplier:', insData);
    }
  }
}
main();
