// Planning (internal team only): market map (hand-filled, saved in Supabase `planning`), refill by day,
// weekly DR growth (sheet_tabs "dr:<key>"), and what each outreach source covers. Admins only.
(() => {
  const CLIENTS = {  // key: [name, Monitoring slug, domain, Status-tab name]
    luca: ["Luca", "luca", "ask-luca.com", "Luca"], easywebinar: ["EasyWebinar", "easywebinar", "easywebinar.com", "EasyWebinar"],
    versatile: ["Versatile Club", "versatile-club", "versatile.club", "Versatile Club"], oliv: ["Oliv AI", "oliv-ai", "oliv.ai", "Oliv AI"],
    maximuslabs: ["MaximusLabs", "maximuslabs", "maximuslabs.ai", "MaximusLabs"], teamvoy: ["Teamvoy", "teamvoy", "teamvoy.com", "Teamvoy"]};
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const fmtD = d => { const t = new Date(d + "T00:00:00"); return isNaN(t) ? d : t.toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"}); };
  const fmtT = t => t ? new Date(t).toLocaleString("en-GB", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}) : "";
  const COLORS = [["green", "Direct competitor"], ["yellow", "Adjacent"], ["red", "Don't pitch"], ["", "Unmarked"]];
  let key = new URLSearchParams(location.search).get("c");
  if (!CLIENTS[key]) key = "luca";
  const st = {editing: false, plan: null, planAt: null, planBy: "", store: "unknown", status: null, trackers: {}, sites: {}, dr: {}, drTable: false};
  const blank = () => ({nodes: [], nonpr: [], pr: []});
  const uid = () => Math.random().toString(36).slice(2, 9);
  const draftKey = () => "planning-draft:" + key;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ---------- data ----------
  async function loadShared() {
    const tabs = ["Status", ...Object.keys(CLIENTS).map(k => "tracker:" + k), ...Object.values(CLIENTS).map(c => "site:" + c[1]), ...Object.keys(CLIENTS).map(k => "dr:" + k)];
    const {data, error} = await SB.from("sheet_tabs").select("tab,rows,updated_at").in("tab", tabs);
    if (error) throw error;
    for (const r of data || []) {
      if (r.tab === "Status") st.status = r;
      else if (r.tab.startsWith("tracker:")) st.trackers[r.tab.slice(8)] = r;
      else if (r.tab.startsWith("site:")) st.sites[r.tab.slice(5)] = r;
      else if (r.tab.startsWith("dr:")) st.dr[r.tab.slice(3)] = r;
    }
    const at = (data || []).map(r => r.updated_at).sort().pop();
    $("copied").textContent = at ? "Data copied " + fmtT(at) : "";
  }
  async function loadPlan() {
    st.plan = null; st.planAt = null; st.planBy = "";
    const {data, error} = await SB.from("planning").select("data,updated_at,updated_by").eq("client", key).maybeSingle();
    if (error) { st.store = /does not exist|schema cache|PGRST205|42P01/i.test(error.message + error.code) ? "missing" : "error"; st.storeErr = error.message; }
    else { st.store = "ok"; if (data) { st.plan = {...blank(), ...data.data}; st.planAt = data.updated_at; st.planBy = data.updated_by || ""; } }
    const draft = lsGet(draftKey());
    if (draft && (!st.planAt || draft.at > st.planAt)) { st.plan = draft.plan; st.hasDraft = true; } else st.hasDraft = false;
    if (!st.plan) st.plan = blank();
  }

  // ---------- 1. market map ----------
  function depthOf(n, nodes) { let d = 1, p = n.parent; while (p) { d++; p = (nodes.find(x => x.id === p) || {}).parent; } return d; }
  function drawMap() {
    const p = st.plan, ed = st.editing;
    $("mmEdit").textContent = ed ? "Done" : "Edit"; $("mmEdit").setAttribute("aria-pressed", ed);
    $("mmSave").hidden = !ed; $("mmSave").disabled = st.store !== "ok";
    $("mmSave").title = st.store === "ok" ? "Save for the whole team" : "Saving is off until planning.sql has run in Supabase";
    $("mmMeta").textContent = (st.planAt ? `Saved ${fmtT(st.planAt)}${st.planBy ? " by " + st.planBy.split("@")[0] : ""}` : "Not saved yet")
      + (st.hasDraft ? " · unsaved draft on this browser" : "") + " · Level 1 = narrowest market, 4 = widest.";
    const kids = id => p.nodes.filter(n => (n.parent || null) === id);
    const li = n => {
      const d = depthOf(n, p.nodes), ch = kids(n.id);
      const body = ed
        ? `<div class="node ${esc(n.color)}" data-id="${n.id}"><span class="lv">L${d}</span>
            <input class="nm-i" data-f="name" value="${esc(n.name)}" placeholder="Market or segment" aria-label="Name">
            <input class="kw-i" data-f="kw" value="${esc(n.kw)}" placeholder="Keyword / market" aria-label="Keyword or market">
            <select data-f="color" aria-label="Colour">${COLORS.map(([v, l]) => `<option value="${v}" ${v === (n.color || "") ? "selected" : ""}>${l}</option>`).join("")}</select>
            ${d < 4 ? `<button class="ibtn" data-act="child" title="Add a wider market under this (level ${d + 1})" aria-label="Add child">+</button>` : ""}
            <button class="ibtn" data-act="del" title="Remove this and everything under it" aria-label="Remove">×</button></div>`
        : `<div class="node ${esc(n.color)}"><span class="lv">L${d}</span><i class="dot ${esc(n.color)}" aria-label="${esc((COLORS.find(c => c[0] === (n.color || "")) || [])[1])}"></i>
            <span class="nm">${esc(n.name || "Untitled")}</span>${n.kw ? `<span class="kw">${esc(n.kw)}</span>` : ""}</div>`;
      return `<li>${body}${ch.length ? `<ul>${ch.map(li).join("")}</ul>` : ""}</li>`;
    };
    const roots = kids(null);
    $("tree").innerHTML = `<div class="lvl-head"><span>L1 narrowest</span><span>L2</span><span>L3</span><span>L4 widest</span></div>`
      + (roots.length ? `<ul class="tree">${roots.map(li).join("")}</ul>` : `<p class="empty">No market map yet.${ed ? "" : " Press Edit to start with the narrowest market (level 1)."}</p>`)
      + (ed ? `<button class="add" data-act="root">+ Add level 1 market</button>` : "");
    drawList("nonpr", "Add a source (e.g. G2, industry report)"); drawList("pr", "Add a PR outlet or network");
  }
  function drawList(f, ph) {
    const list = st.plan[f] || [], ed = st.editing;
    $(f).innerHTML = `<div class="items">${ed
      ? list.map((x, i) => `<div class="row-e" data-i="${i}"><input data-f="name" value="${esc(x.name)}" placeholder="Name or URL" aria-label="Name"><input data-f="note" value="${esc(x.note)}" placeholder="Note" aria-label="Note"><button class="ibtn" data-act="del" aria-label="Remove">×</button></div>`).join("")
        + `<button class="add" data-act="add">+ ${esc(ph)}</button>`
      : list.length ? list.map(x => { const n = String(x.name || ""), u = /^https?:\/\//.test(n) ? n : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(n) ? "https://" + n : "";
          return `<div class="item"><span class="t">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>` : esc(n)}</span>${x.note ? `<span class="n">${esc(x.note)}</span>` : ""}</div>`; }).join("")
        : `<p class="empty">None yet.</p>`}</div>`;
  }
  function touched() { st.hasDraft = true; lsSet(draftKey(), {at: new Date().toISOString(), plan: st.plan}); }
  function bindMap() {
    $("tree").addEventListener("input", e => { const id = e.target.closest("[data-id]")?.dataset.id, f = e.target.dataset.f; if (!id || !f) return;
      const n = st.plan.nodes.find(x => x.id === id); n[f] = e.target.value; touched();
      if (f === "color") { e.target.closest(".node").className = "node " + n.color; } });
    $("tree").addEventListener("click", e => { const b = e.target.closest("[data-act]"); if (!b) return;
      const id = b.closest("[data-id]")?.dataset.id, act = b.dataset.act, nodes = st.plan.nodes;
      if (act === "root" || act === "child") { const n = {id: uid(), parent: act === "child" ? id : null, name: "", kw: "", color: ""}; nodes.push(n); touched(); drawMap();
        document.querySelector(`[data-id="${n.id}"] input`)?.focus(); }
      if (act === "del") { const n = nodes.find(x => x.id === id), gone = new Set([id]); let grew = true;
        while (grew) { grew = false; nodes.forEach(x => { if (x.parent && gone.has(x.parent) && !gone.has(x.id)) { gone.add(x.id); grew = true; } }); }
        if ((gone.size > 1 || n.name) && !confirm(`Remove "${n.name || "this market"}"${gone.size > 1 ? ` and ${gone.size - 1} under it` : ""}?`)) return;
        st.plan.nodes = nodes.filter(x => !gone.has(x.id)); touched(); drawMap(); } });
    for (const f of ["nonpr", "pr"]) {
      $(f).addEventListener("input", e => { const i = e.target.closest("[data-i]")?.dataset.i; if (i == null) return; st.plan[f][i][e.target.dataset.f] = e.target.value; touched(); });
      $(f).addEventListener("click", e => { const b = e.target.closest("[data-act]"); if (!b) return;
        if (b.dataset.act === "add") { (st.plan[f] = st.plan[f] || []).push({name: "", note: ""}); touched(); drawList(f, f === "pr" ? "Add a PR outlet or network" : "Add a source (e.g. G2, industry report)");
          $(f).querySelector(".row-e:last-of-type input")?.focus(); }
        if (b.dataset.act === "del") { st.plan[f].splice(+b.closest("[data-i]").dataset.i, 1); touched(); drawMap(); } });
    }
    $("mmEdit").onclick = () => { st.editing = !st.editing; drawMap(); };
    $("mmSave").onclick = save;
  }
  async function save() {
    const b = $("mmSave"); b.disabled = true; b.textContent = "Saving…";
    try {
      const {data: cur} = await SB.from("planning").select("updated_at,updated_by").eq("client", key).maybeSingle();
      if (cur && st.planAt && cur.updated_at > st.planAt && !confirm(`${(cur.updated_by || "Someone").split("@")[0]} saved this map at ${fmtT(cur.updated_at)}, after you opened it. Overwrite with your version?`)) throw new Error("cancelled");
      const clean = {nodes: st.plan.nodes.filter(n => n.name || n.kw), nonpr: (st.plan.nonpr || []).filter(x => x.name), pr: (st.plan.pr || []).filter(x => x.name)};
      const now = new Date().toISOString(), email = (window.__me || {}).email || "";
      const {error} = await SB.from("planning").upsert({client: key, data: clean, updated_at: now, updated_by: email}, {onConflict: "client"});
      if (error) throw error;
      st.plan = clean; st.planAt = now; st.planBy = email; st.hasDraft = false; lsSet(draftKey(), null); st.editing = false; drawMap();
    } catch (e) { if (e.message !== "cancelled") alert("Not saved: " + (e.message || e)); }
    b.textContent = "Save"; b.disabled = st.store !== "ok";
  }

  // ---------- 2. refill by day ----------
  const isoDay = s => (String(s || "").match(/^\d{4}-\d{2}-\d{2}/) || [""])[0];
  function trackerStats() {
    const t = st.trackers[key]; if (!t) return null;
    const [h, ...rows] = t.rows, ix = n => h.findIndex(x => String(x).toLowerCase().startsWith(n));
    const iS = ix("source"), iD = ix("date added"), iSent = ix("email sent"), iRep = ix("replied"), iApo = ix("apollo account"), iSeq = ix("sequence"), iStat = ix("status");
    const recs = rows.filter(r => r.some(Boolean)).map(r => ({src: String(r[iS] || "").trim() || "(no source)", day: isoDay(r[iD]), sent: /^y/i.test(r[iSent] || ""),
      rep: /^y/i.test(r[iRep] || ""), apollo: !!String(r[iApo] || "").trim(), seq: String(r[iSeq] || "").trim(), status: String(r[iStat] || "").trim()}));
    const by = {};
    recs.forEach(r => { const s = by[r.src] = by[r.src] || {n: 0, last: "", sent: 0, rep: 0}; s.n++; s.sent += r.sent; s.rep += r.rep; if (r.day > s.last) s.last = r.day; });
    return {recs, by, at: t.updated_at};
  }
  function drawRefill() {
    const ts = trackerStats(), name = CLIENTS[key][3];
    const stat = {};
    if (st.status) { const [h, ...rows] = st.status.rows, i = n => h.findIndex(x => String(x).toLowerCase().startsWith(n));
      const iD = i("date"), iC = i("client"), iW = i("waiting"), iA = i("added"), iL = i("left");
      rows.filter(r => r[iC] === name).forEach(r => stat[isoDay(r[iD])] = {bank: r[iW], added: r[iA], left: r[iL]}); }
    if (!ts && !Object.keys(stat).length) { $("refill").innerHTML = `<p class="empty" style="padding:14px">No tracker or Status rows copied for ${esc(CLIENTS[key][0])} yet.</p>`; $("rfMeta").textContent = ""; return; }
    const srcs = ts ? Object.keys(ts.by).sort((a, b) => ts.by[b].n - ts.by[a].n) : [];
    const days = new Set(Object.keys(stat)); (ts ? ts.recs : []).forEach(r => days.add(r.day));
    const list = [...days].sort((a, b) => (b || "0").localeCompare(a || "0"));  // undated last
    const cnt = {}; (ts ? ts.recs : []).forEach(r => { const k = r.day + "|" + r.src; cnt[k] = (cnt[k] || 0) + 1; });
    const num = v => v ? String(v) : `<span class="z">0</span>`, tot = {};
    const body = list.map(d => { let sum = 0; const cells = srcs.map(s => { const v = cnt[d + "|" + s] || 0; sum += v; tot[s] = (tot[s] || 0) + v; return `<td>${num(v)}</td>`; }).join("");
      const b = stat[d]; return `<tr><td>${d ? fmtD(d) : "Undated"}</td><td title="${b ? `Status: waiting at start ${esc(b.bank)}, added ${esc(b.added)}, left in pool ${esc(b.left)}` : "No Status row this day"}">${b ? esc(b.bank) : `<span class="z">–</span>`}</td>${cells}<td><b>${num(sum)}</b></td></tr>`; }).join("");
    const all = srcs.reduce((a, s) => a + tot[s], 0);
    const inBank = ts ? ts.recs.filter(r => !r.sent).length : null;
    $("refill").innerHTML = `<table class="t"><thead><tr><th>Date</th><th title="Status tab: waiting at start of the day">Companies in bank</th>${srcs.map(s => `<th>${esc(s)}</th>`).join("")}<th>Total</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td>Total</td><td title="Tracker rows not emailed yet">${inBank == null ? "–" : inBank + " now"}</td>${srcs.map(s => `<td>${tot[s]}</td>`).join("")}<td>${all}</td></tr></tfoot></table>`;
    $("rfMeta").textContent = "Companies added per source by 'Date added' (Outreach Tracker) · bank = Status 'waiting at start'";
  }

  // ---------- 3. DR growth ----------
  function drawDR() {
    const r = st.dr[key], dom = CLIENTS[key][2];
    $("drTbl").hidden = !r;
    if (!r) {
      $("dr").innerHTML = `<div class="req"><b>No DR history for ${esc(dom)} yet.</b>
        <span>Waiting on an Ahrefs pull: <code>${esc(dom)}</code> · Domain Rating history · weekly · last 12 months. The team asks before every Ahrefs call.</span>
        ${window.DR && window.DR[dom] != null ? `<span>Latest single DR we have: <b>${window.DR[dom]}</b></span>` : ""}</div>`; return;
    }
    const v = r.rows, pts = (v.weeks || []).filter(x => x && x[0] && x[1] != null);
    if (!pts.length) { $("dr").innerHTML = `<p class="empty">DR history is empty.</p>`; return; }
    const first = pts[0], last = pts[pts.length - 1], peak = pts.reduce((a, b) => b[1] > a[1] ? b : a), ch = Math.round((last[1] - first[1]) * 10) / 10;
    const tiles = `<div class="tiles"><div class="tile"><p class="k">DR now</p><p class="v">${last[1]}</p></div>
      <div class="tile"><p class="k">${fmtD(first[0])}</p><p class="v">${first[1]}</p></div>
      <div class="tile"><p class="k">Change</p><p class="v ${ch > 0 ? "up" : ""}">${ch > 0 ? "+" : ""}${ch}</p></div>
      <div class="tile"><p class="k">Peak</p><p class="v">${peak[1]} <small>${fmtD(peak[0])}</small></p></div></div>`;
    const note = `<p class="note">${esc(v.domain || dom)} · weekly Ahrefs DR · ${fmtD(first[0])} to ${fmtD(last[0])}${v.pulled ? " · pulled " + esc(v.pulled) : ""}${v.source ? " · " + esc(v.source) : ""}</p>`;
    if (st.drTable) {
      $("dr").innerHTML = tiles + `<div class="tbl-wrap"><table class="t"><thead><tr><th>Week of</th><th>DR</th><th>Change</th></tr></thead><tbody>${pts.slice().reverse().map((p, i, a) => {
        const prev = a[i + 1], d = prev ? Math.round((p[1] - prev[1]) * 10) / 10 : 0; return `<tr><td>${fmtD(p[0])}</td><td>${p[1]}</td><td>${prev && d ? (d > 0 ? "+" : "") + d : `<span class="z">0</span>`}</td></tr>`; }).join("")}</tbody></table></div>` + note;
      return;
    }
    const W = 800, H = 300, L = 40, R = 16, T = 16, B = 30, max = Math.max(10, Math.ceil(peak[1] / 10) * 10);
    const t0 = new Date(first[0]).getTime(), t1 = new Date(last[0]).getTime() || t0 + 1;
    const x = d => L + (W - L - R) * ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)), y = val => T + (H - T - B) * (1 - val / max);
    const grid = [0, .25, .5, .75, 1].map(f => { const val = Math.round(max * f), yy = y(val).toFixed(1); return `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="tick" x="${L - 8}" y="${+yy + 4}" text-anchor="end">${val}</text>`; }).join("");
    const months = []; const s = new Date(first[0]); s.setDate(1); s.setMonth(s.getMonth() + 1);
    for (const m = new Date(s); m.getTime() <= t1; m.setMonth(m.getMonth() + 2)) months.push(new Date(m));
    const mt = months.map(m => `<text class="tick" x="${x(m.toISOString().slice(0, 10)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${m.toLocaleDateString("en-GB", {month: "short"})}${m.getMonth() === 0 ? " " + String(m.getFullYear()).slice(2) : ""}</text>`).join("");
    const line = pts.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
    $("dr").innerHTML = tiles + `<div class="chart" id="drc"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(dom)} Domain Rating weekly, ${first[1]} to ${last[1]}">
      ${grid}<line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>${mt}
      <path class="area" d="M${x(first[0]).toFixed(1)},${y(0)} L${line.replace(/ /g, " L")} L${x(last[0]).toFixed(1)},${y(0)} Z"/>
      <polyline class="line" points="${line}"/><circle class="pt" cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="5"/>
      <line class="cross" id="drx" y1="${T}" y2="${y(0)}" visibility="hidden"/><circle class="pt" id="drp" r="5" visibility="hidden"/>
      <rect id="drhit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="tip" id="drtip" hidden></div></div>` + note;
    const svg = $("drc").querySelector("svg"), tip = $("drtip"), cx = $("drx"), cp = $("drp");
    const move = e => { const b = svg.getBoundingClientRect(), px = (e.clientX - b.left) * W / b.width;
      let best = pts[0]; for (const p of pts) if (Math.abs(x(p[0]) - px) < Math.abs(x(best[0]) - px)) best = p;
      const bx = x(best[0]), by = y(best[1]);
      cx.setAttribute("x1", bx); cx.setAttribute("x2", bx); cx.setAttribute("visibility", "visible");
      cp.setAttribute("cx", bx); cp.setAttribute("cy", by); cp.setAttribute("visibility", "visible");
      tip.hidden = false; tip.innerHTML = `Week of ${fmtD(best[0])} · DR <b>${best[1]}</b>`;
      const left = Math.min(Math.max(bx * b.width / W, 80), b.width - 80); tip.style.left = left + "px"; tip.style.top = by * b.height / H + "px"; };
    const out = () => { tip.hidden = true; cx.setAttribute("visibility", "hidden"); cp.setAttribute("visibility", "hidden"); };
    $("drhit").addEventListener("pointermove", move); $("drhit").addEventListener("pointerdown", move); $("drhit").addEventListener("pointerleave", out);
  }

  // ---------- 4. sources ----------
  function drawSources() {
    const ts = trackerStats(), by = ts ? ts.by : {}, site = (st.sites[CLIENTS[key][1]] || {}).rows || {};
    const pick = re => Object.entries(by).filter(([s]) => re.test(s));
    const rows = list => list.length ? list.map(([s, v]) => `<span>${esc(s)}</span><b>${v.n}${v.last ? ` · last ${fmtD(v.last)}` : ""}</b>`).join("") : `<span>In tracker</span><b>0</b>`;
    const pill = (k, t) => `<span class="pill ${k}">${t}</span>`;
    const ai = pick(/peec|maxvisibility|visibility/i), ah = pick(/ahrefs|backlink/i);
    const recs = ts ? ts.recs : [], apo = recs.filter(r => r.apollo).length, seqs = new Set(recs.map(r => r.seq).filter(s => s && !/manual/i.test(s)));
    const known = /peec|maxvisibility|visibility|ahrefs|backlink/i, other = Object.entries(by).filter(([s]) => !known.test(s));
    const cards = [
      ["AI visibility", "Peec · MaxVisibility", ai.length ? pill("on", "In use") : pill("part", "Not used yet"),
        `<div class="kv">${rows(ai)}</div><p class="note">Companies whose articles AI answers cite. <a href="https://app.peec.ai" target="_blank" rel="noopener">Open Peec</a></p>`],
      ["Ahrefs competitive analysis", "Competitor backlinks", ah.length ? pill("part", "CSV / on request") : pill("off", "Not used yet"),
        `<div class="kv">${rows(ah)}</div><p class="note">Pulls cost Ahrefs units: asked for each time. DR for ${esc(CLIENTS[key][2])}: <b>${window.DR && window.DR[CLIENTS[key][2]] != null ? window.DR[CLIENTS[key][2]] : st.dr[key] ? (st.dr[key].rows.weeks || []).slice(-1)[0]?.[1] ?? "–" : "–"}</b></p>`],
      ["Directory & review sites", "G2, Capterra, niche directories", pill("off", "Not connected"), `<p class="note">No feed yet. List the ones that matter under "Authoritative non-PR sources" in the market map.</p>`],
      ["PR network", "Outlets and journalists", pill("off", "Not connected"), `<p class="note">No feed yet. Keep target outlets in the PR list in the market map.</p>`],
      ["Apollo", "Accounts, people, sequences", apo ? pill("on", "Connected") : pill("part", "No accounts yet"),
        `<div class="kv"><span>Companies with an Apollo account</span><b>${apo}</b><span>Emailed</span><b>${recs.filter(r => r.sent).length}</b><span>Replied</span><b>${recs.filter(r => r.rep).length}</b><span>Sequences</span><b>${seqs.size}</b>
         ${site.emails != null ? `<span>Emails sent (desk)</span><b>${site.emails}</b><span>Replies (desk)</span><b>${site.replies ?? "–"}</b>` : ""}</div>`],
    ];
    if (other.length) cards.push(["Other tracker sources", "Web search, retries, manual", pill("on", "In tracker"), `<div class="kv">${rows(other)}</div>`]);
    $("sources").innerHTML = (ts ? "" : `<p class="empty">No Outreach Tracker copied for ${esc(CLIENTS[key][0])}, so no counts.</p>`)
      + cards.map(([t, s, p, b]) => `<article class="src"><div class="src-h"><b>${t}</b>${p}</div><span class="muted small">${s}</span>${b}</article>`).join("");
  }

  // ---------- page ----------
  function banner() {
    const b = $("banner");
    if (st.store === "missing") { b.hidden = false; b.innerHTML = `Market map saving is off: the <code>planning</code> table isn't in Supabase yet. Run <code>supabase/planning.sql</code> once in the Supabase SQL editor. Until then you can draft here; the draft stays in this browser only.`; }
    else if (st.store === "error") { b.hidden = false; b.textContent = "Could not read the saved market map: " + st.storeErr; }
    else b.hidden = true;
  }
  async function show() {
    document.title = `${CLIENTS[key][0]} · Planning · Outreach Desk`; $("title").textContent = CLIENTS[key][0] + " planning";
    st.editing = false; await loadPlan(); banner(); drawMap(); drawRefill(); drawDR(); drawSources();
  }
  $("drTbl").onclick = () => { st.drTable = !st.drTable; $("drTbl").setAttribute("aria-pressed", st.drTable); $("drTbl").textContent = st.drTable ? "Chart" : "Table"; drawDR(); };
  bindMap();
  (async () => {
    await Shell.mount("planning", key, k => { if (!CLIENTS[k]) return; if (st.hasDraft && st.editing && !confirm("Leave without saving? Your draft stays in this browser.")) return; key = k; history.replaceState(null, "", "?c=" + k); show(); });
    const me = window.__me || {};
    if (me.role !== "admin") { if (me.role === "client") location.replace("client.html"); return; }  // internal page: admins only
    try { await loadShared(); } catch (e) { $("banner").hidden = false; $("banner").textContent = "Could not load data: " + (e.message || e); }
    show();
  })();
})();
