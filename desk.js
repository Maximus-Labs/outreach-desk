// Reply desk · v3. Email text is always inserted through esc(): never as HTML.
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
// Every read comes from Supabase (after login); every action is a request row the PC worker handles.
// Free-plan data limit: ask only for the saved time (a few bytes); download the value again only when that time
// changed, or every 2 minutes as a safety net.
const SNAP = {};
const snap = async key => { await window.whenAuthed;
  const c = SNAP[key], fresh = c && Date.now() - c.got < 120e3;
  if (fresh) { const {data: m, error: e} = await SB.from("desk_state").select("updated_at").eq("key", key).maybeSingle();
    if (e) throw new Error(e.message); if (m && m.updated_at === c.at) return c.value; }
  const {data, error} = await SB.from("desk_state").select("value,updated_at").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message); SNAP[key] = {at: data && data.updated_at, value: data ? data.value : null, got: Date.now()}; return SNAP[key].value; };
const openReqs = async () => { const {data, error} = await SB.from("requests").select("id,type,client,thread_id,payload,status,created_at").in("status", ["pending", "received"]).order("created_at");
  if (error) throw new Error(error.message); return data || []; };
const addReq = async (type, client, thread_id, payload) => { await window.whenAuthed;
  const {data, error} = await SB.from("requests").insert({type, client, thread_id, payload: payload || {}}).select("id,created_at").single();
  if (error) throw new Error(error.message); return {id: data.id, status: "working", thread_id, client, instruction: (payload || {}).instruction || "", started: data.created_at}; };
const asked = new Set();
const api = async (path, body) => {
  const u = new URL(path, location.origin), p = u.pathname.split("/").filter(Boolean).slice(1), post = body !== undefined;
  if (!post && p[0] === "jobs") {
    const [j, reqs] = await Promise.all([snap("jobs"), openReqs()]);
    S.reqs = reqs;
    const map = {}; ((j && j.jobs) || []).forEach(x => map[x.thread_id] = x);
    for (const r of reqs) {
      if (r.type === "draft") map[r.thread_id] = Object.assign({}, map[r.thread_id] || {}, {id: r.id, client: r.client, thread_id: r.thread_id, status: "working", instruction: (r.payload || {}).instruction || "", started: r.created_at});
      if (r.type === "send" && map[r.thread_id]) map[r.thread_id] = Object.assign({}, map[r.thread_id], {status: "sending"});
    }
    return {jobs: Object.values(map), pending: reqs.length, worker_online: !!(j && j.worker_online)};
  }
  if (!post && p[0] === "overview") return await snap("overview") || {clients: [], updated: null};
  if (!post && p[0] === "knowledge") return await snap("knowledge") || {learned: "", decisions: [], memory_files: [], handover: ""};
  if (!post && p[0] === "queue") {
    const q = await snap("queue") || {}, c = u.searchParams.get("client"), out = {monitor_at: q.monitor_at};
    for (const k of ["reply", "client", "done", "paid", "other"]) out[k] = (q[k] || []).filter(r => !c || r.client === c);
    return out;
  }
  if (!post && p[0] === "clients" && p[2] === "threads" && p[3]) {
    const tid = decodeURIComponent(p[3]);
    const {data} = await SB.from("desk_threads").select("data").eq("thread_id", tid).maybeSingle();
    const t = data && data.data;
    if (!t || t.loading) { if (!asked.has(tid)) { asked.add(tid); await addReq("thread", p[1], tid); } return Object.assign({messages: [], meta: {}}, t || {thread_id: tid}, {loading: true}); }
    return t;
  }
  if (post && p[0] === "clients" && p[2] === "threads") {
    const kind = p[4], tid = decodeURIComponent(p[3]);
    if (!["draft", "send", "save-draft", "skip"].includes(kind)) throw new Error("unknown action");
    const payload = Object.assign({}, body); delete payload.confirm;
    return await addReq(kind, p[1], tid, payload);
  }
  if (post && p[0] === "clients" && p[2] === "refresh") return await addReq("pull", p[1], null, {});
  if (post && p[0] === "refresh-all") { for (const c of ((await snap("clients")) || [])) await addReq("pull", c.key, null, {}); return {queued: true}; }
  if (post && p[0] === "knowledge") return await addReq(p[1], null, null, body);
  throw new Error("not available online: " + path);
};

// ---------------- helpers ----------------
const toast = (msg, err, onClick) => {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  if (onClick) { t.style.cursor = "pointer"; t.onclick = () => { onClick(); t.remove(); }; }
  $("#toasts").append(t); setTimeout(() => t.remove(), err ? 9000 : 6000);
};
const initials = s => (s || "?").replace(/<.*>/, "").replace(/["']/g, "").trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
const addrOf = s => ((s || "").match(/<([^>]+)>/) || [, s || ""])[1].trim().toLowerCase();
const nameOf = s => (s || "").split("<")[0].replace(/"/g, "").trim() || addrOf(s);
const toDate = ts => { const n = Number(ts); return isNaN(n) ? new Date(ts) : new Date(n > 1e11 ? n : n * 1000); };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isToday = d => { const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
const when = ts => { if (!ts) return ""; const d = toDate(ts); if (isNaN(d)) return String(ts);
  return isToday(d) ? d.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false}) : `${d.getDate()} ${MON[d.getMonth()]}`; };
const whenLong = ts => { if (!ts) return ""; const d = toDate(ts); if (isNaN(d)) return String(ts);
  return (isToday(d) ? "Today " : `${d.getDate()} ${MON[d.getMonth()]} `) + d.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false}); };
const LOGO = {oliv: "oliv.ai", easywebinar: "easywebinar.com", versatile: "versatile.club", luca: "ask-luca.com", maximuslabs: "maximuslabs.ai", teamvoy: "teamvoy.com"};
const logo = (key, name) => LOGO[key] ? `<span class="lg"><img src="https://www.google.com/s2/favicons?domain=${LOGO[key]}&sz=64" alt="" onerror="this.replaceWith(document.createTextNode('${esc((name || key)[0])}'))"></span>`
  : `<span class="lg">${esc((name || key || "?")[0])}</span>`;
// the status line on each row (colour follows the status automatically)
function rowStatus(r) {
  if (r.job === "sending") return ["Sending", "var(--acc)", true];
  if (r.job === "working") return ["Drafting", "var(--acc)", true];
  if (r.job === "error") return ["Failed", "var(--red)"];
  if (r.outdated) return ["New email", "var(--amber)"];
  if (r.unreported) return ["Not in report", "var(--amber)"];
  if (r.newer) return ["New email", "var(--amber)"];
  if (r.check) return [`${r.stage || "They wrote"} · check`, "var(--text2)"];
  if (r.followup) return [`Follow-up · ${Math.round(r.age_days)} days`, "var(--text3)"];
  if (r.bucket === "our" && r.age_days >= 3) return [`Late · ${Math.round(r.age_days)} days`, "var(--red)"];
  if (r.decision) return ["Your call", "var(--amber)"];
  const st = r.stage || "";
  if (/waiting on our work/i.test(st)) return [st, "var(--amber)"];
  if (/live/i.test(st)) return [st, "var(--green)"];
  if (/counter|different|paid/i.test(st)) return [st, "var(--violet)"];
  if (/draft|blurb/i.test(st)) return [st, "var(--amber)"];
  if (r.job === "ready") return ["Draft ready", "var(--acc)"];
  return [st || "New reply", "var(--acc)"];
}

const S = {overview: null, clients: [], client: "", queue: null, view: "all", tab: "reply", thread: null, sel: null, jobs: {}, online: false,
  threadSig: "", reqs: [], chat: [], lastOk: null, search: ""};

// ---------------- polling ----------------
async function tick() {
  try {
    const j = await api("/api/jobs");
    S.online = j.worker_online; window.__claudeOnline = j.worker_online;
    const next = {}; j.jobs.forEach(x => next[x.thread_id] = x);
    for (const x of j.jobs) {
      const was = S.jobs[x.thread_id];
      if (was && /^(working|sending)/.test(was.status) && x.status === "ready") toast(`Draft ready · ${x.subject || ""}`, false, () => openThread(x.client, x.thread_id));
      if (was && /^(working|sending)/.test(was.status) && x.status === "error") toast(`Failed · ${x.error || ""}`, true);
    }
    for (const tid of Object.keys(S.jobs)) if (S.jobs[tid].status === "sending" && !next[tid]) toast("Sent · " + (S.jobs[tid].subject || ""));
    S.jobs = next;
    const [ov, chat, cl, mc] = await Promise.all([api("/api/overview"), snap("chat"), S.clients.length ? null : snap("clients"), snap("mail_counts")]);
    S.overview = ov; S.chat = chat || []; if (cl) S.clients = cl;
    S.mc = mc && mc.at ? mc : null;  // one source: the cloud mail counts, whatever their age (the banner warns when old)
    mailWarn(mc);
    await loadQueue();
    renderRail();
    if (S.sel) { const jb = S.jobs[S.sel.tid]; const sig = jb ? jb.id + jb.status : "none";
      if (sig !== S.threadSig || (S.thread && S.thread.loading)) openThread(S.sel.key, S.sel.tid, true); else renderChat(); }
    S.lastOk = new Date(); setSync(true);
  } catch (e) { console.error("refresh failed", e); setSync(false, e); }
}
// amber note on the header when the cloud mail check failed or hasn't run for 2 h
function mailWarn(mc) {
  const w = $("#mcWarn"); if (!w) return;
  const at = mc && mc.at ? new Date(mc.at) : null, hm = at ? at.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false}) : "";
  const errs = (mc && mc.errors) || [], old = !at || Date.now() - at > 2 * 3600e3;
  let t = "";
  if (mc && mc.ok === false) {
    const who = [...new Set(errs.map(e => { const m = /^([^\s:]+@[^\s:]+):/.exec(String(e)); return m ? m[1] : ""; }).filter(Boolean))];
    t = `Mail check: ${who.length ? who.join(", ") + " failed" : "failed"} at ${hm}`;
  } else if (old) t = at ? `Mail check: last run ${at.toDateString() === new Date().toDateString() ? hm : whenLong(mc.at)} · over 2 h ago` : "Mail check: no run found";
  w.hidden = !t; w.textContent = t; w.title = errs.length ? errs.join(" · ") : t;
}
function setSync(ok, e) {
  const s = $("#sync"), b = $("#banner"), t = S.lastOk ? S.lastOk.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false}) : "";
  s.className = "sync " + (ok ? "ok" : "err");
  const mct = S.mc ? new Date(S.mc.at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false}) : "";
  $("#syncTxt").textContent = ok ? `Synced ${t}${mct ? ` · mail checked ${mct}` : ""}${S.online ? "" : " · Claude offline"}` : (t ? `Using ${t} data` : "Not loaded");
  b.hidden = ok;
  if (!ok) b.textContent = `Couldn't refresh${e && e.message ? ` (${e.message.slice(0, 80)})` : ""}. ${t ? `Showing data from ${t}.` : ""} Retrying…`;
}

// ---------------- rail (drawn by shell.js, shared with every page) ----------------
// The desk hands the shared rail its newer mail_counts, the Skip clicks the mail check hasn't seen yet, and which clients have late replies.
function renderRail() {
  const allQ = S.allReply || (S.queue || {}).reply || [], minus = {}, late = new Set();
  if (S.mc) (S.mc.rows || []).forEach(r => { if (isMarked(r.thread_id)) minus[r.client] = (minus[r.client] || 0) + 1; });
  allQ.forEach(r => { if (r.bucket === "our" && r.age_days >= 3) late.add(r.client); });
  if (window.Shell && Shell.local) Shell.local({mc: S.mc, minus, late});
}
function pickClient(k) {
  S.client = k || ""; history.replaceState(null, "", S.client ? "?c=" + S.client : location.pathname);
  if (window.Shell) Shell.setClient(S.client); loadQueue().then(renderRail);
}

// ---------------- list ----------------
const TABS = [["reply", "Needs reply"], ["client", "Waiting"], ["done", "Done"], ["paid", "Paid"], ["other", "Other"]];
async function loadQueue() {
  const want = S.client;
  const [q, all] = await Promise.all([api("/api/queue" + (want ? `?client=${want}` : "")), want ? api("/api/queue") : null]);
  if (want !== S.client) return;
  if (S.mc) {  // the counted rows come from the cloud mail check; desk rows add drafts / status where they exist
    const byId = {}; for (const k of ["reply", "client", "done", "paid", "other"]) (q[k] || []).forEach(r => byId[r.thread_id] = r);
    const ids = new Set(), names = Object.fromEntries((S.overview.clients || []).map(c => [c.key, c.name]));
    const mrows = (S.mc.rows || []).filter(r => (!want || r.client === want) && !isMarked(r.thread_id)).map(r => { ids.add(r.thread_id);
      const d = byId[r.thread_id] || {}, t = r.kind === "reply" ? r.last_them_at : r.last_us_at;
      return Object.assign({}, d, {client: r.client, client_name: names[r.client] || r.client_name, thread_id: r.thread_id,
        who: d.who || r.who || r.domain, domain: r.domain, subject: d.subject || r.subject, ts: Date.parse(t) / 1000,
        age_days: (Date.now() - Date.parse(t)) / 864e5, stage: d.stage || r.stage, bucket: "our", followup: r.kind === "followup",
        unreported: false, check: false, mc: true}); });
    q.reply = [...mrows, ...(q.reply || []).filter(r => (r.unreported || r.check) && !ids.has(r.thread_id))];
    for (const k of ["client", "done", "paid", "other"]) q[k] = (q[k] || []).filter(r => !ids.has(r.thread_id));
  }
  S.allReply = (all || q).reply; S.queue = q;
  const term = S.search.trim().toLowerCase();
  const view = {};
  for (const k of ["reply", "client", "done", "paid", "other"])
    view[k] = term ? q[k].filter(r => [r.who, r.domain, r.subject, r.snippet, r.client_name, r.to, r.stage].join(" ").toLowerCase().includes(term)) : q[k];
  S.view_q = view;
  const c = (S.overview && S.overview.clients || []).find(x => x.key === S.client);
  $("#qTitle").textContent = c ? c.name : "Received emails";
  $("#qSub").textContent = `${q.reply.filter(r => !r.check && !r.unreported).length} need a reply`;
  $("#pullOne").title = c ? `Pull ${c.name} from Gmail` : "Pull all clients from Gmail";
  const tab = S.tab;
  $("#qTabs").innerHTML = TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}<b>${k === "reply" ? view[k].filter(r => !r.check && !r.unreported).length : view[k].length}</b></button>`).join("");
  document.querySelectorAll("#qTabs button").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; loadQueue(); });
  const row = r => {
    const [st, col, busy] = rowStatus(r), sel = S.sel && S.sel.tid === r.thread_id;
    return `<button class="qi" data-k="${esc(r.client)}" data-t="${esc(r.thread_id)}" aria-current="${!!sel}">
      <span class="av">${esc(initials(r.who))}</span>
      <span class="who"><b>${esc(r.who)}</b><span>${esc(r.domain)}${S.client ? "" : " · " + esc(r.client_name)}</span></span>
      <span class="meta"><span class="n">${esc(when(r.ts))}</span><span class="st" style="--c:${col}">${busy ? '<span class="spin"></span>' : ""}${esc(st)}</span></span></button>`;
  };
  const list = view[tab];
  let html;
  if (!list.length) html = `<div class="empty-l">${term ? `No match for “${esc(S.search)}” here.` : {reply: "Nothing needs a reply. ✓", client: "Nobody to wait on.", done: "No completed exchanges yet.", paid: "No paid-only replies.", other: "Nothing else."}[tab]}</div>`;
  else if (tab === "reply") {
    const G = replyGroups(list), sec = (t, rs, hint) => rs.length ? `<div class="grp" ${hint ? `title="${hint}"` : ""}><span>${t}</span><span>${rs.length}</span></div>` + rs.map(row).join("") : "";
    html = sec("Needs reply", G.now) +
      sec("Other partner emails · not counted", G.unrep, "Partner emails outside our link-exchange proposals (different subject line). Shown for a glance; not counted.") +
      sec("They wrote last · report says no reply", G.check, "The partner wrote last; the monitoring report judged no reply is needed. Skip it if that's right.") +
      sec("Follow-up due", G.fu) + markedSection(S.client);
  } else html = list.map(row).join("");
  $("#qList").innerHTML = html;
  document.querySelectorAll("#qList .qi:not(.mk)").forEach(b => b.onclick = () => openThread(b.dataset.k, b.dataset.t));
  document.querySelectorAll("#qList .undo").forEach(b => b.onclick = e => { e.stopPropagation(); undoMark(b.dataset.k, b.dataset.t); });
  renderToday();
}
function renderToday() {
  const ov = (S.overview && S.overview.clients) || [];
  const rows = (S.allReply || []).filter(r => r.ts && isToday(toDate(r.ts)) && (!S.client || r.client === S.client));
  const cs = S.client ? ov.filter(c => c.key === S.client) : ov;
  $("#today").innerHTML = cs.map(c => {
    const mine = rows.filter(r => r.client === c.key), doms = {};
    mine.forEach(r => (doms[r.domain] = doms[r.domain] || []).push(r));
    return `<div class="acct"><div class="acct-h">${logo(c.key, c.name)}<b>${esc(c.name)}</b><span class="ct${mine.length ? "" : " zero"}">${mine.length}</span></div>` +
      Object.entries(doms).map(([d, arr]) => `<div class="dom"><small>${esc(d)}</small>${arr.map(r => `<button data-k="${esc(r.client)}" data-t="${esc(r.thread_id)}" aria-current="${!!(S.sel && S.sel.tid === r.thread_id)}">${esc(r.who)}</button>`).join("")}</div>`).join("") + `</div>`;
  }).join("") || `<div class="empty-l">No clients yet.</div>`;
  document.querySelectorAll("#today button[data-t]").forEach(b => b.onclick = () => openThread(b.dataset.k, b.dataset.t));
}
function setView(v) {
  S.view = v; document.querySelectorAll(".views button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  $("#qList").hidden = v === "today"; $("#qTabs").hidden = v === "today"; $("#today").hidden = v !== "today";
}
const replyGroups = l => ({now: l.filter(r => !r.followup && !r.unreported && !r.check), unrep: l.filter(r => r.unreported),
  check: l.filter(r => r.check && !r.unreported), fu: l.filter(r => r.followup && !r.unreported && !r.check)});
const flatList = () => { const v = (S.view_q || {})[S.tab] || []; if (S.tab !== "reply") return v; const G = replyGroups(v); return [...G.now, ...G.unrep, ...G.check, ...G.fu]; };
function step(d) {
  const l = flatList(); if (!l.length) return;
  const i = S.sel ? l.findIndex(r => r.thread_id === S.sel.tid) : -1, r = l[Math.min(l.length - 1, Math.max(0, i + d))];
  if (r) openThread(r.client, r.thread_id);
}

// ---------------- reply area ----------------
async function openThread(key, tid, quiet) {
  const changed = !S.sel || S.sel.tid !== tid;
  S.sel = {key, tid}; $("#app").classList.add("reading");
  if (changed) {
    document.querySelectorAll("[data-t]").forEach(b => b.setAttribute("aria-current", b.dataset.t === tid));
    if (!quiet) $("#work").innerHTML = `<div class="empty"><span><span class="spin"></span> Opening…</span></div>`;
  }
  let t;
  try { t = await api(`/api/clients/${key}/threads/${encodeURIComponent(tid)}`); }
  catch (e) { if (!quiet) $("#work").innerHTML = `<div class="empty"><b>Couldn't open this email</b><span>${esc(e.message)}</span></div>`; return; }
  if (!S.sel || S.sel.tid !== tid) return;
  if (t.job) S.jobs[tid] = t.job;
  const jb = S.jobs[tid]; S.threadSig = jb ? jb.id + jb.status : "none";
  // keep what the user is typing: skip the re-render while they are in the reply
  if (quiet && !changed && S.thread && !S.thread.loading && !t.loading && document.activeElement && $("#work").contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) { S.thread = t; renderCtx(); return; }
  S.thread = t; renderWork(); renderCtx();
}
const rowOf = tid => { const q = S.queue || {}; for (const k of ["reply", "client", "done", "paid", "other"]) { const r = (q[k] || []).find(x => x.thread_id === tid); if (r) return r; } return null; };
const clientOf = key => (S.clients || []).find(c => c.key === key) || ((S.overview && S.overview.clients) || []).find(c => c.key === key) || {key};

function renderWork() {
  const t = S.thread, key = S.sel.key, c = clientOf(key), r0 = rowOf(S.sel.tid) || {};
  const meta = t.meta || {}, who = nameOf(meta.partner || "") || r0.who || meta.to || "Partner";
  const [st] = r0.thread_id ? rowStatus(r0) : [meta.status || ""];
  const head = `<header class="wh">
      <button class="btn back" id="back" aria-label="Back to the list">←</button>
      <span class="av">${esc(initials(who))}</span>
      <div class="t"><b>${esc(who)}</b><span>${esc(r0.domain || meta.to || "")} · ${esc(c.name || r0.client_name || key)}${t.mailbox ? " · via " + esc(t.mailbox) : ""}</span></div>
      ${st ? `<span class="chip">${esc(st)}</span>` : ""}
      <div class="acts"><button class="btn ctx-btn" id="ctxBtn">Brief</button><button class="btn" id="skipTop">Skip <span class="k">S</span></button><button class="btn" id="nextBtn">Next <span class="k">J</span></button></div>
    </header>`;
  if (t.loading) {
    $("#work").innerHTML = head + `<div class="wb"><div class="wb-in"><div class="wait"><span class="spin"></span><div><b>Fetching this thread from Gmail…</b>
      <span class="m">${S.online ? "Claude is on it." : "Claude is offline; it will be fetched at the next desk run (7:25 / 1:25) or when a session works the desk."}</span></div></div></div></div>`;
    wireHead(); return;
  }
  const ours = (c.mailboxes || []).map(m => m.toLowerCase());
  const msgs = t.messages || [];
  const lastIdx = msgs.length - 1;
  const theirIdx = msgs.map((m, i) => [m, i]).reverse().find(([m]) => !ours.includes(addrOf(m.from)));
  const openIdx = theirIdx ? theirIdx[1] : lastIdx;
  const mail = (m, i) => `<div class="msg ${i === openIdx ? "open" : ""}" role="button" tabindex="0">
      <div class="mh"><b>${esc(nameOf(m.from))}</b><span>to ${esc(ours.includes(addrOf(m.from)) ? nameOf(m.to) : "us")}</span><time>${esc(whenLong(m.ts))}</time></div>
      <p class="sn">${esc((m.text || "").replace(/\s+/g, " ").slice(0, 220))}</p><div class="ex">${esc(m.text)}</div></div>`;
  $("#work").innerHTML = head + `<div class="wb"><div class="wb-in">
      <div id="composer"></div>
      ${msgs.length ? `<div class="th-h">Thread · ${msgs.length} email${msgs.length > 1 ? "s" : ""} · click one to open it</div><section class="card">${msgs.map(mail).join("")}</section>` : ""}
    </div></div>`;
  document.querySelectorAll(".msg").forEach(m => { m.onclick = () => m.classList.toggle("open"); m.onkeydown = e => { if (e.key === "Enter") m.classList.toggle("open"); }; });
  wireHead(); renderComposer();
}
function wireHead() {
  $("#back").onclick = () => $("#app").classList.remove("reading");
  $("#nextBtn").onclick = () => step(1);
  $("#skipTop").onclick = e => { e.stopPropagation(); skipThis(e.currentTarget); };
  $("#ctxBtn").onclick = () => $("#app").classList.toggle("ctx-open");
}
// ---------------- Skip with a reason (paid / declined / no reply / later) ----------------
S.marks = {};   // thread_id -> {reason, until, at, client}: clicks the cloud mail check has not seen yet
S.undone = {};  // thread_id -> at: undo clicks not yet seen
const REASONS = {paid: "Paid placement", declined: "Declined / not a fit", no_reply: "No reply needed", later: "Later"};
const isMarked = tid => { const m = S.marks[tid]; return !!(m && (!S.mc || Date.parse(S.mc.at) < m.at)); };
const ymd = d => d.toISOString().slice(0, 10);
function skipThis(anchor) {
  if (!S.sel) return;
  let pop = $("#skipPop");
  if (!pop) { pop = document.createElement("div"); pop.id = "skipPop"; pop.className = "pop"; document.body.append(pop); }
  const t1 = new Date(Date.now() + 864e5), t3 = new Date(Date.now() + 3 * 864e5);
  pop.innerHTML = `<div class="pop-h">Skip this email · it leaves the count</div>
    <button data-r="paid">Paid placement <small>closed for good</small></button>
    <button data-r="declined">Declined / not a fit <small>closed for good</small></button>
    <button data-r="no_reply">No reply needed <small>back if they write again</small></button>
    <div class="pop-h">Later · comes back on the date</div>
    <div class="pop-row"><button data-r="later" data-u="${ymd(t1)}">Tomorrow</button><button data-r="later" data-u="${ymd(t3)}">In 3 days</button>
      <input type="date" id="laterDate" min="${ymd(t1)}" aria-label="Pick a date"><button id="laterGo">Set</button></div>`;
  const r = (anchor || $("#skipTop")).getBoundingClientRect();
  pop.style.top = (r.bottom + 6) + "px";
  pop.style.left = Math.max(8, Math.min(innerWidth - 300, r.right - 280)) + "px";
  pop.hidden = false;
  const pick = (reason, until) => { pop.hidden = true; markThread(reason, until); };
  pop.querySelectorAll("button[data-r]").forEach(b => b.onclick = () => pick(b.dataset.r, b.dataset.u || ""));
  $("#laterGo").onclick = () => { const v = $("#laterDate").value; if (v) pick("later", v); };
  setTimeout(() => document.addEventListener("click", function off(e) {
    if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener("click", off); } }), 0);
}
async function markThread(reason, until) {
  const {key, tid} = S.sel;
  try {
    await api(`/api/clients/${key}/threads/${encodeURIComponent(tid)}/skip`, {reason, until, label: REASONS[reason]});
    S.marks[tid] = {reason, until, at: Date.now(), client: key};
    toast(`${REASONS[reason]}${until ? " · back " + until : ""} · removed from the count`);
    await loadQueue(); renderRail(); step(1);
  } catch (e) { toast(e.message, true); }
}
async function undoMark(key, tid) {
  try {
    await addReq("skip", key, tid, {reason: "undo"});
    delete S.marks[tid]; S.undone[tid] = Date.now();
    toast("Undone · back in the count at the next mail check (within 30 min)");
    await loadQueue(); renderRail();
  } catch (e) { toast(e.message, true); }
}
function markedSection(want) {
  const fresh = S.mc ? Date.parse(S.mc.at) : 0, parked = (S.mc && S.mc.parked) || [];
  const local = Object.entries(S.marks).filter(([tid]) => isMarked(tid) && !parked.some(p => p.thread_id === tid))
    .map(([tid, m]) => { const r = ((S.mc && S.mc.rows) || []).find(x => x.thread_id === tid) || {};
      return {thread_id: tid, client: m.client, who: r.who || r.domain || "This email", domain: r.domain || "", kind: m.reason, until: m.until}; });
  const rows = [...parked.filter(p => !(S.undone[p.thread_id] > fresh)), ...local].filter(p => !want || p.client === want);
  if (!rows.length) return "";
  const lab = p => p.kind === "later" ? `Later · back ${esc(String(p.until || "").slice(0, 10))}` : esc(REASONS[p.kind] || "Skipped");
  return `<div class="grp" title="Emails you marked. Not counted. Paid and declined stay closed; Later comes back on its date."><span>Marked by you · not counted</span><span>${rows.length}</span></div>` +
    rows.map(p => `<div class="qi mk"><span class="av">${esc(initials(p.who))}</span><span class="who"><b>${esc(p.who)}</b><span>${esc(p.domain)}</span></span>
      <span class="meta"><span class="st">${lab(p)}${p.new_since ? " · new email" : ""}</span><button class="undo" data-k="${esc(p.client)}" data-t="${esc(p.thread_id)}">Undo</button></span></div>`).join("");
}

function renderComposer() {
  const box = $("#composer"); if (!box) return;
  const t = S.thread, j = S.jobs[S.sel.tid] || t.job, r = j && j.result, meta = t.meta || {};
  const c = clientOf(S.sel.key);
  const subj = "Re: " + (t.subject || "").replace(/^(re:\s*)+/i, "");
  const askBar = (label, ph) => `<div class="gm-ask"><span aria-hidden="true">✦</span><input id="instr" placeholder="${ph}" aria-label="Instruction for Claude"><button id="go">${label}</button></div>`;
  if (S.sent[S.sel.tid] || (j && j.status === "sent")) {
    box.innerHTML = `<div class="wait"><div><b>Sent ✓</b><span class="m">Your reply went out from ${esc(t.mailbox || "")}. It leaves the count now; it comes back only when they write again.</span></div></div>`;
    return;
  }
  if (S.sending[S.sel.tid]) {
    box.innerHTML = `<div class="wait"><span class="spin"></span><div><b>Sending…</b><span class="m">Sending through Gmail now, a few seconds.</span></div></div>`;
    return;
  }
  if (j && /^(working|sending)/.test(j.status)) {
    box.innerHTML = `<div class="wait"><span class="spin"></span><div><b>${j.status === "sending" ? "Sending…" : "Claude is drafting"}</b>
      <span class="m">${j.status === "sending" ? "Queued for the desk run." : (j.instruction ? `“${esc(j.instruction)}” · ` : "") + "Move on to the next email; you'll get a note when it's ready."}</span></div></div>`;
    return;
  }
  if (!r || (r.category === "no-reply-needed" && !r.draft_body)) {
    box.innerHTML = `<section class="gm" aria-label="Reply"><div class="gm-h">${r ? "No reply needed" : "No draft yet"}<span>${esc(t.mailbox || "")}</span></div>
      <div class="gm-note">${r ? esc(r.summary) : "Ask Claude to write the reply. Leave it empty for the obvious reply, or say what you want."}</div>
      <div class="gm-t">${askBar("Draft", "e.g. accept 1:1, offer our webcast article, keep it short")}<button class="gm-sec" id="skip">Skip, no reply</button></div></section>`;
  } else {
    box.innerHTML = `${j.outdated ? `<div class="warn">A new email arrived after this draft was written. Ask Claude to redraft it.</div>` : ""}
      <section class="gm" aria-label="Reply">
        <div class="gm-h">Reply<span>${j.auto ? "Drafted by Claude" : "Draft"} · ${esc(r.category || "")}</span></div>
        <div class="gm-f"><span>From</span><span class="v">${esc(t.mailbox || "")}</span></div>
        <div class="gm-f"><span>To</span><input id="to" value="${esc(j.to || meta.to || "")}" aria-label="To"></div>
        <div class="gm-f"><span>Subject</span><span class="v">${esc(subj)}</span></div>
        <textarea id="body" spellcheck="true" aria-label="Reply text">${esc(r.draft_body)}</textarea>
        ${(r.suggestions || []).length ? `<div class="gm-s">${r.suggestions.map(s => `<button>${esc(s)}</button>`).join("")}</div>` : ""}
        <div class="gm-t"><button class="gm-send" id="send">Send</button>${askBar("Redraft", "Tell Claude what to change…")}<button class="gm-sec" id="gdraft">Save draft</button></div>
      </section>`;
    $("#send").onclick = () => confirmSend();
    $("#gdraft").onclick = () => act("save-draft", {to: $("#to").value, subject: t.subject, body: $("#body").value, mailbox: t.mailbox}, "Saving to Gmail drafts");
    box.querySelectorAll(".gm-s button").forEach(b => b.onclick = () => { $("#instr").value = b.textContent; $("#instr").focus(); });
    const ta = $("#body"); ta.style.height = Math.max(220, ta.scrollHeight + 6) + "px";
  }
  const sk = $("#skip"); if (sk) sk.onclick = e => { e.stopPropagation(); skipThis(e.currentTarget); };
  const go = $("#go"), inp = $("#instr");
  const start = async () => {
    go.disabled = true;
    try { await redraft(inp.value, !!r); } catch (e) { toast(e.message, true); go.disabled = false; }
  };
  go.onclick = start; inp.onkeydown = e => { if (e.key === "Enter") start(); };
}
async function redraft(instruction, revise) {
  const job = await api(`/api/clients/${S.sel.key}/threads/${encodeURIComponent(S.sel.tid)}/draft`, {instruction, revise});
  S.jobs[S.sel.tid] = Object.assign({}, job, {status: "working"}); S.threadSig = job.id + "working"; renderComposer(); loadQueue();
}
async function act(what, body, ok) {
  try { await api(`/api/clients/${S.sel.key}/threads/${encodeURIComponent(S.sel.tid)}/${what}`, body); toast(ok + " (queued for Claude)"); }
  catch (e) { toast(e.message, true); }
}
// Send goes straight out through the send-reply function (Supabase → Composio → Gmail): no PC, no Claude.
S.sent = {}; S.sending = {};
async function sendNow(payload) {
  await window.whenAuthed;
  const {data, error} = await SB.functions.invoke("send-reply", {body: payload});
  if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) {} throw new Error(m); }
  if (!data || !data.ok) throw new Error((data && data.error) || "no answer");
  return data;
}
function confirmSend() {
  const t = S.thread, to = $("#to").value.trim(), body = $("#body").value.trim();
  if (!to || !body) return toast("To and reply text are needed", true);
  $("#cfMeta").innerHTML = `From <b>${esc(t.mailbox)}</b> → <b>${esc(to)}</b> · “${esc(t.subject)}”`;
  $("#cfBody").textContent = body;
  const dlg = $("#confirm");
  dlg.onclose = async () => {
    if (dlg.returnValue !== "send") return;
    const key = S.sel.key, tid = S.sel.tid;
    S.sending[tid] = 1; renderComposer();
    try { await sendNow({client: key, thread_id: tid, to, body, mailbox: t.mailbox, confirm: "SEND"});
      delete S.sending[tid]; S.sent[tid] = Date.now();
      if (S.mc) S.mc.rows = (S.mc.rows || []).filter(r => r.thread_id !== tid);
      toast(`Sent from ${t.mailbox}`); await loadQueue(); renderRail(); if (S.sel && S.sel.tid === tid) openThread(key, tid, true); }
    catch (e) { delete S.sending[tid]; if (S.sel && S.sel.tid === tid) renderComposer(); toast("Not sent: " + e.message, true); }
  };
  dlg.showModal();
}

// ---------------- right panel: link comparison · recap · Ask Claude ----------------
const numOf = v => { const s = String(v ?? "").replace(/,/g, "").trim().toLowerCase(); const m = s.match(/^([\d.]+)\s*([km])?/); if (!m) return null; return parseFloat(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1); };
function renderCtx() {
  const t = S.thread; if (!t || !S.sel) { $("#ctx").innerHTML = ""; return; }
  const j = S.jobs[S.sel.tid] || t.job, r = (j && j.result) || {}, b = r.brief || {}, r0 = rowOf(S.sel.tid) || {};
  const m = (t.metrics || [])[0];
  const dom = r0.domain || (m && m["Partner domain"]) || "";
  // 1 · link comparison
  let cmp;
  if (m) {
    const rows = [["Domain rating", m["Partner DR"], m["Our DR"]],
      ["Traffic / mo", m["Partner page traffic/mo"] || m["Partner domain traffic/mo"], m["Our page traffic/mo"]],
      ["AI visibility", m["AI retrievals (MaxVisibility)"], m["Our AI retrievals"] || ""]].filter(x => x[1] || x[2]);
    const cell = (a, o) => { const x = numOf(a), y = numOf(o); return `<td class="${x != null && y != null && x > y ? "win" : ""}">${esc(a || "–")}</td>`; };
    // verdict: amber only when Claude flagged a decision; otherwise the sheet's deal note, shown as-is
    const vText = r.needs_user_decision && r.decision_question ? ["check", "Check before sending", r.decision_question]
      : m["Deal / verdict"] ? ["note", "Deal", m["Deal / verdict"]] : r.draft_body ? ["go", "Good to send", r.summary || ""] : null;
    const theirPage = m["Partner page (where we'd be listed)"] && m["Partner page (where we'd be listed)"] !== "(domain)" ? m["Partner page (where we'd be listed)"] : "";
    const href = u => /^https?:/i.test(u) ? u : "https://" + u;
    cmp = `${vText ? `<div class="verdict ${vText[0]}"><b>${esc(vText[1])}</b>${esc(vText[2])}</div>` : ""}
      <table class="cmp"><thead><tr><th></th><th>Their page</th><th>Our page</th></tr></thead><tbody>
      ${rows.map(([l, a, o]) => `<tr><td>${l}</td>${cell(a, o)}${cell(o, a)}</tr>`).join("")}</tbody></table>
      <div class="pg">${theirPage ? `<span>Their page</span><a href="${esc(href(theirPage))}" target="_blank" rel="noopener noreferrer">${esc(theirPage)}</a>` : ""}
        ${m["Our page (where partner goes)"] ? `<span>Our page</span><a href="${esc(href(m["Our page (where partner goes)"]))}" target="_blank" rel="noopener noreferrer">${esc(m["Our page (where partner goes)"])}</a>` : ""}</div>
      <div class="asof">From the client sheet · ${esc([m["Date checked"], m["Source"]].filter(Boolean).join(" · ") || "date not logged")}</div>`;
  } else {  // new or unchecked partner: same table, dashes until the numbers are logged
    cmp = (r.needs_user_decision && r.decision_question ? `<div class="verdict check"><b>Check before sending</b>${esc(r.decision_question)}</div>` : "") +
      `<table class="cmp"><thead><tr><th></th><th>Their page</th><th>Our page</th></tr></thead><tbody>
       ${["Domain rating", "Traffic / mo", "AI visibility"].map(l => `<tr><td>${l}</td><td>–</td><td>–</td></tr>`).join("")}</tbody></table>
       <div class="asof">Not checked yet · no row for ${esc(dom || "this partner")} in the client's “Ahrefs – Partner Checks” sheet</div>`;
  }
  // 2 · recap
  const tl = b.timeline || [];
  const steps = tl.map(x => `<div class="step done"><i></i><span>${esc(x.text)} <small>· ${esc(x.date)}</small></span></div>`).join("") +
    (b.we_must_do ? `<div class="step now"><i></i><span>${esc(b.we_must_do)}</span></div>` : "");
  const story = b.story || r.summary || "";
  const call = r.needs_user_decision && r.decision_question ? r.decision_question : b.we_must_do || b.they_want || "";
  $("#ctx").innerHTML = `
    <section class="box"><div class="ch"><span>The two links</span><span>${esc(dom)}</span></div>${cmp}
      <button class="btn ah" id="ahBtn" title="Asks Claude to propose the exact check; nothing runs until you confirm">Refresh from Ahrefs…</button></section>
    <section class="box rc"><div class="ch"><span>Recap</span></div>
      ${steps ? `<h4>So far</h4><div class="steps">${steps}</div>` : ""}
      ${story ? `<h4>The story</h4><p class="story">${esc(story)}</p>` : ""}
      ${call ? `<h4>Your call</h4><p class="call">${esc(call)}</p>` : ""}
      ${!steps && !story && !call ? `<p class="none">No recap yet. It is written with the draft.</p>` : ""}
    </section>
    <section class="box chat"><div class="ch"><span>Ask Claude about this email</span><span>${esc(dom)}</span></div>
      <div class="cm" id="chatLog"></div>
      <form class="cq" id="chatForm"><input id="chatIn" placeholder="Ask anything about this thread…" aria-label="Ask Claude about this email" autocomplete="off"><button class="cs" aria-label="Send">↑</button></form>
    </section>`;
  $("#ahBtn").onclick = askAhrefs;
  $("#chatForm").onsubmit = sendChat;
  renderChat();
}
async function askAhrefs() {
  const r0 = rowOf(S.sel.tid) || {}, dom = r0.domain || "";
  if (!confirm(`Ask Claude to prepare an Ahrefs check for ${dom || "this partner"}?\n\nClaude replies here with the exact pages and Ahrefs units first. Nothing is pulled until you confirm in this chat.`)) return;
  await chatReq(`Prepare an Ahrefs check for ${dom} (their page and our page in this thread). Reply with the exact targets, metrics and units first; do not call Ahrefs until I confirm.`);
}
const pendingChat = [];
async function chatReq(text) {
  try {
    await window.whenAuthed;
    const {error} = await SB.from("requests").insert({type: "chat", client: S.sel.key, thread_id: S.sel.tid, payload: {text, page: "reply", thread_id: S.sel.tid}});
    if (error) throw error;
    pendingChat.push({tid: S.sel.tid, q: text}); renderChat();
  } catch (e) { toast("Not sent: " + (e.message || e), true); }
}
async function sendChat(e) {
  e.preventDefault();
  const inp = $("#chatIn"), text = inp.value.trim(); if (!text) return;
  inp.value = ""; await chatReq(text);
}
function renderChat() {
  const box = $("#chatLog"); if (!box || !S.sel) return;
  const tid = S.sel.tid;
  const log = (S.chat || []).filter(m => m.thread_id === tid);
  const open = (S.reqs || []).filter(r => r.type === "chat" && (r.thread_id === tid || (r.payload || {}).thread_id === tid));
  for (let i = pendingChat.length - 1; i >= 0; i--) if (log.some(m => m.q === pendingChat[i].q) || open.some(r => (r.payload || {}).text === pendingChat[i].q)) pendingChat.splice(i, 1);
  const items = [], sentAt = t => t ? new Date(t).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false}) : "";
  log.forEach((m, i) => { items.push(`<div class="bub me">${esc(m.q)}<span class="qs done">✓ Answered · ${sentAt(m.at_a)}</span></div>`);
    items.push(`<div class="bub ai">${esc(m.a)}<button class="use" data-i="${i}">Redraft the reply with this</button></div>`); });
  // each open question shows where it is: sending → sent → Claude working → (answer appears above)
  const stateOf = r => r.status === "received" ? ["work", "Claude is working on it"]
    : S.online ? ["work", "Claude is reading your question"] : ["wait", "Sent · waiting for Claude to start"];
  open.forEach(r => { const [k, txt] = stateOf(r);
    items.push(`<div class="bub me">${esc((r.payload || {}).text)}<span class="qs ${k}">${k === "work" ? '<span class="dots"><i></i><i></i><i></i></span>' : '<span class="clk"></span>'}${txt} · ${sentAt(r.created_at)}</span></div>`); });
  pendingChat.filter(p => p.tid === tid).forEach(p => items.push(`<div class="bub me">${esc(p.q)}<span class="qs wait"><span class="spin"></span>Sending to Claude…</span></div>`));
  if (open.some(r => r.status !== "received") && !S.online)
    items.push(`<div class="bub w">Claude isn't running on the office PC right now, so the answer comes at the next desk run (7:25 / 1:25) or when someone starts a desk session. Your question is saved.</div>`);
  if (!items.length) items.push(`<div class="hint">Ask about this partner, their pages or what to reply. Claude answers here, and one click turns the answer into a new draft.</div>`);
  const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = items.join("");
  if (atEnd) box.scrollTop = box.scrollHeight;
  box.querySelectorAll(".use").forEach(btn => btn.onclick = async () => {
    const m = log[+btn.dataset.i]; btn.disabled = true;
    try { const j = S.jobs[S.sel.tid] || (S.thread || {}).job; await redraft(`Follow this advice: ${m.a}`, !!(j && j.result)); toast("Redraft asked for"); }
    catch (e) { toast(e.message, true); btn.disabled = false; }
  });
}

// ---------------- rules & decisions ----------------
async function openKnow() {
  const k = await api("/api/knowledge");
  $("#knowBody").innerHTML = `<div class="row" style="justify-content:space-between"><h2>Rules &amp; decisions</h2><button class="btn" id="kClose">Close</button></div>
    <div class="m">Every draft reads these rules, the memory notes (${esc((k.memory_files || []).join(", "))}) and the client state in ${esc(k.handover)}.</div>
    <div class="k-grid"><div><div class="ch"><span>Learned rules</span></div><textarea id="learned">${esc(k.learned)}</textarea><div class="row end" style="margin-top:8px"><button class="btn pri" id="saveL">Save rules</button></div></div>
    <div><div class="ch"><span>Decision log · ${(k.decisions || []).length}</span></div><ul class="k-log">${(k.decisions || []).map(d => `<li><b>${esc(d.client)} · ${esc(d.action)}</b> <span class="m">${esc((d.ts || "").slice(0, 16).replace("T", " "))}</span><div class="m">${esc(d.subject)}${d.edited ? " · edited before send" : ""}</div>${d.instruction ? `<div class="m">“${esc(d.instruction)}”</div>` : ""}</li>`).join("") || '<li class="m">No decisions yet.</li>'}</ul></div></div>`;
  $("#kClose").onclick = () => $("#know").close();
  $("#saveL").onclick = async () => { await api("/api/knowledge/learned", {text: $("#learned").value}); toast("Rules saved"); };
  $("#know").showModal();
}

// ---------------- wiring ----------------
$("#qSearch").oninput = e => { S.search = e.target.value; loadQueue(); };
$("#qSearch").onkeydown = e => { if (e.key === "Escape") { e.target.value = ""; S.search = ""; $("#searchBox").hidden = true; loadQueue(); } };
$("#searchBtn").onclick = () => { const b = $("#searchBox"); b.hidden = !b.hidden; if (!b.hidden) $("#qSearch").focus(); else { $("#qSearch").value = ""; S.search = ""; loadQueue(); } };
$("#openKnow").onclick = openKnow;
$("#pullOne").onclick = async () => {
  try { if (!S.client) { await api("/api/refresh-all", {}); toast("Pull queued for all clients"); return; }
    await api(`/api/clients/${S.client}/refresh`, {}); toast("Pull queued"); } catch (e) { toast(e.message, true); }
};
document.querySelectorAll(".views button").forEach(b => b.onclick = () => setView(b.dataset.v));
document.addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input,textarea,dialog,[contenteditable]")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "j") { e.preventDefault(); step(1); }
  else if (e.key === "k") { e.preventDefault(); step(-1); }
  else if (e.key === "s" && S.sel) { e.preventDefault(); skipThis($("#skipTop")); }
  else if (e.key === "/") { e.preventDefault(); $("#searchBox").hidden = false; $("#qSearch").focus(); }
});
S.client = new URLSearchParams(location.search).get("c") || "";
Shell.mount("reply", S.client, k => pickClient(k));
tick(); setInterval(() => { if (!document.hidden) tick(); }, 5000);  // paused while the tab is hidden
document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
