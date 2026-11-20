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
    box.innerHTML = `<form class="login-card"><div class="login-brand"><span class="login-mark"></span>Outreach Desk</div>
      <p>Sign in with your work email and password.</p>
      <input type="email" name="email" required placeholder="you@maximuslabs.ai" aria-label="Email" autocomplete="username">
      <input type="password" name="password" required placeholder="Password" aria-label="Password" autocomplete="current-password">
      <button type="submit">Sign in</button><p class="login-msg" aria-live="polite"></p></form>`;
    const st = document.createElement("style");
    st.textContent = `.login{position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:#080808;padding:16px;font-family:Geist,system-ui,sans-serif}
      .login-card{width:min(380px,100%);display:grid;gap:12px;background:#0f0f0f;border:1px solid #2a2a2a;border-radius:14px;padding:24px;color:#fff}
      .login-brand{display:flex;gap:10px;align-items:center;font-weight:600;font-size:16px}.login-mark{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#449afb,#0070e0)}
      .login-card p{margin:0;color:#ababab;font-size:14px}.login-card input{all:unset;box-sizing:border-box;width:100%;padding:10px 12px;border-radius:8px;border:1px solid #2a2a2a;background:#080808;color:#fff;font-size:14px}
      .login-card input:focus{border-color:#449afb}.login-card button{all:unset;cursor:pointer;text-align:center;padding:10px;border-radius:999px;background:#0070e0;color:#fff;font-weight:500;font-size:14px}
      .login-msg{min-height:20px}`;
    document.head.append(st); document.body.append(box);
    const form = box.querySelector("form"), msg = box.querySelector(".login-msg");
    form.onsubmit = async e => {
      e.preventDefault();
      const email = form.email.value.trim(), password = form.password.value;
      msg.textContent = "Signing in…";
      const {error} = await SB.auth.signInWithPassword({email, password});
      msg.textContent = error ? "Could not sign in: " + error.message : "";
    };
    SB.auth.onAuthStateChange((_e, session) => { if (session) { box.remove(); resolve(session); } });
  });
})();

window.signOut = async () => { await SB.auth.signOut(); location.reload(); };
