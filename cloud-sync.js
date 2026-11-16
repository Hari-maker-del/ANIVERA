(function (globalScope) {
  "use strict";
  var SUPABASE_URL = "https://qbwulpofftxfddlykcxg.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WIK4IibkopTRZ3-kL9OBwg_ll7QqecZ";
  var client = null;
  var session = null;
  var workspace = { profiles: [], healthRecords: [], careTasks: [], events: [], snapshots: [] };
  var initialized = false;
  var saveQueue = Promise.resolve();

  function userView(user) {
    if (!user) return null;
    var displayName = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.display_name)) || user.email || "ANIVERA User";
    return { id: user.id, email: user.email, displayName: displayName, fullName: displayName };
  }
  function resultError(error) {
    return { ok: false, code: error && error.code ? error.code : "SUPABASE_ERROR", error: error && error.message ? error.message : "Supabase request failed." };
  }
  function getSession() {
    return session ? { ok: true, session: { user: userView(session.user), access_token: session.access_token }, status: "ACTIVE" } :
      { ok: false, session: null, status: "SIGNED_OUT", error: "Sign in with your ANIVERA account to access your workspace." };
  }
  async function loadWorkspace() {
    if (!client || !session) {
      workspace = { profiles: [], healthRecords: [], careTasks: [], events: [], snapshots: [] };
      return { ok: false, code: "SIGNED_OUT", data: workspace };
    }
    var uid = session.user.id;
    var response = await client.from("workspace_snapshots").select("data,updated_at").eq("owner_id", uid).maybeSingle();
    if (response.error) return resultError(response.error);
    if (response.data && response.data.data) {
      var saved = response.data.data;
      workspace = {
        profiles: Array.isArray(saved.profiles) ? saved.profiles : [],
        healthRecords: Array.isArray(saved.healthRecords) ? saved.healthRecords : [],
        careTasks: Array.isArray(saved.careTasks) ? saved.careTasks : [],
        events: Array.isArray(saved.events) ? saved.events : [],
        snapshots: Array.isArray(saved.snapshots) ? saved.snapshots : []
      };
    } else {
      workspace = { profiles: [], healthRecords: [], careTasks: [], events: [], snapshots: [] };
    }
    return { ok: true, owner_id: uid, user: userView(session.user), data: workspace, updated_at: response.data && response.data.updated_at };
  }
  async function initialize() {
    if (!globalScope.supabase || !globalScope.supabase.createClient) {
      return { ok: false, code: "SUPABASE_SDK_MISSING", error: "Supabase client library did not load." };
    }
    if (!client) {
      client = globalScope.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      client.auth.onAuthStateChange(function (_event, nextSession) {
        session = nextSession;
        if (!nextSession) {
          workspace = { profiles: [], healthRecords: [], careTasks: [], events: [], snapshots: [] };
        }
      });
    }
    var auth = await client.auth.getSession();
    if (auth.error) return resultError(auth.error);
    session = auth.data.session;
    initialized = true;
    if (session) return await loadWorkspace();
    workspace = { profiles: [], healthRecords: [], careTasks: [], events: [], snapshots: [] };
    return { ok: false, code: "SIGNED_OUT", data: workspace };
  }
  async function signIn(credentials) {
    if (!client) await initialize();
    var response = await client.auth.signInWithPassword({
      email: String(credentials.email || "").trim().toLowerCase(),
      password: String(credentials.password || "")
    });
    if (response.error) return resultError(response.error);
    session = response.data.session;
    var loaded = await loadWorkspace();
    if (!loaded.ok) return loaded;
    return { ok: true, session: { user: userView(session.user) }, data: loaded.data };
  }
  async function signUp(payload) {
    if (!client) await initialize();
    var email = String(payload.email || "").trim().toLowerCase();
    var password = String(payload.password || "");
    if (password.length < 8) return { ok: false, code: "WEAK_PASSWORD", error: "Password must contain at least 8 characters." };
    var displayName = String(payload.fullName || payload.displayName || "").trim();
    var response = await client.auth.signUp({
      email: email,
      password: password,
      options: { data: { full_name: displayName, organization: String(payload.organization || "") } }
    });
    if (response.error) return resultError(response.error);
    session = response.data.session;
    if (!session) return { ok: true, confirmationRequired: true, message: "Check your email to confirm your ANIVERA account, then sign in." };
    var loaded = await loadWorkspace();
    if (!loaded.ok) return loaded;
    return { ok: true, session: { user: userView(session.user) }, data: loaded.data };
  }
  async function signOut() {
    if (!client) return { ok: true };
    var response = await client.auth.signOut();
    if (response.error) return resultError(response.error);
    session = null;
    workspace = { profiles: [], healthRecords: [], careTasks: [], events: [], snapshots: [] };
    return { ok: true, status: "SIGNED_OUT" };
  }
  function getOwnerScopedWorkspace() {
    if (!session) return { ok: false, code: "SIGNED_OUT", data: workspace };
    return { ok: true, owner_id: session.user.id, user: userView(session.user), data: workspace };
  }
  function saveOwnerScopedWorkspace(nextWorkspace) {
    if (!client || !session) return Promise.resolve({ ok: false, code: "SIGNED_OUT", error: "Sign in before saving workspace data." });
    var ownerId = session.user.id;
    workspace = {
      profiles: Array.isArray(nextWorkspace.profiles) ? nextWorkspace.profiles : [],
      healthRecords: Array.isArray(nextWorkspace.healthRecords) ? nextWorkspace.healthRecords : [],
      careTasks: Array.isArray(nextWorkspace.careTasks) ? nextWorkspace.careTasks : [],
      events: Array.isArray(nextWorkspace.events) ? nextWorkspace.events : [],
      snapshots: Array.isArray(nextWorkspace.snapshots) ? nextWorkspace.snapshots : []
    };
    var payload = JSON.parse(JSON.stringify(workspace));
    saveQueue = saveQueue.catch(function () {}).then(async function () {
      if (!session || session.user.id !== ownerId) throw new Error("Session changed before the workspace save completed.");
      var response = await client.from("workspace_snapshots").upsert({
        owner_id: ownerId,
        data: payload,
        updated_at: new Date().toISOString()
      }, { onConflict: "owner_id" });
      if (response.error) throw response.error;
      return { ok: true };
    });
    return saveQueue.catch(function (error) { return resultError(error); });
  }
  async function createSnapshot(label) {
    var snap = { id: (globalScope.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()), snapshot_label: label, created_at: new Date().toISOString(), record_counts: { profiles: workspace.profiles.length, health: workspace.healthRecords.length, tasks: workspace.careTasks.length, events: workspace.events.length } };
    workspace.snapshots = [snap].concat(workspace.snapshots || []);
    var saved = await saveOwnerScopedWorkspace(workspace);
    return saved.ok ? { ok: true, snapshot: snap } : saved;
  }
  async function probeSupabaseConnection() {
    if (!client) await initialize();
    var auth = await client.auth.getSession();
    if (auth.error) return resultError(auth.error);
    return { ok: true, mode: auth.data.session ? "SUPABASE_AUTHENTICATED" : "SUPABASE_CONNECTED_SIGNED_OUT", url: SUPABASE_URL, message: auth.data.session ? "Supabase is connected and an authenticated session is active." : "Supabase is reachable. Sign in to access private workspace data." };
  }
  globalScope.AniveraCloudSync = {
    SUPABASE_URL: SUPABASE_URL,
    TABLES: ["workspace_snapshots"],
    initialize: initialize,
    getSession: getSession,
    getOwnerScopedWorkspace: getOwnerScopedWorkspace,
    loadWorkspace: loadWorkspace,
    saveOwnerScopedWorkspace: saveOwnerScopedWorkspace,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    createSnapshot: createSnapshot,
    probeSupabaseConnection: probeSupabaseConnection,
    verifyRecordOwnership: function () { return { ok: false, code: "UNSUPPORTED", error: "Record-level authorization is enforced by Supabase RLS." }; },
    resetSeedData: function () { return { ok: false, code: "DISABLED", error: "Demo seed data is disabled in cloud mode." }; },
    simulateExpiredSession: function () { return { ok: false, code: "UNSUPPORTED", error: "Use Supabase Auth session expiry." }; }
  };
})(window);
