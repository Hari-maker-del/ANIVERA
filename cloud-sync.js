(() => {
  const SUPABASE_URL = 'https://qbwulpofftxfddlykcxg.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_WIK4IibkopTrZ3-kL9OBwg_ll7QqecZ';
  const STORAGE_KEY = 'anivera-demo-v1';
  let client = null, syncing = false;
  const style = document.createElement('style');
  style.textContent = '#cloud-panel{position:fixed;right:18px;bottom:18px;z-index:1000;width:min(360px,calc(100vw - 36px));background:#fff;border:1px solid #e1e2e2;border-radius:16px;padding:18px;box-shadow:0 12px 40px #1d222826;color:#1d2228;font:14px system-ui}#cloud-panel h3{margin:0 0 8px;font-size:17px}#cloud-panel p{font-size:12px;line-height:1.5;color:#5d6268;margin:8px 0}#cloud-panel input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d5d7d8;border-radius:8px;margin:5px 0}#cloud-panel button{border:0;border-radius:8px;padding:10px 12px;margin:5px 4px 0 0;background:#fb8122;color:#fff;font-weight:600;cursor:pointer}#cloud-panel button.secondary{background:#1d2228}#cloud-status{font-size:12px;color:#535960;margin-top:8px}';
  document.head.appendChild(style);
  const panel = document.createElement('section');
  panel.id = 'cloud-panel';
  panel.innerHTML = '<h3>ANIVERA Cloud Sync</h3><p>Sign in to sync your workspace across devices. Use a strong password. Sample records will be uploaded only if this account has no saved workspace.</p><form id="cloud-auth"><input name="email" type="email" placeholder="Email address" required autocomplete="email"><input name="password" type="password" placeholder="Password (minimum 8 characters)" required minlength="8" autocomplete="current-password"><button type="submit">Sign in</button><button type="button" id="cloud-signup" class="secondary">Create account</button></form><div id="cloud-status">Not connected · Local demo remains available.</div><button id="cloud-signout" class="secondary" hidden>Sign out</button>';
  document.body.appendChild(panel);
  const status = msg => { const el = document.getElementById('cloud-status'); if (el) el.textContent = msg; };
  const loadSdk = () => new Promise((resolve, reject) => {
    if (window.supabase) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
  async function init() {
    try {
      await loadSdk();
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data } = await client.auth.getSession();
      if (data.session) await signedIn(data.session.user);
    } catch (e) { status('Could not load cloud connection. Local demo still works.'); }
  }
  async function signedIn(user) {
    status('Loading your cloud workspace…');
    const { data, error } = await client.from('workspace_snapshots').select('data').eq('owner_id', user.id).maybeSingle();
    if (error) { status('Cloud read failed: ' + error.message); return; }
    if (data && data.data && Array.isArray(data.data.animals)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.data));
      status('Cloud workspace loaded · ' + user.email + '. Reloading…');
      location.reload(); return;
    }
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const { error: writeError } = await client.from('workspace_snapshots').upsert({ owner_id: user.id, data: local, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' });
    if (writeError) { status('Initial cloud save failed: ' + writeError.message); return; }
    activateSync(user);
    status('Connected · Initial workspace saved for ' + user.email);
  }
  function activateSync(user) {
    if (syncing) return; syncing = true;
    document.getElementById('cloud-auth').hidden = true;
    document.getElementById('cloud-signout').hidden = false;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      original.call(this, key, value);
      if (key !== STORAGE_KEY || !client || !syncing) return;
      let data; try { data = JSON.parse(value); } catch (_) { return; }
      clearTimeout(window.__aniveraSyncTimer);
      window.__aniveraSyncTimer = setTimeout(async () => {
        const { error } = await client.from('workspace_snapshots').upsert({ owner_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' });
        status(error ? 'Local changes saved; cloud sync failed: ' + error.message : 'Synced to cloud · ' + new Date().toLocaleTimeString());
      }, 700);
    };
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) { syncing = false; location.reload(); }
    });
  }
  document.getElementById('cloud-auth').addEventListener('submit', async e => {
    e.preventDefault(); if (!client) return status('Cloud client is still loading.');
    const fd = new FormData(e.currentTarget), email = fd.get('email'), password = fd.get('password');
    status('Signing in…');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return status(error.message);
    await signedIn(data.user);
  });
  document.getElementById('cloud-signup').addEventListener('click', async () => {
    if (!client) return status('Cloud client is still loading.');
    const form = document.getElementById('cloud-auth'), email = form.elements.email.value, password = form.elements.password.value;
    if (!email || password.length < 8) return status('Enter an email and a password with at least 8 characters.');
    status('Creating account…');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return status(error.message);
    if (!data.session) return status('Account created. Check your email to confirm it, then sign in.');
    await signedIn(data.user);
  });
  document.getElementById('cloud-signout').addEventListener('click', async () => { if (client) { status('Signing out…'); await client.auth.signOut(); } });
  init();
})();