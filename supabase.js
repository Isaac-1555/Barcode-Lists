const SUPABASE_URL = 'https://jahcgdgmdasrhzcuynkw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphaGNnZGdtZGFzcmh6Y3V5bmt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzI3NDcsImV4cCI6MjA5MDU0ODc0N30.GfErij5lvZIsvGhSq4WsIf-AEhugNXw02nzgQXx5xHw';

let supabaseClient = null;

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

async function hashPassword(password) {
  return simpleHash(password);
}

async function login(storeNumber, password) {
  const passwordHash = await hashPassword(password);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/stores?store_number=eq.${encodeURIComponent(storeNumber)}&select=*&limit=1`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    console.error('Login error:', response.status, data);
    throw new Error(`Server error: ${response.status}`);
  }

  let storeId;

  if (data && data.length > 0) {
    if (data[0].password_hash !== passwordHash) {
      throw new Error('Invalid password');
    }
    storeId = data[0].id;
  } else {
    const createResponse = await fetch(`${SUPABASE_URL}/rest/v1/stores`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        store_number: storeNumber,
        password_hash: passwordHash
      })
    });

    if (!createResponse.ok) {
      throw new Error('Failed to create account');
    }

    const newStore = await createResponse.json();
    storeId = newStore[0]?.id || newStore.id;
  }

  const session = {
    storeNumber,
    storeId,
    passwordHash
  };

  await chrome.storage.session.set({ supabaseSession: session });

  return session;
}

async function logout() {
  await chrome.storage.session.remove('supabaseSession');
}

async function getSession() {
  const result = await chrome.storage.session.get('supabaseSession');
  return result.supabaseSession || null;
}

async function isOnline() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/stores?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function syncFromRemote(session) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/barcodes?store_id=eq.${session.storeId}&select=*&order=created_at`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch data');
  }

  const barcodes = await response.json();

  const categories = {};
  const categoryOrder = [];

  barcodes.forEach(b => {
    if (!categories[b.category_name]) {
      categories[b.category_name] = [];
      categoryOrder.push(b.category_name);
    }
    if (!categories[b.category_name].includes(b.barcode_value)) {
      categories[b.category_name].push(b.barcode_value);
    }
  });

  return {
    categoryOrder,
    categories,
    active: categoryOrder[0] || null
  };
}

async function syncToRemote(session, state) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/stores?id=eq.${session.storeId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        updated_at: new Date().toISOString()
      })
    }
  );

  await fetch(
    `${SUPABASE_URL}/rest/v1/barcodes?store_id=eq.${session.storeId}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  const insertData = [];
  state.categoryOrder.forEach(categoryName => {
    const barcodes = state.categories[categoryName] || [];
    barcodes.forEach(barcode => {
      insertData.push({
        store_id: session.storeId,
        category_name: categoryName,
        barcode_value: barcode
      });
    });
  });

  if (insertData.length > 0) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/barcodes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(insertData)
    });

    if (!response.ok) {
      throw new Error('Failed to save data');
    }
  }
}
