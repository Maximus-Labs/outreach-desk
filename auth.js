// Shared login for both pages. Only the Supabase URL and the public "anon" key are here (safe to publish);
// what a logged-in person can read is decided in the database (allowed_users), not here.
window.SB_URL = "https://amriumiwpuolyjimkdcj.supabase.co";
window.SB_ANON = "sb_publishable_G5__XWyEY6oX8l0zo7pJEA_maFP55Ag";
window.SB = window.supabase.createClient(window.SB_URL, window.SB_ANON, {auth: {persistSession: true, detectSessionInUrl: true}});

window.whenAuthed = (async () => {
  const {data} = await SB.auth.getSession();
  if (data.session) return data.session;
  return new Promise(resolve => {
    const box = document.createElement("div");
    box.className = "login";
    box.innerHTML = `<form class="login-card" onsubmit="return false"><div class="login-brand"><span class="login-mark"></span>Outreach Desk</div>
      <p>Sign in with your MaximusLabs Google account.</p>
      <button type="button" class="g-btn" id="gSignIn"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Sign in with Google</button><p class="login-msg" aria-live="polite"></p></form>`;
    const st = document.createElement("style");
    st.textContent = `.login{position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:#080808;padding:16px;font-family:Geist,system-ui,sans-serif}
      .login-card{width:min(380px,100%);display:grid;gap:12px;background:#0f0f0f;border:1px solid #2a2a2a;border-radius:14px;padding:24px;color:#fff}
      .login-brand{display:flex;gap:10px;align-items:center;font-weight:600;font-size:16px}.login-mark{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#449afb,#0070e0)}
      .login-card p{margin:0;color:#ababab;font-size:14px}.login-card input{all:unset;box-sizing:border-box;width:100%;padding:10px 12px;border-radius:8px;border:1px solid #2a2a2a;background:#080808;color:#fff;font-size:14px}
      .login-card input:focus{border-color:#449afb}.login-card button{all:unset;cursor:pointer;text-align:center;padding:10px;border-radius:999px;background:#0070e0;color:#fff;font-weight:500;font-size:14px}
      .login-msg{min-height:20px}
      .login-card .g-btn{display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1f1f1f;border:1px solid #747775;font-family:Roboto,Arial,sans-serif}
      .login-card .g-btn:hover{background:#f2f2f2}`;
    document.head.append(st); document.body.append(box);
    const form = box.querySelector("form"), msg = box.querySelector(".login-msg");
    box.querySelector("#gSignIn").onclick = async () => {
      msg.textContent = "Opening Google…";
      const {error} = await SB.auth.signInWithOAuth({provider: "google", options: {
        redirectTo: location.href.split("#")[0], queryParams: {hd: "maximuslabs.ai", prompt: "select_account"}}});
      if (error) msg.textContent = "Could not start Google sign-in: " + error.message;
    };
    SB.auth.onAuthStateChange((_e, session) => { if (session) { box.remove(); resolve(session); } });
  });
})();

window.signOut = async () => { await SB.auth.signOut(); location.reload(); };
