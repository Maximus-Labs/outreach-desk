// One sidebar + one chat box, shared by Monitoring, Reply and Outreach Tracker, so the frame never changes.
// Look = the Monitoring sidebar. Data = Supabase (after login). Chat questions go to the desk worker on the PC.
(() => {
  const CLIENTS = [  // key (Reply / Tracker), slug (Monitoring), name
    ["versatile", "versatile-club", "Versatile Club"], ["easywebinar", "easywebinar", "EasyWebinar"], ["luca", "luca", "Luca"],
    ["maximuslabs", "maximuslabs", "MaximusLabs"], ["oliv", "oliv-ai", "Oliv AI"], ["teamvoy", "teamvoy", "Teamvoy"]];
  const PAGES = [["monitoring", "monitor.html", "Monitoring"], ["reply", "desk.html", "Reply"], ["tracker", "tracker.html", "Outreach Tracker"]];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const css = `
  .sb{position:sticky;top:0;align-self:start;height:100vh;display:flex;flex-direction:column;gap:22px;padding:28px 14px 20px 18px;background:#111;border-right:1px solid #1f1f1f;
    font-family:Geist,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#fff;min-width:0;overflow:auto;box-sizing:border-box}
  .sb *{box-sizing:border-box}
  .sb-brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:16px;letter-spacing:-.01em}
  .sb-brand i{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#449afb,#0070e0);flex:none}
  .sb-list{display:grid;gap:4px}
  .sb-group{font:500 11px "Geist Mono",ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:#757575;margin:10px 0 4px 10px}
  .sb a.sb-btn{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;color:#ababab;font-weight:500;font-size:14px;text-decoration:none}
  .sb a.sb-btn:hover{background:#141414;color:#fff}
  .sb a.sb-btn[aria-current="page"]{background:#141414;color:#fff;box-shadow:inset 0 0 0 1px #2a2a2a}
  .sb .sb-count{font:11px "Geist Mono",ui-monospace,monospace;min-width:20px;text-align:center;border-radius:999px;padding:1px 7px;background:#0070e0;color:#fff}
  .sb .sb-count:empty{display:none}
  .sb-foot{margin-top:auto;display:grid;gap:6px;font:12px "Geist Mono",ui-monospace,monospace;color:#757575}
  .sb-foot a{color:#757575;text-decoration:none}.sb-foot a:hover{color:#fff}
  .sb-worker{display:flex;align-items:center;gap:8px;font-family:Geist,system-ui,sans-serif;color:#ababab}
  .sb-worker i{width:8px;height:8px;border-radius:50%;background:#757575;flex:none}.sb-worker.on i{background:#3dd68c}.sb-worker.off i{background:#f5a524}
  @media (max-width:860px){.sb{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px;border-right:0;border-bottom:1px solid #1f1f1f}
    .sb-list{display:flex;overflow-x:auto;gap:4px;flex:1 1 100%}.sb-group{display:none}.sb a.sb-btn{white-space:nowrap}.sb-foot{margin-top:0}}
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

  let page = "monitoring", client = "", onClient = null, counts = {}, chatSeen = 0;
  function render() {
    const nav = document.getElementById("sb"); if (!nav) return;
    const href = (k, slug) => page === "monitoring" ? `monitor.html?c=${slug}` : page === "reply" ? `desk.html?c=${k}` : `tracker.html?c=${k}`;
    const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
    nav.innerHTML = `<div class="sb-brand"><i aria-hidden="true"></i>Outreach Desk</div>
      <div class="sb-list">
        ${PAGES.map(([p, h, l]) => `<a class="sb-btn" href="${h}" ${p === page && !client ? 'aria-current="page"' : ""}><span>${l}</span>${p === "reply" ? `<b class="sb-count">${total || ""}</b>` : ""}</a>`).join("")}
        <span class="sb-group">Clients</span>
        ${CLIENTS.map(([k, slug, n]) => `<a class="sb-btn" data-k="${k}" href="${href(k, slug)}" ${client === k || client === slug ? 'aria-current="page"' : ""} title="${esc(n)} · threads that need our reply"><span>${esc(n)}</span><b class="sb-count">${counts[k] || ""}</b></a>`).join("")}
      </div>
      <div id="nav" hidden></div>
      <div class="sb-foot"><span class="sb-worker" id="sbWorker"><i></i><span id="sbWorkerT">Checking…</span></span><span id="updated"></span><a href="#" id="sbOut">Sign out</a></div>`;
    nav.querySelector("#sbOut").onclick = e => { e.preventDefault(); window.signOut && window.signOut(); };
    if (onClient) nav.querySelectorAll("a[data-k]").forEach(a => a.onclick = e => { e.preventDefault(); setClient(a.dataset.k); history.replaceState(null, "", "?c=" + a.dataset.k); onClient(a.dataset.k); });
  }
  function setClient(c) { client = c || ""; render(); refreshStatus(); }
  async function refreshStatus() {
    try {
      await window.whenAuthed;
      const {data} = await SB.from("desk_state").select("key,value,updated_at").in("key", ["overview", "jobs"]);
      const ov = (data || []).find(r => r.key === "overview"), jb = (data || []).find(r => r.key === "jobs");
      if (ov) { counts = {}; (ov.value.clients || []).forEach(c => counts[c.key] = c.reply); render(); }
      const online = !!(jb && jb.value && jb.value.worker_online), w = document.getElementById("sbWorker");
      if (w) { w.className = "sb-worker " + (online ? "on" : "off"); document.getElementById("sbWorkerT").textContent = online ? "Claude online" : "Claude offline"; }
      window.__claudeOnline = online;
    } catch (e) {}
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

  window.Shell = {
    mount(p, c, handler) {
      page = p; client = c || ""; onClient = handler || null;
      const st = document.createElement("style"); st.textContent = css; document.head.append(st);
      render(); chatUI(); refreshStatus(); loadChat();
      setInterval(refreshStatus, 15000);
      setInterval(() => { if (!document.querySelector(".cb").hidden) loadChat(); }, 5000);
    },
    setClient, refresh: refreshStatus,
  };
})();
