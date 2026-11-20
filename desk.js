// Outreach Desk — one page. Email text is always inserted through esc(): never as HTML.
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
// Cloud version: every read comes from Supabase (after login); every action is a request row the PC worker handles.
const snap = async key => { await window.whenAuthed; const {data, error} = await SB.from("desk_state").select("value,updated_at").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message); return data ? data.value : null; };
const openReqs = async () => { const {data} = await SB.from("requests").select("id,type,client,thread_id,payload,status,created_at").in("status", ["pending", "received"]).order("created_at"); return data || []; };
const addReq = async (type, client, thread_id, payload) => { await window.whenAuthed;
  const {data, error} = await SB.from("requests").insert({type, client, thread_id, payload: payload || {}}).select("id,created_at").single();
  if (error) throw new Error(error.message); return {id: data.id, status: "working", thread_id, client, instruction: (payload || {}).instruction || "", started: data.created_at}; };
const asked = new Set();
const api = async (path, body) => {
  const u = new URL(path, location.origin), p = u.pathname.split("/").filter(Boolean).slice(1), post = body !== undefined;
  if (!post && p[0] === "jobs") {
    const [j, reqs] = await Promise.all([snap("jobs"), openReqs()]);
    const map = {}; ((j && j.jobs) || []).forEach(x => map[x.thread_id] = x);
    for (const r of reqs) {
      if (r.type === "draft") map[r.thread_id] = Object.assign({}, map[r.thread_id] || {}, {id: r.id, client: r.client, thread_id: r.thread_id, status: "working", instruction: (r.payload || {}).instruction || "", started: r.created_at});
      if (r.type === "send" && map[r.thread_id]) map[r.thread_id] = Object.assign({}, map[r.thread_id], {status: "sending"});
    }
    return {jobs: Object.values(map), pending: reqs.length, worker_online: !!(j && j.worker_online), oldest: reqs[0] && reqs[0].created_at};
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

const toast = (msg, err, onClick) => {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  if (onClick) t.onclick = () => { onClick(); t.remove(); };
  $("#toasts").append(t); setTimeout(() => t.remove(), err ? 9000 : 6000);
};
const ago = d => d < 1 ? `${Math.max(1, Math.round(d * 24))}h` : `${Math.round(d)}d`;
const initials = s => (s || "?").replace(/<.*>/, "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
const addrOf = s => ((s || "").match(/<([^>]+)>/) || [, s || ""])[1].trim().toLowerCase();
const nameOf = s => (s || "").split("<")[0].replace(/"/g, "").trim() || addrOf(s);
const fmtTs = ts => { const n = Number(ts); const d = isNaN(n) ? new Date(ts) : new Date(n > 1e11 ? n : n * 1000);
  return isNaN(d) ? String(ts || "") : d.toLocaleString([], {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}); };
const hue = s => { let h = 0; for (const c of s || "") h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 38%)`; };
const STAGES = [["proposed", "Proposed"], ["agreed", "Agreed"], ["partner_live", "Their side live"], ["our_live", "Our side live"], ["closed", "Closed"]];

const S = {overview: null, client: "", queue: null, open: {others: false}, thread: null, sel: null, jobs: {}, online: false, threadSig: "", showOlder: false};

// ---------------- polling ----------------
async function tick() {
  try {
    const j = await api("/api/jobs");
    S.online = j.worker_online;
    window.__claudeOnline = j.worker_online;
    const next = {}; j.jobs.forEach(x => next[x.thread_id] = x);
    for (const x of j.jobs) {
      const was = S.jobs[x.thread_id];
      if (was && /^(working|sending)/.test(was.status) && x.status === "ready") toast(`Draft ready · ${x.subject || ""}`, false, () => openThread(x.client, x.thread_id));
      if (was && /^(working|sending)/.test(was.status) && x.status === "error") toast(`Failed · ${x.error || ""}`, true);
    }
    for (const tid of Object.keys(S.jobs)) if (S.jobs[tid].status === "sending" && !next[tid]) toast("Sent · " + (S.jobs[tid].subject || ""));
    S.jobs = next;
    await loadSide(); await loadQueue();
    if (S.sel) { const jb = S.jobs[S.sel.tid]; const sig = jb ? jb.id + jb.status : "none";
      if (sig !== S.threadSig || (S.thread && S.thread.loading)) openThread(S.sel.key, S.sel.tid, true); }
  } catch (e) {}
}

// ---------------- sidebar ----------------
async function loadSide() {
  const o = await api("/api/overview"); S.overview = o;   // the sidebar itself is drawn by shell.js
}
function pickClient(k) { S.client = k; $("#app").classList.remove("reading"); if (window.Shell) Shell.setClient(k); loadSide(); loadQueue(); }

// ---------------- queue ----------------
async function loadQueue() {
  const want = S.client;  // a slower answer for a client you already left must not overwrite this one
  const q = await api("/api/queue" + (want ? `?client=${want}` : ""));
  if (want !== S.client) return;
  S.queue = q;
  const term = (S.search || "").trim().toLowerCase();
  if (term) for (const k of ["reply", "done", "client", "paid", "other"])
    q[k] = q[k].filter(r => [r.who, r.domain, r.subject, r.snippet, r.client_name, r.to, r.stage].join(" ").toLowerCase().includes(term));
  const c = S.overview && S.overview.clients.find(x => x.key === S.client);
  $("#qTitle").textContent = c ? c.name : "All clients";
  $("#qSub").textContent = `${q.reply.length} need our reply` + (q.monitor_at ? ` · statuses from monitoring ${new Date(q.monitor_at).toLocaleString([], {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"})}` : "");
  $("#pullOne").title = c ? `Pull ${c.name} from Gmail` : "Pull all clients from Gmail";
  const row = r => {
    const j = r.job, sel = S.sel && S.sel.tid === r.thread_id;
    const tag = j === "ready" && r.outdated ? `<span class="tag call">new email</span>` : j === "ready" ? (r.decision ? `<span class="tag call">your call</span>` : `<span class="tag ready">draft ready</span>`)
      : /^(working|sending)/.test(j) ? `<span class="tag busy"><span class="spin"></span> ${j === "sending" ? "sending" : "drafting"}</span>`
      : j === "error" ? `<span class="tag err">failed</span>` : "";
    return `<button class="qi" data-k="${esc(r.client)}" data-t="${esc(r.thread_id)}" aria-current="${sel}">
      <span class="r1">${S.client ? "" : `<span class="cdot" style="background:${esc(r.color)}" title="${esc(r.client_name)}"></span>`}
        <span class="who">${esc(r.who)}</span><span class="age ${r.age_days >= 3 ? "old" : ""}">${ago(r.age_days)}</span></span>
      <span class="subj">${esc(r.subject.replace(/^(re:\s*)+/i, ""))}</span>
      ${r.snippet ? `<span class="snip">${esc(r.snippet)}</span>` : ""}
      <span class="tags">${S.client ? "" : `<span class="tag">${esc(r.client_name)}</span>`}${r.followup ? '<span class="tag fu">follow-up</span>' : r.bucket !== "our" ? `<span class="tag">${esc(r.stage)}</span>` : ""}${tag}</span></button>`;
  };
  const TABS = [["reply", "Needs our reply"], ["client", "Waiting on them"], ["done", "Completed"], ["paid", "Paid"], ["other", "Other"]];
  const tab = S.tab || "reply";
  $("#qTabs").innerHTML = TABS.map(([k, l]) => `<button role="tab" class="q-tab ${k === "reply" ? "hot" : ""}" data-tab="${k}" aria-selected="${tab === k}">${l}<span class="n">${q[k].length}</span></button>`).join("");
  document.querySelectorAll(".q-tab").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; loadQueue(); });
  const empty = {reply: `Nothing needs our reply${S.client ? " here" : ""}. ✓`, client: "No thread is waiting on them.", done: "No completed exchanges yet.", paid: "No paid-only replies.", other: "Nothing else."}[tab];
  $("#qList").innerHTML = q[tab].length ? q[tab].map(row).join("") : `<div class="q-empty">${term ? `No match for “${esc(S.search)}” here. Counts on the buttons show where it matches.` : empty}</div>`;
  document.querySelectorAll(".qi").forEach(b => b.onclick = () => openThread(b.dataset.k, b.dataset.t));
  document.querySelectorAll(".q-sec").forEach(b => b.onclick = () => { S.open[b.dataset.sec] = !S.open[b.dataset.sec]; loadQueue(); });
}

// ---------------- thread + composer ----------------
async function openThread(key, tid, quiet) {
  const changed = !S.sel || S.sel.tid !== tid;
  S.sel = {key, tid}; $("#app").classList.add("reading");
  if (changed) { S.showOlder = false; document.querySelectorAll(".qi").forEach(b => b.setAttribute("aria-current", b.dataset.t === tid));
    if (!quiet) $("#work").innerHTML = `<div class="empty-state"><div class="es-s"><span class="spin"></span> Opening…</div></div>`; }
  const t = await api(`/api/clients/${key}/threads/${encodeURIComponent(tid)}`);
  if (!S.sel || S.sel.tid !== tid) return;
  if (t.job) S.jobs[tid] = t.job;
  const jb = S.jobs[tid]; S.threadSig = jb ? jb.id + jb.status : "none";
  // keep what the user is typing: skip the re-render while they are in the composer
  if (quiet && !changed && S.thread && !S.thread.loading && !t.loading && document.activeElement && $("#work").contains(document.activeElement)) { S.thread = t; renderBrief(); return; }
  S.thread = t; renderWork(); renderBrief();
}

function statusLabel(tid) {
  const q = S.queue || {}, names = {done: "Completed · link secured", client: "Waiting on their reply", paid: "Paid", other: "Other"};
  const r = (q.reply || []).find(x => x.thread_id === tid);
  if (r) return r.followup ? "Follow-up due" : "Needs our reply";
  for (const k of Object.keys(names)) if ((q[k] || []).some(x => x.thread_id === tid)) return names[k];
  return "Not in monitoring";
}

function renderWork() {
  const t = S.thread, c = S.overview.clients.find(x => x.key === S.sel.key) || {};
  const subj = esc((t.subject || "").replace(/^(re:\s*)+/i, ""));
  const head = `<div class="gm-head"><h2 class="gm-subj">${subj}</h2>
      <span class="gm-label" style="--lc:${esc(c.color)}">${esc(c.name)}</span>
      <span class="gm-label gm-label-plain">${esc(statusLabel(S.sel.tid))}</span></div>`;
  if (t.loading) {
    $("#work").innerHTML = `<div class="gm">${head}<div class="gm-reply"><div class="gm-wait"><span class="spin"></span> ${S.online ? "Claude is fetching this thread from Gmail…" : "Queued. No Claude session is working the desk right now; it will be picked up at the next scheduled run (7:25 / 1:25) or when a session is asked to work the desk."}</div></div></div>`;
    return;
  }
  const ours = (c.mailboxes || []).map(m => m.toLowerCase());
  const msgs = t.messages || [];
  // Order (user, 20 Nov): [View previous replies] → latest reply from them → draft at the bottom.
  const lastIdx = msgs.length - 1;
  const lastIsOurs = lastIdx >= 0 && ours.includes(addrOf(msgs[lastIdx].from));
  const theirIdx = msgs.map((m, i) => [m, i]).reverse().find(([m]) => !ours.includes(addrOf(m.from)));
  const latestIdx = lastIsOurs && t.meta && t.meta.status === "follow-up-due" ? lastIdx : (theirIdx ? theirIdx[1] : lastIdx);
  const mail = m => {
    const us = ours.includes(addrOf(m.from));
    return `<div class="gm-msg">
      <span class="gm-av" style="background:${us ? esc(c.color) : hue(addrOf(m.from))}">${esc(initials(nameOf(m.from)).slice(0, 1))}</span>
      <div class="gm-main">
        <div class="gm-mh"><div class="gm-who"><span class="gm-name">${esc(nameOf(m.from))}</span> <span class="gm-addr">&lt;${esc(addrOf(m.from))}&gt;</span>
          <div class="gm-to">to ${esc(us ? nameOf(m.to) : "me")} ▾</div></div>
          <div class="gm-date">${esc(fmtTs(m.ts))}<span class="gm-ico" aria-hidden="true">☆</span><span class="gm-ico" aria-hidden="true">↩</span><span class="gm-ico" aria-hidden="true">⋮</span></div></div>
        <div class="gm-body">${esc(m.text)}</div></div></div>`;
  };
  const earlier = msgs.filter((m, i) => i !== latestIdx);
  $("#work").innerHTML = `<div class="gm">${head}
    <details class="brief-inline"><summary>Brief <span class="bi-s" id="biS"></span><span class="m">▾</span></summary><div id="briefInline"></div></details>
    ${earlier.length ? `<button class="gm-older" id="prevBar" aria-expanded="${S.showOlder}"><span class="gm-older-n">${earlier.length}</span><span class="gm-older-t">${S.showOlder ? "Hide previous replies" : "View previous replies"}</span></button>
      ${S.showOlder ? earlier.map(mail).join("") : ""}` : ""}
    ${latestIdx >= 0 ? mail(msgs[latestIdx]) : ""}
    <div id="composer"></div></div>`;
  const pb = $("#prevBar"); if (pb) pb.onclick = () => { S.showOlder = !S.showOlder; renderWork(); renderBrief(); };
  renderComposer();
}

function renderComposer() {
  // Two clear blocks: 1) the reply itself (who, to, subject, text, actions) 2) "Ask Claude to change it" with suggestions.
  const box = $("#composer"); if (!box) return;
  const t = S.thread, j = S.jobs[S.sel.tid] || t.job, r = j && j.result;
  const meta = t.meta || {}, partner = nameOf(meta.partner || "") || meta.to || "them";
  const subj = "Re: " + (t.subject || "").replace(/^(re:\s*)+/i, "");
  const ask = (btn, withSugs) => `<section class="ai-card" aria-label="Ask Claude to change the draft">
      <div class="ai-h"><span class="gm-spark" aria-hidden="true">✦</span><b>${btn === "Draft" ? "Ask Claude to write the reply" : "Ask Claude to change this draft"}</b></div>
      <p class="ai-hint">${btn === "Draft" ? "Leave it empty for the obvious reply, or say what you want." : "Say what to change. Claude rewrites it; you can work on other emails meanwhile."}</p>
      <div class="ai-row"><input id="instr" placeholder="e.g. accept 1:1, offer our webcast article, make it shorter" aria-label="Instruction for Claude"><button class="ai-go" id="go">${btn}</button></div>
      ${withSugs && (r.suggestions || []).length ? `<div class="ai-sugs"><div class="ai-sl">Suggestions</div>${r.suggestions.map(s => `<button class="gm-schip">${esc(s)}</button>`).join("")}</div>` : ""}
    </section>`;
  if (j && /^(working|sending)/.test(j.status)) {
    box.innerHTML = `<section class="dr-card"><div class="dr-wait"><span class="spin"></span><div><b>${j.status === "sending" ? "Sending…" : "Claude is drafting"}</b>
      <div>${j.instruction ? `“${esc(j.instruction)}” · ` : ""}Move on to the next email; you'll get a note when it's ready.</div></div></div></section>`; return;
  }
  if (!r || (r.category === "no-reply-needed" && !r.draft_body)) {
    box.innerHTML = `<section class="dr-card"><div class="dr-head"><div><div class="dr-title">${r ? "No reply needed" : "No draft yet"}</div>
        <div class="dr-sub">To ${esc(meta.to || partner)} · from ${esc(t.mailbox || "")}</div></div>
        ${r ? "" : `<button class="dr-txt" id="skip">Skip, no reply</button>`}</div>
        ${r ? `<p class="dr-note">${esc(r.summary)}</p>` : ""}</section>${ask("Draft", false)}`;
  } else {
    box.innerHTML = `<section class="dr-card" aria-label="Reply">
        ${j.outdated ? `<div class="dr-warn">A new email arrived after this draft was written. Ask Claude to redraft it below.</div>` : ""}
        <div class="dr-head"><div><div class="dr-title">Reply to ${esc(partner)}</div>
          <div class="dr-sub">from ${esc(t.mailbox || "")} · <span class="dr-cat">${esc(r.category)}</span>${j.auto ? " · drafted automatically" : ""}</div></div></div>
        <div class="dr-fields">
          <label class="dr-row"><span>To</span><input id="to" value="${esc(j.to || meta.to || "")}" aria-label="To"></label>
          <div class="dr-row"><span>Subject</span><div class="dr-subj">${esc(subj)}</div></div>
        </div>
        <textarea class="dr-body" id="body" spellcheck="true" aria-label="Reply text">${esc(r.draft_body)}</textarea>
        <div class="dr-actions"><button class="gm-send" id="send">Send</button><button class="dr-txt" id="gdraft">Save to Gmail</button>
          <span class="sp"></span><button class="dr-txt dr-skip" id="skip">Skip, no reply</button></div>
      </section>${ask("Redraft", true)}`;
    $("#send").onclick = () => confirmSend();
    $("#gdraft").onclick = () => act("save-draft", {to: $("#to").value, subject: t.subject, body: $("#body").value, mailbox: t.mailbox}, "Saving to Gmail drafts");
    box.querySelectorAll(".gm-schip").forEach(b => b.onclick = () => { $("#instr").value = b.textContent; $("#instr").focus(); });
    const ta = $("#body"); ta.style.height = Math.max(240, ta.scrollHeight + 6) + "px";
  }
  const sk = $("#skip"); if (sk) sk.onclick = () => act("skip", {reason: ($("#instr") || {}).value || ""}, "Skipped and logged");
  const go = $("#go"), inp = $("#instr");
  const start = async () => {
    go.disabled = true;
    try { const job = await api(`/api/clients/${S.sel.key}/threads/${encodeURIComponent(S.sel.tid)}/draft`, {instruction: inp.value, revise: !!r});
      S.jobs[S.sel.tid] = Object.assign({}, job, {status: "working"}); S.threadSig = job.id + "working"; renderComposer(); loadQueue(); }
    catch (e) { toast(e.message, true); go.disabled = false; }
  };
  go.onclick = start; inp.onkeydown = e => { if (e.key === "Enter") start(); };
}

async function act(what, body, ok) {
  try { await api(`/api/clients/${S.sel.key}/threads/${encodeURIComponent(S.sel.tid)}/${what}`, body); toast(ok + " (queued for Claude)"); }
  catch (e) { toast(e.message, true); }
}
function confirmSend() {
  const t = S.thread, to = $("#to").value.trim(), body = $("#body").value.trim();
  if (!to || !body) return toast("To and reply text are needed", true);
  $("#cfMeta").innerHTML = `From <b>${esc(t.mailbox)}</b> → <b>${esc(to)}</b> · “${esc(t.subject)}”`;
  $("#cfBody").textContent = body;
  const dlg = $("#confirm");
  dlg.onclose = async () => {
    if (dlg.returnValue !== "send") return;
    try { await api(`/api/clients/${S.sel.key}/threads/${encodeURIComponent(S.sel.tid)}/send`, {confirm: "SEND", to, body, mailbox: t.mailbox});
      toast(`Send queued from ${t.mailbox}`); S.jobs[S.sel.tid] = Object.assign({}, S.jobs[S.sel.tid], {status: "sending"}); renderComposer(); }
    catch (e) { toast("Not sent: " + e.message, true); }
  };
  dlg.showModal();
}

// ---------------- brief ----------------
function renderBrief() {
  const t = S.thread; if (!t || !S.sel) return;
  const j = S.jobs[S.sel.tid] || t.job, r = (j && j.result) || {}, b = r.brief || {};
  const si = STAGES.findIndex(s => s[0] === b.stage);
  const sec = (h, body) => body ? `<section><div class="b-h">${h}</div>${body}</section>` : "";
  const metrics = (t.metrics || []).map(m => `<div class="m-card">
      <div class="m-title">${esc(m["Partner domain"])}${m["Partner page (where we'd be listed)"] && m["Partner page (where we'd be listed)"] !== "(domain)" ? " · " + esc(m["Partner page (where we'd be listed)"]) : ""}</div>
      <table class="mt">${[["Partner DR", m["Partner DR"]], ["Domain traffic/mo", m["Partner domain traffic/mo"]], ["Page traffic/mo", m["Partner page traffic/mo"]],
        ["AI retrievals", m["AI retrievals (MaxVisibility)"]], ["Our page", m["Our page (where partner goes)"]], ["Our DR", m["Our DR"]], ["Our page traffic/mo", m["Our page traffic/mo"]]]
        .filter(x => x[1]).map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join("")}</table>
      ${m["Deal / verdict"] ? `<div class="verdict">${esc(m["Deal / verdict"])}</div>` : ""}<div class="m">${esc(m["Date checked"])} · ${esc(m["Source"])}</div></div>`).join("");
  const html = `<div class="brief">
    ${si >= 0 ? sec("Stage", `<div class="stage">${STAGES.map((s, i) => `<i class="${i <= si ? "on" : ""}"></i>`).join("")}</div><div class="stage-l"><b>${STAGES[si][1]}</b><span>${si + 1} of 5</span></div>`) : ""}
    ${sec("In short", r.summary ? `<div class="b-p">${esc(r.summary)}</div>` : `<div class="b-p m">No brief yet. It is written with the draft.</div>`)}
    ${sec("Your call", r.needs_user_decision && r.decision_question ? `<div class="decide">${esc(r.decision_question)}</div>` : "")}
    ${sec("You need to", b.we_must_do ? `<div class="todo">${esc(b.we_must_do)}</div>` : "")}
    ${sec("They want", b.they_want ? `<div class="b-p">${esc(b.they_want)}</div>` : "")}
    ${sec("Checks", (b.checks || []).length ? `<div class="checks">${b.checks.map(x => `<div class="ck ${x.ok === true ? "ok" : x.ok === false ? "no" : "unk"}"><span class="i">${x.ok === true ? "✓" : x.ok === false ? "✗" : "?"}</span><span>${esc(x.text)}</span></div>`).join("")}</div>` : "")}
    ${sec("What happened", (b.timeline || []).length ? `<ul class="tl">${b.timeline.map(x => `<li><span class="d">${esc(x.date)}</span>${esc(x.text)}</li>`).join("")}</ul>` : "")}
    ${sec("Partner metrics", metrics || `<div class="b-p m">Not checked yet. No row for this partner in the client's “Ahrefs – Partner Checks” sheet.</div>`)}
    ${sec("Links", (b.links || []).length ? `<div class="links">${b.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join("")}</div>` : "")}
  </div>`;
  $("#rail").innerHTML = html;
  const bi = $("#briefInline"); if (bi) bi.innerHTML = html;
  const bs = $("#biS"); if (bs) bs.textContent = (r.needs_user_decision && r.decision_question ? "Your call: " + r.decision_question : r.summary || "");
}

// ---------------- rules & decisions ----------------
async function openKnow() {
  const k = await api("/api/knowledge");
  $("#knowBody").innerHTML = `<div class="row" style="justify-content:space-between"><h2>Rules &amp; decisions</h2><button class="btn ghost sm" id="kClose">Close</button></div>
    <div class="m">Every draft reads these rules, the memory notes (${esc(k.memory_files.join(", "))}) and the client state in ${esc(k.handover)}.</div>
    <div class="k-grid"><div><div class="b-h">Learned rules</div><textarea id="learned">${esc(k.learned)}</textarea><div class="row end" style="margin-top:8px"><button class="btn primary sm" id="saveL">Save rules</button></div></div>
    <div><div class="b-h">Decision log · ${k.decisions.length}</div><ul class="k-log">${k.decisions.map(d => `<li><b>${esc(d.client)} · ${esc(d.action)}</b> <span class="m">${esc(d.ts.slice(0, 16).replace("T", " "))}</span><div class="m">${esc(d.subject)}${d.edited ? " · edited before send" : ""}</div>${d.instruction ? `<div class="m">“${esc(d.instruction)}”</div>` : ""}</li>`).join("") || '<li class="m">No decisions yet.</li>'}</ul></div></div>`;
  $("#kClose").onclick = () => $("#know").close();
  $("#saveL").onclick = async () => { await api("/api/knowledge/learned", {text: $("#learned").value}); toast("Rules saved"); };
  $("#know").showModal();
}

$("#qSearch").oninput = e => { S.search = e.target.value; $("#qClear").hidden = !S.search; loadQueue(); };
$("#qSearch").onkeydown = e => { if (e.key === "Escape") { e.target.value = ""; S.search = ""; $("#qClear").hidden = true; loadQueue(); } };
$("#qClear").onclick = e => { e.preventDefault(); $("#qSearch").value = ""; S.search = ""; $("#qClear").hidden = true; loadQueue(); $("#qSearch").focus(); };
$("#openKnow").onclick = openKnow;
$("#pullOne").onclick = async () => {
  if (!S.client) { await api("/api/refresh-all", {}); toast("Pull queued for all clients"); return; }
  await api(`/api/clients/${S.client}/refresh`, {}); toast("Pull queued");
};
S.client = new URLSearchParams(location.search).get("c") || "";
Shell.mount("reply", S.client, k => pickClient(k));
tick(); setInterval(tick, 3500);
