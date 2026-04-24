// Edge Function: admin-write
// Auth: JWT de Supabase Auth (Bearer token). Nunca maneja passwords.
// Usa service_role para escribir, bypasseando RLS.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const CORS = {
  'Access-Control-Allow-Origin': 'https://amauta-research.vercel.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON   = Deno.env.get('SUPABASE_ANON_KEY')!;

// Cliente admin (service_role) — bypasea RLS para escrituras
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function verifyJWT(token: string): Promise<boolean> {
  // Verifica el JWT creando un cliente anon con el token del usuario
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  return !error && user !== null;
}

type Action =
  | 'create_instrument'
  | 'update_instrument'
  | 'delete_instrument'
  | 'upsert_block'
  | 'delete_block';

const INSTRUMENT_FIELDS = [
  'id', 'ticker', 'name', 'type', 'category', 'status',
  'tv_symbol', 'price', 'change_text', 'change_dir', 'updated_text',
  'top_metrics', 'tabs', 'sort_order',
] as const;

function pick<T extends object>(obj: T, keys: readonly (keyof T)[]) {
  const out: Partial<T> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Verificar JWT desde Authorization header
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || !(await verifyJWT(token))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const { action, payload } = body || {};
  if (!action || !payload) return json({ error: 'missing action/payload' }, 400);

  try {
    switch (action as Action) {
      case 'create_instrument': {
        const data = pick(payload, INSTRUMENT_FIELDS);
        if (!data.id || !data.ticker || !data.name) return json({ error: 'id, ticker, name requeridos' }, 400);
        const { data: row, error } = await admin.from('instruments').insert(data).select().single();
        if (error) throw error;
        return json({ ok: true, instrument: row });
      }
      case 'update_instrument': {
        const data = pick(payload, INSTRUMENT_FIELDS);
        if (!data.id) return json({ error: 'id requerido' }, 400);
        const { id, ...rest } = data;
        const { data: row, error } = await admin.from('instruments').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        return json({ ok: true, instrument: row });
      }
      case 'delete_instrument': {
        if (!payload.id) return json({ error: 'id requerido' }, 400);
        const { error } = await admin.from('instruments').delete().eq('id', payload.id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'upsert_block': {
        const b = payload;
        if (!b.instrument_id || b.tab_index === undefined || !b.block_type) {
          return json({ error: 'instrument_id, tab_index, block_type requeridos' }, 400);
        }
        const row = {
          id: b.id,
          instrument_id: b.instrument_id,
          tab_index: b.tab_index,
          block_order: b.block_order ?? 10,
          block_type: b.block_type,
          data: b.data ?? {},
        };
        if (!row.id) delete (row as any).id;
        const { data: saved, error } = await admin.from('instrument_blocks').upsert(row).select().single();
        if (error) throw error;
        return json({ ok: true, block: saved });
      }
      case 'delete_block': {
        if (!payload.id) return json({ error: 'id requerido' }, 400);
        const { error } = await admin.from('instrument_blocks').delete().eq('id', payload.id);
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: (err as Error).message || 'server error' }, 500);
  }
});
