// One sidebar + one chat box, shared by Monitoring, Reply and Outreach Tracker, so the frame never changes.
// Look = the Monitoring sidebar. Data = Supabase (after login). Chat questions go to the desk worker on the PC.
(() => {
  const CLIENTS = [  // key (Reply / Tracker), slug (Monitoring), name
    ["versatile", "versatile-club", "Versatile Club"], ["easywebinar", "easywebinar", "EasyWebinar"], ["luca", "luca", "Luca"],
    ["maximuslabs", "maximuslabs", "MaximusLabs"], ["oliv", "oliv-ai", "Oliv AI"], ["teamvoy", "teamvoy", "Teamvoy"]];
  const PAGES = [["monitoring", "monitor.html", "Monitoring", "mon"], ["reply", "desk.html", "Reply", "mail"], ["tracker", "tracker.html", "Outreach Tracker", "list"],
    ["planning", "planning.html", "Planning", "plan"], ["settings", "settings.html", "Settings", "gear"]];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const LOGO = {oliv: "oliv.ai", easywebinar: "easywebinar.com", versatile: "versatile.club", luca: "ask-luca.com", maximuslabs: "maximuslabs.ai", teamvoy: "teamvoy.com"};
  const ICON = {
    mon: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  };
  const css = `
  .sb-group{font:500 11px "Geist Mono",ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:#757575;margin:10px 0 4px 12px}
  .sb .sb-count{font:11px "Geist Mono",ui-monospace,monospace;min-width:20px;text-align:center;border-radius:999px;padding:1px 7px;background:#0070e0;color:#fff;flex:none}
  .sb .sb-count:empty{display:none}
  .sb .sb-count.late{background:#e5484d}
  .sb-set{margin-top:auto}
  .sb-worker{display:flex;align-items:center;gap:8px;font-family:Geist,system-ui,sans-serif;color:#ababab}
  .sb-worker i{width:8px;height:8px;border-radius:50%;background:#757575;flex:none}.sb-worker.on i{background:#3dd68c}.sb-worker.off i{background:#f5a524}
  /* client-only side (client.html) */
  .sb-brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:16px;letter-spacing:-.01em}
  .sb-brand i{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#449afb,#0070e0);flex:none}
  .sb{position:sticky;top:0;align-self:start;height:100vh;display:flex;flex-direction:column;gap:22px;padding:28px 14px 20px 18px;background:#111;border-right:1px solid #1f1f1f;
    font-family:Geist,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#fff;min-width:0;overflow:auto;box-sizing:border-box}
  .sb *{box-sizing:border-box}
  .sb-list{display:grid;gap:4px}
  .sb a.sb-btn{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;color:#ababab;font-weight:500;font-size:14px;text-decoration:none}
  .sb a.sb-btn:hover{background:#141414;color:#fff}
  .sb a.sb-btn[aria-current="page"]{background:#141414;color:#fff;box-shadow:inset 0 0 0 1px #2a2a2a}
  .sb-foot{display:grid;gap:6px;font:12px "Geist Mono",ui-monospace,monospace;color:#757575}
  .sb-foot a{color:#757575;text-decoration:none}.sb-foot a:hover{color:#fff}
  @media (max-width:860px){.sb{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px;border-right:0;border-bottom:1px solid #1f1f1f}
    .sb-list{display:flex;overflow-x:auto;gap:4px;flex:1 1 100%}.sb a.sb-btn{white-space:nowrap}.sb-group{display:none}.sb-set{margin-top:0}.sb-foot{margin-top:0;display:flex;gap:12px;flex-wrap:wrap}}
  /* chat */
  .cb-btn{position:fixed;right:18px;bottom:18px;z-index:60;display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;border:0;cursor:pointer;
    background:#0070e0;color:#fff;font:500 14px Geist,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45)}
  .cb-btn:hover{background:#0a7ff0}.cb-btn:focus-visible{outline:2px solid #449afb;outline-offset:3px}
  .cb{position:fixed;right:18px;bottom:72px;z-index:61;width:min(380px,calc(100vw - 36px));height:min(520px,calc(100vh - 110px));display:grid;grid-template-rows:auto minmax(0,1fr) auto;
    background:#0f0f0f;border:1px solid #2a2a2a;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);font-family:Geist,system-ui,sans-serif;color:#fff;overflow:hidden}
  .cb[hidden]{display:none}
  .cb-h{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #1f1f1f}
  .cb-h b{font-size:14px}.cb-h small{display:block;color:#757575;font-size:11.5px;font-weight:400}
  .cb-x{all:unset;cursor:pointer;color:#ababab;font-size:18px;padding:2px 6px}
  .cb-msgs{overflow:auto;padding:14px;display:grid;gap:10px;align-content:start}
  .cb-m{max-width:88%;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
  .cb-m.q{justify-self:end;background:#0070e0;color:#fff;border-bottom-right-radius:4px}
  .cb-m.a{justify-self:start;background:#1a1a1a;color:#e8e8e8;border-bottom-left-radius:4px}
  .cb-m.w{justify-self:start;background:transparent;color:#757575;font-size:12.5px;padding:2px 4px}
  .cb-meta{font:11px "Geist Mono",monospace;color:#757575;margin-top:3px}
  .cb-f{display:flex;gap:8px;padding:10px;border-top:1px solid #1f1f1f}
  .cb-f textarea{all:unset;flex:1;min-height:20px;max-height:120px;padding:9px 12px;border:1px solid #2a2a2a;border-radius:10px;background:#080808;font-size:13.5px;line-height:1.45;white-space:pre-wrap;overflow:auto}
  .cb-f textarea:focus{border-color:#449afb}
  .cb-f button{all:unset;cursor:pointer;align-self:end;padding:9px 14px;border-radius:999px;background:#0070e0;color:#fff;font-size:13.5px;font-weight:500}
  .cb-f button[disabled]{opacity:.5;pointer-events:none}`;

  let page = "monitoring", client = "", onClient = null, chatSeen = 0, ovCounts = {}, mc = null, local = {minus: {}, late: null, mc: null}, upd = "", lastHtml = "";
  const FRESH = 3 * 3600e3;  // mail_counts (cloud mail check) is used while under 3 h old
  const fresh = m => !!(m && m.at && Date.now() - Date.parse(m.at) < FRESH);
  const curMc = () => { const a = fresh(mc) ? mc : null, b = fresh(local.mc) ? local.mc : null;
    return a && b ? (Date.parse(b.at) >= Date.parse(a.at) ? b : a) : a || b; };
  // count per client = mail_counts total when fresh, else the old overview count; minus clicks the mail check hasn't seen yet
  const countOf = k => { const m = curMc(); const n = m ? (((m.clients || {})[k] || {}).total || 0) : (ovCounts[k] || 0);
    return Math.max(0, n - ((local.minus || {})[k] || 0)); };
  const lateOf = k => { if (local.late) return local.late.has(k); const m = curMc(); if (!m) return false;
    return (m.rows || []).some(r => r.client === k && r.kind === "reply" && Date.now() - Date.parse(r.last_them_at) >= 3 * 864e5); };
  const keyOf = slugOrKey => (CLIENTS.find(c => c[0] === slugOrKey || c[1] === slugOrKey) || [slugOrKey])[0];
  const logo = (k, n) => LOGO[k] ? `<span class="sr-lg"><img src="https://www.google.com/s2/favicons?domain=${LOGO[k]}&sz=64" alt="" onerror="this.replaceWith(document.createTextNode('${esc(n[0])}'))"></span>`
    : `<span class="sr-lg">${esc((n || k || "?")[0])}</span>`;
  function render() {  // the old wide sidebar, always open (no hover)
    const nav = document.getElementById("sb"); if (!nav) return;
    nav.className = "sb";
    const u = document.getElementById("updated"); if (u && u.textContent) upd = u.textContent;  // pages write their "Updated …" stamp here
    const file = ({tracker: "tracker.html", planning: "planning.html"})[page] || "desk.html";  // Settings: a client opens its Reply desk
    const href = (k, slug) => page === "monitoring" ? (k ? `monitor.html?c=${slug}` : "monitor.html") : (k ? `${file}?c=${k}` : file);
    const total = CLIENTS.reduce((a, c) => a + countOf(c[0]), 0);
    const sel = keyOf(client), on = window.__claudeOnline;
    const btn = (h, label, ct, cur, extra = "") => `<a class="sb-btn" href="${h}" ${cur ? 'aria-current="page"' : ""} ${extra}><span>${label}</span>${ct === null ? "" : `<b class="sb-count">${ct || ""}</b>`}</a>`;
    const html = `<div class="sb-brand"><i aria-hidden="true"></i>Outreach Desk</div><div class="sb-list">` +
      PAGES.filter(p => p[0] !== "settings").map(([p, h, l]) => btn(h, esc(l), p === "reply" ? total : null, p === page && !sel)).join("") +
      `<span class="sb-group">Clients</span>` +
      CLIENTS.map(([k, slug, n]) => `<a class="sb-btn" data-k="${k}" href="${href(k, slug)}" ${sel === k ? 'aria-current="page"' : ""} title="${esc(n)} · ${countOf(k)} need our reply"><span>${esc(n)}</span><b class="sb-count${lateOf(k) ? " late" : ""}">${countOf(k) || ""}</b></a>`).join("") +
      `</div>` + btn("settings.html", "⚙ Settings", null, page === "settings", 'class="sb-btn sb-set"').replace('class="sb-btn" ', "") +
      `<div class="sb-foot"><span class="sb-worker ${on === undefined ? "" : on ? "on" : "off"}" id="sbWorker"><i></i><span id="sbWorkerT">${on === undefined ? "Checking…" : on ? "Claude online" : "Claude offline"}</span></span>` +
      `<span id="updated">${esc(upd)}</span><a href="#" id="sbOut">Sign out</a></div>`;
    if (html === lastHtml) return; lastHtml = html; nav.innerHTML = html;  // no redraw when nothing changed (keeps focus)
    nav.querySelector("#sbOut").onclick = e => { e.preventDefault(); window.signOut && window.signOut(); };
    if (onClient) nav.querySelectorAll("a[data-k]").forEach(a => a.onclick = e => { e.preventDefault(); const k = a.dataset.k;
      setClient(k); history.replaceState(null, "", "?c=" + k); onClient(k); });
  }
  function renderClientSide(me) {
    const nav = document.getElementById("sb"); if (!nav) return;
    const name = (CLIENTS.find(x => x[1] === me.client) || [0, 0, me.client])[2];
    nav.innerHTML = `<div class="sb-brand"><i aria-hidden="true"></i>Outreach</div>
      <div class="sb-list"><a class="sb-btn" href="client.html" aria-current="page"><span>${esc(name)} overview</span></a></div>
      <div class="sb-foot"><span>${esc(me.email)}</span><span id="updated"></span><a href="#" id="sbOut">Sign out</a></div>`;
    nav.querySelector("#sbOut").onclick = e => { e.preventDefault(); window.signOut && window.signOut(); };
  }
  function setClient(c) { client = c || ""; render(); }
  async function refreshStatus() {
    try {
      await window.whenAuthed;
      const {data} = await SB.from("desk_state").select("key,value,updated_at").in("key", ["overview", "jobs", "mail_counts"]);
      const get = k => ((data || []).find(r => r.key === k) || {}).value;
      const ov = get("overview"), jb = get("jobs");
      if (ov) { ovCounts = {}; (ov.clients || []).forEach(c => ovCounts[c.key] = c.reply); }
      mc = get("mail_counts") || null;
      window.__claudeOnline = !!(jb && jb.worker_online);
      render();
    } catch (e) {}
  }
  // the fresh mail_counts (or null): Monitoring uses it for its "Needs our reply" numbers
  async function mailCounts() {
    try { await window.whenAuthed; const {data} = await SB.from("desk_state").select("value").eq("key", "mail_counts").maybeSingle();
      const m = data && data.value; if (m) mc = m; return fresh(m) ? m : null; } catch (e) { return null; }
  }

  // ---------- chat ----------
  const pendingLocal = [];
  function chatUI() {
    const btn = document.createElement("button"); btn.className = "cb-btn"; btn.innerHTML = "✦ Ask Claude"; btn.setAttribute("aria-expanded", "false");
    const box = document.createElement("section"); box.className = "cb"; box.hidden = true; box.setAttribute("aria-label", "Chat with Claude");
    box.innerHTML = `<div class="cb-h"><div><b>Ask Claude</b><small id="cbSub">About any client, thread or number on the desk</small></div><button class="cb-x" aria-label="Close">×</button></div>
      <div class="cb-msgs" id="cbMsgs" aria-live="polite"></div>
      <form class="cb-f"><textarea rows="1" placeholder="e.g. What did Manish ask last? Which Luca threads wait longest?" aria-label="Message"></textarea><button type="submit">Send</button></form>`;
    document.body.append(btn, box);
    const ta = box.querySelector("textarea"), form = box.querySelector("form");
    btn.onclick = () => { box.hidden = !box.hidden; btn.setAttribute("aria-expanded", String(!box.hidden)); if (!box.hidden) { ta.focus(); loadChat(); } };
    box.querySelector(".cb-x").onclick = () => { box.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
    form.onsubmit = async e => {
      e.preventDefault();
      const text = ta.value.trim(); if (!text) return;
      form.querySelector("button").disabled = true;
      try {
        await window.whenAuthed;
        const ctx = {page, client, url: location.pathname.split("/").pop() + location.search};
        const {error} = await SB.from("requests").insert({type: "chat", client: client || null, payload: {text, ...ctx}});
        if (error) throw error;
        pendingLocal.push({q: text, at: new Date().toISOString()}); ta.value = ""; ta.style.height = "auto"; drawChat();
      } catch (err) { pendingLocal.push({q: text, err: err.message || String(err)}); drawChat(); }
      form.querySelector("button").disabled = false;
    };
  }
  let chatLog = [], chatOpen = [];
  async function loadChat() {
    try {
      await window.whenAuthed;
      const [{data: st}, {data: rq}] = await Promise.all([
        SB.from("desk_state").select("value").eq("key", "chat").maybeSingle(),
        SB.from("requests").select("id,payload,status,created_at").eq("type", "chat").in("status", ["pending", "received"]).order("created_at")]);
      chatLog = (st && st.value) || []; chatOpen = rq || [];
      for (let i = pendingLocal.length - 1; i >= 0; i--) if (chatOpen.some(r => (r.payload || {}).text === pendingLocal[i].q) || chatLog.some(m => m.q === pendingLocal[i].q)) pendingLocal.splice(i, 1);
      drawChat();
    } catch (e) {}
  }
  const fmt = t => t ? new Date(t).toLocaleString([], {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}) : "";
  function drawChat() {
    const box = document.getElementById("cbMsgs"); if (!box) return;
    const items = [];
    chatLog.slice(-40).forEach(m => { items.push(`<div class="cb-m q">${esc(m.q)}<div class="cb-meta">${esc((m.by || "").split("@")[0])} · ${fmt(m.at_q)}</div></div>`);
      items.push(`<div class="cb-m a">${esc(m.a)}<div class="cb-meta">Claude · ${fmt(m.at_a)}</div></div>`); });
    chatOpen.forEach(r => items.push(`<div class="cb-m q">${esc((r.payload || {}).text)}<div class="cb-meta">${fmt(r.created_at)}</div></div>`));
    pendingLocal.forEach(p => items.push(`<div class="cb-m q">${esc(p.q)}</div>`));
    const waiting = chatOpen.length + pendingLocal.filter(p => !p.err).length;
    if (pendingLocal.some(p => p.err)) items.push(`<div class="cb-m w">Not sent: ${esc(pendingLocal.find(p => p.err).err)}</div>`);
    else if (waiting) items.push(`<div class="cb-m w">${window.__claudeOnline ? "Claude is answering…" : "Claude is offline right now. Your question is saved and answered at the next desk run (7:25 / 1:25) or when a Claude session works the desk."}</div>`);
    if (!items.length) items.push(`<div class="cb-m w">Ask about a client, a thread, a number on this page, or what to reply. Answers come from Claude working the desk on the office PC.</div>`);
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = items.join("");
    const n = chatLog.length; if (atEnd || n !== chatSeen) box.scrollTop = box.scrollHeight; chatSeen = n;
  }

  async function whoAmI() {
    const ses = await window.whenAuthed, email = ((ses && ses.user && ses.user.email) || "").toLowerCase();
    let {data, error} = await SB.from("allowed_users").select("role,client").eq("email", email).maybeSingle();
    if (error) {  // before client_access.sql has run there are no role columns yet: an existing row means admin
      const old = await SB.from("allowed_users").select("email").eq("email", email).maybeSingle();
      data = old.data ? {role: "admin", client: null} : null;
      if (!old.data) {  // older rules don't let a user read the list at all: fall back to "can I read the desk?"
        const probe = await SB.from("desk_state").select("key").limit(1);
        if (probe.data && probe.data.length) data = {role: "admin", client: null};
      }
    }
    return {email, role: data ? data.role : null, client: data ? data.client : null};
  }
  function noAccess(email) {
    document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#080808;color:#fff;font-family:Geist,system-ui,sans-serif;padding:16px">
      <div style="max-width:420px;display:grid;gap:12px;background:#0f0f0f;border:1px solid #2a2a2a;border-radius:14px;padding:24px">
      <b style="font-size:16px">No access yet</b><p style="margin:0;color:#ababab;font-size:14px;line-height:1.5">${esc(email)} is signed in, but hasn't been given access to the Outreach Desk. Ask MaximusLabs to add this email.</p>
      <a href="#" id="naOut" style="color:#449afb;font-size:14px">Sign in with another account</a></div></div>`;
    document.getElementById("naOut").onclick = e => { e.preventDefault(); window.signOut(); };
  }
  window.Shell = {
    async mount(p, c, handler) {
      page = p; client = c || ""; onClient = handler || null;
      const st = document.createElement("style"); st.textContent = css; document.head.append(st);
      const me = await whoAmI(); window.__me = me;
      if (!me.role) { noAccess(me.email); return; }
      if (me.role === "client" && page !== "client") { location.replace("client.html"); return; }
      if (me.role === "client") { renderClientSide(me); return; }
      render(); chatUI(); refreshStatus(); loadChat();
      setInterval(refreshStatus, 15000);
      setInterval(() => { if (!document.querySelector(".cb").hidden) loadChat(); }, 5000);
    },
    setClient, refresh: refreshStatus, mailCounts, keyOf, isFresh: fresh,
    local(o) { Object.assign(local, o || {}); render(); },  // the Reply desk passes its newer mail_counts, unseen Skip clicks and late set
  };
})();
