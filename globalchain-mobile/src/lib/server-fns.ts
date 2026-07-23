import { supabase } from '../supabase';

const VERCEL_BASE = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  (window.location.port === '5173' || window.location.port === '5174')
  ? '' 
  : 'https://global-supply-chain-two.vercel.app';

// Constant hashes for TanStack Start server functions
export const SERVER_FN_HASHES = {
  addSupplier: '081239670b9f1011f56135cb927ee25ea458e2c3e901da8c2804e3e1d83ee0a3',
  askAssistant: 'a25da347868e1aa3590e1280af68cec37d48865abed05dc6d83b2e090c30c963',
  syncAlerts: '982046edcc7af05006b405d617d51915a84a1df739df4e034b595fa07938832e',
  getLiveEvents: '9148e599c46444969ec0aaefbf8c902ba6f7d94fe21c84cfe2cf09bf4d05e2c2',
  platformStats: '6d763e05bd5853ae255f3cf578d49d36ad4d93f916851485210bb2b683c37428',
  listAllProfiles: '0c3063ac2b3399399328f599971bca615bb2e9705d8f0aae08e43f62706f29ee',
  decideProfile: '4cd8fc7253b3409d68324f78288a221f581ed3a930ee16888dc39dfab3db5962',
  setCompanyStatus: 'cc4a8f377300481db404e5cef45046dbea59bc8c941d1ca90ba5118aa83f3cfa',
  listAuditLogs: '775721d220476296bc72ca17a9898845ef187368bc2dc44a284a90c53297939b',
  adminListUsers: '75a41eaad6e8e420ff959bd09f5f09676e4cb6e6827615b69002573eecffdcbe',
  adminCreateUser: '7cdf308c08cefa76b5aff91881d47d0a7c38e57c538ac8578cbcc0b0323f57c2',
  adminUpdateUser: '7e44cff770ce63c7f54ff4f42a5f1198b6c13b6bb706edd2e84253ce3272ea47',
  adminDeleteUser: '31cd0087befaea9f28691dcd70f4a21113aea1822989cc6cf42e905d3993bf14',
  adminSetPassword: '0d0c07a65c0857a08946e2697199515335f20099bc56aa4650be6a1beb0700ce',
  adminGetUserActivity: '5cc5c792fb99be447abe52ebf3e9f9e8d8c2ba8fc82bf1abe4e4d3efcbda9e6d',
  registerUser: '47ca9349fd6aefbcec5cf48293d884aef31ebab48cb67d61e3bc4c8c3b7321f0',
  searchOrganizations: 'fba221fe137e8fc4a987237ba7c871660765fbb174aab8bc4b61a98f3a8b89cc',
  recommendAlternatives: '7954a530c1aabf88ff780a1a3aa9b803f6e6f628375ebf04464cd5b63cc02543',
  requestPasswordReset: '84868fbbca6328aa5d928baae22c77b1b1342d4bb427ba1a0332c810d5a9872e',
  listPasswordResetRequests: '592cf381a5308833f79b018ae3c32cc2965131525b7524fb2659a64b44e9b51f',
  approvePasswordResetRequest: '5edc8a68ed35d3c7d0f4efdf5c754cda8ac78c601ab0a5b33e7588911aafdbec',
  rejectPasswordResetRequest: '2631d60a26df60bd92568d5409d5054ffc9856fc043bcbbad76b065d9821e0d9',
  getInventoryRisks: '44999d1b70bfc143c30ba7087800920412f8644a6c67bd546d073214a674954d',
  listOrgProducts: '80092a32e1dfbd7b601c9fd5a9018dc9cf6ac370b4fa7f09c308e655fadf2256',
  sendTradeRequest: '7625d7146703065f5a8839566c780a62505c8886de344fad98515f9f25716393',
};

function serializeToSeroval(value: any): any {
  let idCounter = 0;
  
  function serialize(val: any): any {
    if (val === true) return { t: 2, s: 2 };
    if (val === false) return { t: 2, s: 3 };
    if (val === null) return { t: 2, s: 0 };
    if (val === undefined) return { t: 2, s: 1 };
    
    const type = typeof val;
    if (type === 'string') {
      return { t: 1, s: val };
    }
    if (type === 'number') {
      return { t: 0, s: val };
    }
    if (type === 'boolean') {
      return { t: 2, s: val ? 2 : 3 };
    }
    
    if (Array.isArray(val)) {
      const id = idCounter++;
      const node: any = {
        t: 9,
        i: id,
        a: [],
        o: 0
      };
      node.a = val.map(item => serialize(item));
      return node;
    }
    
    if (type === 'object') {
      const id = idCounter++;
      const keys = Object.keys(val);
      const node: any = {
        t: 10,
        i: id,
        p: {
          k: keys,
          v: []
        },
        o: 0
      };
      node.p.v = keys.map(key => serialize(val[key]));
      return node;
    }
    
    return { t: 1, s: String(val) };
  }

  return {
    t: serialize(value),
    f: 63,
    m: []
  };
}

function deserializeSeroval(serialized: any): any {
  if (!serialized || typeof serialized !== 'object') return serialized;
  let rootNode = serialized;
  if ('t' in serialized && 'f' in serialized && 'm' in serialized) {
    rootNode = serialized.t;
  }
  if (typeof rootNode.t !== 'number') return serialized;
  
  const refs = new Map<number, any>();
  
  function decode(node: any): any {
    if (!node || typeof node !== 'object') return node;
    
    switch (node.t) {
      case 0:
        return Number(node.s);
      case 1:
        return node.s;
      case 2:
        if (node.s === 0) return null;
        if (node.s === 1) return undefined;
        if (node.s === 2) return true;
        if (node.s === 3) return false;
        return node.s;
      case 9: {
        const arr: any[] = [];
        refs.set(node.i, arr);
        node.a.forEach((item: any, idx: number) => {
          arr[idx] = decode(item);
        });
        return arr;
      }
      case 10: {
        const obj: any = {};
        refs.set(node.i, obj);
        const keys = node.p.k;
        const vals = node.p.v;
        keys.forEach((key: string, idx: number) => {
          obj[key] = decode(vals[idx]);
        });
        return obj;
      }
      case 4:
        return refs.get(node.i);
      default:
        return node;
    }
  }
  
  return decode(rootNode);
}

async function callServerFn(hash: string, payload: any = {}, method: 'GET' | 'POST' = 'POST') {
  // Get active session token (optional, e.g. not needed for public signup registerUser)
  const { data: { session } } = await supabase.auth.getSession();

  const url = `${VERCEL_BASE}/_serverFn/${hash}`;
  const options: RequestInit = {
    method,
    headers: {
      'x-tsr-serverFn': 'true',
      'accept': 'application/x-tss-framed, application/x-ndjson, application/json',
    }
  };

  if (session) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${session.access_token}`,
    };
  }

  if (method === 'POST') {
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json',
    };
    // Automatically wrap flat payload inside a 'data' key if not already wrapped
    const normalizedPayload = payload && typeof payload === 'object' && 'data' in payload
      ? payload
      : { data: payload };
    const serovalPayload = serializeToSeroval(normalizedPayload);
    options.body = JSON.stringify(serovalPayload);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    let message = 'Server function call failed';
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.error || message;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }

  const text = await response.text();
  try {
    let json;
    if (text.startsWith('{"') || text.startsWith('[')) {
      json = JSON.parse(text);
    } else {
      const clean = text.replace(/^[a-zA-Z0-9]+:/, '');
      json = JSON.parse(clean);
    }
    const deserialized = deserializeSeroval(json);
    if (deserialized && typeof deserialized === 'object' && 'result' in deserialized) {
      if (deserialized.error) {
        throw new Error(deserialized.error.message || deserialized.error || 'Server function error');
      }
      return deserialized.result;
    }
    return deserialized;
  } catch (err: any) {
    throw new Error(text || err.message || 'Failed to parse server function response');
  }
}

// 1. Add supplier (delegates to server to upsert organization via service role)
export const addSupplier = async (data: {
  legal_name: string;
  country?: string;
  industry?: string;
  category?: string;
  criticality?: 'low' | 'medium' | 'high' | 'critical';
  annual_spend_bucket?: string;
  lead_time_days?: number | null;
  notes?: string;
}) => {
  return callServerFn(SERVER_FN_HASHES.addSupplier, data);
};

// 2. Ask Copilot Assistant (delegates to server to call LLM APIs)
export const askAssistant = async (data: {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}) => {
  return callServerFn(SERVER_FN_HASHES.askAssistant, data);
};

// 3. Sync and ingest GDELT/USGS alerts
export const syncAlerts = async () => {
  return callServerFn(SERVER_FN_HASHES.syncAlerts, {});
};

// 4. Fetch live global risk events
export const getLiveEvents = async () => {
  return callServerFn(SERVER_FN_HASHES.getLiveEvents, {}, 'GET');
};

// 5. Admin functions
export const getPlatformStats = async () => {
  return callServerFn(SERVER_FN_HASHES.platformStats, {}, 'GET');
};

export const listAllProfiles = async () => {
  return callServerFn(SERVER_FN_HASHES.listAllProfiles, {}, 'GET');
};

export const decideProfile = async (data: { userId: string; decision: 'approve' | 'reject'; reason?: string }) => {
  return callServerFn(SERVER_FN_HASHES.decideProfile, data);
};

export const setCompanyStatus = async (data: { userId: string; status: 'active' | 'suspended'; reason?: string }) => {
  return callServerFn(SERVER_FN_HASHES.setCompanyStatus, data);
};

export const listAuditLogs = async () => {
  return callServerFn(SERVER_FN_HASHES.listAuditLogs, {}, 'GET');
};

export const adminListUsers = async () => {
  return callServerFn(SERVER_FN_HASHES.adminListUsers, {}, 'GET');
};

export const adminCreateUser = async (data: any) => {
  return callServerFn(SERVER_FN_HASHES.adminCreateUser, data);
};

export const adminUpdateUser = async (data: any) => {
  return callServerFn(SERVER_FN_HASHES.adminUpdateUser, data);
};

export const adminDeleteUser = async (data: { userId: string }) => {
  return callServerFn(SERVER_FN_HASHES.adminDeleteUser, data);
};

export const adminSetPassword = async (data: any) => {
  return callServerFn(SERVER_FN_HASHES.adminSetPassword, data);
};

export const adminGetUserActivity = async (data: { userId: string }) => {
  return callServerFn(SERVER_FN_HASHES.adminGetUserActivity, data);
};

export const registerUser = async (data: any) => {
  return callServerFn(SERVER_FN_HASHES.registerUser, data);
};

export const searchOrganizations = async (data: { q: string }) => {
  return callServerFn(SERVER_FN_HASHES.searchOrganizations, data);
};

export const recommendAlternatives = async (data: {
  industry?: string;
  category?: string;
  avoid_country?: string;
  exclude_org_id?: string | null;
  limit?: number;
}) => {
  return callServerFn(SERVER_FN_HASHES.recommendAlternatives, data);
};

export const requestPasswordReset = async (data: { email: string }) => {
  return callServerFn(SERVER_FN_HASHES.requestPasswordReset, data);
};

export const listPasswordResetRequests = async () => {
  return callServerFn(SERVER_FN_HASHES.listPasswordResetRequests, {}, 'GET');
};

export const approvePasswordResetRequest = async (data: { requestId: string; tempPassword: string }) => {
  return callServerFn(SERVER_FN_HASHES.approvePasswordResetRequest, data);
};

export const rejectPasswordResetRequest = async (data: { requestId: string }) => {
  return callServerFn(SERVER_FN_HASHES.rejectPasswordResetRequest, data);
};

export const getInventoryRisks = async () => {
  return callServerFn(SERVER_FN_HASHES.getInventoryRisks, {}, 'GET');
};

export const listOrgProducts = async (data: { org_id: string }) => {
  return callServerFn(SERVER_FN_HASHES.listOrgProducts, data);
};

export const sendTradeRequest = async (data: {
  to_org_id: string;
  direction: 'buy' | 'sell';
  product: string;
  quantity?: string;
  category?: string;
  message?: string;
}) => {
  return callServerFn(SERVER_FN_HASHES.sendTradeRequest, data);
};
