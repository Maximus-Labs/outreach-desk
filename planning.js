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
  const st = {sel: null, editing: false, plan: null, planAt: null, planBy: "", store: "unknown", status: null, trackers: {}, sites: {}, dr: {}, drTable: false};
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

  // ---------- 1. market map: widest market on top, narrower ones branch down ----------
  const PAL = [["green", "Direct competitor"], ["yellow", "Adjacent"], ["red", "Don't pitch"], ["", "Blank"]];
  const depth = id => { let d = 0, p = id; while (p) { d++; p = (st.plan.nodes.find(x => x.id === p) || {}).parent; } return d; };
  const colorName = c => (COLORS.find(x => x[0] === (c || "")) || [])[1];
  function drawMap() {
    const p = st.plan, ed = st.editing;
    $("mmEdit").textContent = ed ? "Done" : "Edit"; $("mmEdit").setAttribute("aria-pressed", ed);
    $("mmSave").hidden = !ed; $("mmSave").disabled = st.store !== "ok";
    $("mmSave").title = st.store === "ok" ? "Save for the whole team" : "Saving is off until planning.sql has run in Supabase";
    $("mmMeta").textContent = (st.planAt ? `Saved ${fmtT(st.planAt)}${st.planBy ? " by " + st.planBy.split("@")[0] : ""}` : "Not saved yet")
      + (st.hasDraft ? " · unsaved draft on this browser" : "") + " · Level 1 = widest market at the top, each level down = narrower. Number = pitch order."
      + (ed ? " Click a box to edit it. Drag a box and a dashed line shows where it will land." : "");
    const kids = id => p.nodes.filter(n => (n.parent || null) === id);
    const box = (n, d) => `<div class="nd ${esc(n.color)}${n.here ? " here" : ""}${ed && st.sel === n.id ? " sel" : ""}" data-id="${n.id}" ${ed ? 'role="button" tabindex="0"' : ""}
        title="${esc(ed ? "Drag to move it under another box · click to edit" : [n.name, n.kw, colorName(n.color)].filter(Boolean).join(" · "))}">${n.num ? `<span class="no">${esc(n.num)}</span>` : ""}<span class="lv">Level ${d}</span>
        <span class="nm">${esc(n.name || "Untitled")}</span>${n.kw ? `<span class="kw">${esc(n.kw)}</span>` : ""}${n.here ? '<i class="pin" aria-label="We are here"></i>' : ""}
        ${ed ? `<span class="nd-x" data-x="${n.id}" role="button" tabindex="0" title="Remove this box" aria-label="Remove ${esc(n.name || "box")}">×</span>` : ""}</div>`;
    const li = (n, d = 1) => { const ch = kids(n.id); return `<li>${box(n, d)}${ch.length ? `<ul>${ch.map(c => li(c, d + 1)).join("")}</ul>` : ""}</li>`; };
    const roots = kids(null);
    $("tree").className = ed ? "ed" : "";
    $("palette").hidden = !ed;
    if (ed) $("palette").innerHTML = `<span class="pal-l">Add a box</span>` + PAL.map(([c, l]) => `<button type="button" class="pal" data-new="${c}"><i class="dot ${c}"></i>${l}</button>`).join("")
      + `<button type="button" class="pal" data-here="1"><i class="ring"></i>We are here</button>`
      + `<span class="pal-hint">Drag a chip onto a box, or click it to add under the selected box.</span>`;
    const tray = p.nodes.filter(n => n.parent === "tray");
    $("tray").hidden = !ed || !tray.length;
    $("tray").innerHTML = tray.length ? `<span class="tray-l">New boxes · type a name, then drag into the map</span>` + tray.map(n => `<div class="nd tnd ${esc(n.color)}" data-id="${n.id}">
        <span class="grip" aria-hidden="true">⋮⋮</span><input class="tin" data-tin="${n.id}" value="${esc(n.name)}" placeholder="Type a name" aria-label="Box name">
        <span class="nd-x" data-x="${n.id}" role="button" tabindex="0" title="Remove" aria-label="Remove box">×</span></div>`).join("") : "";
    $("tree").innerHTML = roots.length ? `<ul class="org">${roots.map(n => li(n)).join("")}</ul>`
      : `<div class="tree-empty"><b style="color:var(--t2)">No market map yet</b><span>${ed ? "Add the widest market first, then branch narrower markets under it." : "Press Edit and start with the widest market at the top."}</span></div>`;
    fitTree(); drawNodeEd();
    drawList("nonpr", "Add source"); drawList("pr", "Add PR outlet");
  }
  function fitTree() {  // shrink a wide tree to fit its box (down to 60%), scroll only beyond that
    const t = $("tree"), org = t.querySelector(".org"); if (!org) return; org.style.zoom = 1;
    const need = org.scrollWidth, have = t.clientWidth - 4; org.style.zoom = need > have ? Math.max(.6, have / need).toFixed(3) : 1;
  }
  window.addEventListener("resize", () => fitTree());
  function drawNodeEd() {
    const ed = st.editing, n = ed && st.plan.nodes.find(x => x.id === st.sel);
    if (!ed) { $("nodeEd").innerHTML = ""; return; }
    $("nodeEd").innerHTML = (n ? `<div class="edp" data-id="${n.id}">
        <div class="row"><label>Market / segment<input data-f="name" value="${esc(n.name)}" placeholder="e.g. Ecommerce analytics"></label>
          <label>Keyword<input data-f="kw" value="${esc(n.kw)}" placeholder="e.g. best ecommerce analytics tools"></label>
          <label class="sm">No.<input data-f="num" value="${esc(n.num)}" inputmode="numeric" placeholder="1"></label></div>
        <div class="row" role="group" aria-label="Colour">${COLORS.map(([v, l]) => `<button type="button" class="sw" data-color="${v}" aria-pressed="${(n.color || "") === v}"><i class="dot ${v}"></i>${l}</button>`).join("")}
          <button type="button" class="sw" data-act="here" aria-pressed="${!!n.here}"><i class="ring"></i>We are here</button></div>
        <div class="row"><button type="button" class="btn sm" data-act="child">+ Narrower market under this</button><button type="button" class="btn sm ghost" data-act="sib">+ Same level</button>
          <button type="button" class="btn sm danger" data-act="del" style="margin-left:auto">Remove</button></div></div>` : "")
      + `<div class="tree-acts"><button type="button" class="btn sm ghost" data-act="root">+ Add top (widest) market</button>
          <div class="rootdrop" id="rootDrop">Drop here to make it a Level 1 (top) market</div></div>
        <p class="muted small" style="margin:0">Drag a box onto another box to move it under that box (it takes everything under it along). × removes a box; boxes under it move up one level.</p>`;
  }
  function drawList(f, ph) {
    const list = st.plan[f] || [], ed = st.editing;
    $(f).innerHTML = `<div class="items">${ed
      ? list.map((x, i) => `<div class="row-e" data-i="${i}"><input data-f="name" value="${esc(x.name)}" placeholder="Name or URL" aria-label="Name"><input data-f="note" value="${esc(x.note)}" placeholder="Note (optional)" aria-label="Note"><button class="ibtn" data-act="del" aria-label="Remove">×</button></div>`).join("")
        + `<button class="add" data-act="add">+ ${esc(ph)}</button>`
      : list.length ? list.map(x => { const n = String(x.name || ""), u = /^https?:\/\//.test(n) ? n : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(n) ? "https://" + n : "";
          return `<div class="item"><span class="t">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>` : esc(n)}</span>${x.note ? `<span class="n">${esc(x.note)}</span>` : ""}</div>`; }).join("")
        : `<p class="empty">None yet.</p>`}</div>`;
  }
  function touched() { st.hasDraft = true; lsSet(draftKey(), {at: new Date().toISOString(), plan: st.plan}); }
  function liveBox(n) {  // update one box while typing, so the cursor stays in the field
    const el = document.querySelector(`#tree .nd[data-id="${n.id}"]`); if (!el) return;
    el.querySelector(".nm").textContent = n.name || "Untitled";
    let kw = el.querySelector(".kw"); if (n.kw) { if (!kw) { kw = document.createElement("span"); kw.className = "kw"; el.querySelector(".nm").after(kw); } kw.textContent = n.kw; } else if (kw) kw.remove();
    let no = el.querySelector(".no"); if (n.num) { if (!no) { no = document.createElement("span"); no.className = "no"; el.prepend(no); } no.textContent = n.num; } else if (no) no.remove();
  }
  const under = (id, anc) => { let p = (st.plan.nodes.find(x => x.id === id) || {}).parent; while (p) { if (p === anc) return true; p = (st.plan.nodes.find(x => x.id === p) || {}).parent; } return false; };
  function removeNode(id) {  // remove one box; the boxes under it move up to its parent, so no branch is lost
    const nodes = st.plan.nodes, n = nodes.find(x => x.id === id); if (!n) return;
    const ch = nodes.filter(x => x.parent === id);
    if ((n.name || ch.length) && !confirm(`Remove "${n.name || "this box"}"?${ch.length ? ` The ${ch.length} box${ch.length > 1 ? "es" : ""} under it move up one level.` : ""}`)) return;
    ch.forEach(x => x.parent = n.parent || null); st.plan.nodes = nodes.filter(x => x.id !== id);
    if (st.sel === id) st.sel = null; touched(); drawMap();
  }
  function moveNode(id, parent) {  // connect box `id` under `parent` (null = top market)
    const n = st.plan.nodes.find(x => x.id === id); if (!n || id === parent || (parent && under(parent, id)) || (n.parent || null) === parent) return;
    n.parent = parent; st.sel = id; touched(); drawMap();
  }
  function bindMap() {
    const t = $("tree"), nb = $("nodeEd");
    t.addEventListener("click", e => { if (!st.editing || st.justDragged) return; const x = e.target.closest(".nd-x"); if (x) { e.stopPropagation(); removeNode(x.dataset.x); return; }
      const b = e.target.closest(".nd"); if (!b) return; st.sel = b.dataset.id; drawMap(); nb.querySelector("input")?.focus(); });
    t.addEventListener("keydown", e => { if (!st.editing || (e.key !== "Enter" && e.key !== " " && e.key !== "Delete")) return;
      const x = e.target.closest(".nd-x"), b = e.target.closest(".nd"); if (!b) return; e.preventDefault();
      if (x || e.key === "Delete") removeNode(b.dataset.id); else { st.sel = b.dataset.id; drawMap(); nb.querySelector("input")?.focus(); } });
    // ---- drag and drop (pointer based, like Trello / Miro): press, move 5px, a card follows the cursor,
    // the box it will go under lights up and an animated dashed line + "goes here" slot shows the level. Esc cancels.
    const pal = $("palette"), tray = $("tray");
    const addNode = (parent, color, focusTray) => { const m = {id: uid(), parent, name: "", kw: "", color: color || "", num: ""}; st.plan.nodes.push(m); st.sel = m.id; touched(); drawMap();
      (focusTray ? tray.querySelector(`[data-tin="${m.id}"]`) : nb.querySelector("input"))?.focus(); return m; };
    $("addBox").onclick = () => { if (!st.editing) st.editing = true; addNode("tray", "", true); };
    pal.addEventListener("click", e => { if (st.justDragged) return; const c = e.target.closest(".pal"); if (!c) return;
      if (c.dataset.here) { const n = st.plan.nodes.find(x => x.id === st.sel); if (!n) { alert("Select a box first, or drag 'We are here' onto a box."); return; }
        const on = !n.here; st.plan.nodes.forEach(x => x.here = false); n.here = on; touched(); drawMap(); return; }
      const sel = st.plan.nodes.find(x => x.id === st.sel);
      addNode(sel && sel.parent !== "tray" ? sel.id : "tray", c.dataset.new, !sel || sel.parent === "tray"); });
    tray.addEventListener("input", e => { const id = e.target.dataset.tin; if (!id) return; const n = st.plan.nodes.find(x => x.id === id); n.name = e.target.value; touched(); });
    tray.addEventListener("click", e => { const x = e.target.closest(".nd-x"); if (x) removeNode(x.dataset.x); });

    let D = null;  // the drag in progress
    const overlay = () => { let o = $("dropFx"); if (!o) { o = document.createElement("div"); o.id = "dropFx"; o.innerHTML = '<svg><path/></svg><div class="nd-ghost"></div>'; t.parentElement.append(o); } return o; };
    const nameOf = id => (st.plan.nodes.find(x => x.id === id) || {}).name || "Untitled";
    const legal = target => { if (!D) return false; if (D.kind !== "move") return true; return target !== D.id && !under(target, D.id); };
    function findTarget(x, y) {
      const rz = $("rootDrop"); if (rz && D.kind !== "here") { const r = rz.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top - 6 && y <= r.bottom + 6) return {root: true, el: rz}; }
      let best = null, bd = 1e9;
      t.querySelectorAll(".org .nd[data-id]").forEach(el => { const id = el.dataset.id; if (!legal(id)) return;
        const r = el.getBoundingClientRect(), pad = 18;  // generous zone: around the box and the gap under it
        if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + 26) return;
        const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom, dd = inside ? -1 : Math.hypot(x - cx, (y - cy) * 1.4);
        if (dd < bd) { bd = dd; best = {id, el}; } });
      return best;
    }
    function showFx(tg) {
      document.querySelectorAll(".drop-ok").forEach(el => el !== (tg && tg.el) && el.classList.remove("drop-ok"));
      const o = overlay();
      if (!tg) { o.hidden = true; return; }
      tg.el.classList.add("drop-ok");
      if (tg.root || D.kind === "here") { o.hidden = true; return; }
      const host = t.parentElement, tr = host.getBoundingClientRect(), r = tg.el.getBoundingClientRect();
      const x0 = r.left + r.width / 2 - tr.left, y0 = r.bottom - tr.top;
      // the target already has boxes under it: the slot opens at the end of that row (same level, same cluster)
      const last = tg.el.parentElement.querySelector(":scope>ul>li:last-child>.nd"), lr = last && last.getBoundingClientRect();
      const gx = lr ? lr.right - tr.left + 18 : x0, gy = lr ? lr.top - tr.top : y0 + 30, mid = lr ? y0 + (lr.top - r.bottom) / 2 : 0;
      const what = D.kind === "move" ? nameOf(D.id) : "New box";
      o.hidden = false; o.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:5";
      const svg = o.querySelector("svg"); svg.setAttribute("width", 1); svg.setAttribute("height", 1);
      const g = o.querySelector(".nd-ghost"); g.style.top = gy + "px"; g.classList.toggle("side", !!lr);
      g.innerHTML = `<b>${esc(what)}</b><small>goes here · Level ${depth(tg.id) + 1} · under ${esc(nameOf(tg.id))}</small>`;
      g.style.left = gx + "px";
      const gw = g.offsetWidth || 160, gc = lr ? gx + gw / 2 : x0;
      svg.querySelector("path").setAttribute("d", lr ? `M${x0},${y0} V${mid} H${gc} V${gy}` : `M${x0},${y0} V${gy}`);

    }
    function endDrag(drop) {
      if (!D) return; const d = D, tg = D.tg; D = null;
      document.body.classList.remove("is-dragging"); d.float && d.float.remove(); d.srcEl && d.srcEl.classList.remove("lifted");
      document.querySelectorAll(".drop-ok").forEach(el => el.classList.remove("drop-ok")); const o = $("dropFx"); if (o) o.hidden = true;
      if (d.started) { st.justDragged = true; setTimeout(() => st.justDragged = false, 50); }
      if (!drop || !d.started || !tg) return;
      const target = tg.root ? null : tg.id;
      if (d.kind === "move") moveNode(d.id, target);
      else if (d.kind === "new") addNode(target, d.color);
      else if (d.kind === "here" && target) { st.plan.nodes.forEach(x => x.here = x.id === target); st.sel = target; touched(); drawMap(); }
    }
    function startPress(e, info, srcEl) {
      if (e.button !== 0 || !st.editing) return;
      D = {...info, x0: e.clientX, y0: e.clientY, started: false, srcEl, tg: null};
    }
    document.addEventListener("pointerdown", e => {
      if (!st.editing || e.target.closest("input,textarea,select,.nd-x")) return;
      const b = e.target.closest("#tree .org .nd[data-id], #tray .tnd"); if (b) { startPress(e, {kind: "move", id: b.dataset.id}, b); return; }
      const c = e.target.closest("#palette .pal"); if (c) startPress(e, c.dataset.here ? {kind: "here"} : {kind: "new", color: c.dataset.new}, c);
    });
    document.addEventListener("pointermove", e => {
      if (!D) return;
      if (!D.started) { if (Math.hypot(e.clientX - D.x0, e.clientY - D.y0) < 5) return;
        D.started = true; document.body.classList.add("is-dragging"); if (D.srcEl) D.srcEl.classList.add("lifted");
        const f = document.createElement("div"); f.className = "drag-float " + (D.kind === "new" ? D.color : D.kind === "move" ? (st.plan.nodes.find(x => x.id === D.id) || {}).color || "" : "");
        f.innerHTML = D.kind === "here" ? '<i class="ring"></i> We are here' : `<b>${esc(D.kind === "move" ? nameOf(D.id) : "New box")}</b>`;
        document.body.append(f); D.float = f; }
      e.preventDefault();
      D.float.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px) rotate(-2deg)`;
      const tg = findTarget(e.clientX, e.clientY);
      if ((tg && tg.id) !== (D.tg && D.tg.id) || !!(tg && tg.root) !== !!(D.tg && D.tg.root)) { D.tg = tg; showFx(tg); }
      D.float.classList.toggle("ok", !!tg);
      if (e.clientY < 60) window.scrollBy(0, -14); else if (e.clientY > innerHeight - 60) window.scrollBy(0, 14);  // auto-scroll near the edges
    }, {passive: false});
    document.addEventListener("pointerup", () => endDrag(true));
    document.addEventListener("pointercancel", () => endDrag(false));
    document.addEventListener("keydown", e => { if (e.key === "Escape" && D) endDrag(false); });
    nb.addEventListener("input", e => { const id = e.target.closest("[data-id]")?.dataset.id, f = e.target.dataset.f; if (!id || !f) return;
      const n = st.plan.nodes.find(x => x.id === id); n[f] = e.target.value; touched(); liveBox(n); });
    nb.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
      const nodes = st.plan.nodes, n = nodes.find(x => x.id === st.sel), act = b.dataset.act;
      if (b.dataset.color !== undefined && n) { n.color = b.dataset.color; touched(); drawMap(); return; }
      if (act === "here" && n) { const on = !n.here; nodes.forEach(x => x.here = false); n.here = on; touched(); drawMap(); return; }
      if (act === "root" || (n && (act === "child" || act === "sib"))) {
        const m = {id: uid(), parent: act === "child" ? n.id : act === "sib" ? (n.parent || null) : null, name: "", kw: "", color: "", num: ""};
        nodes.push(m); st.sel = m.id; touched(); drawMap(); $("nodeEd").querySelector("input")?.focus(); return; }
      if (act === "del" && n) removeNode(n.id); });
    for (const f of ["nonpr", "pr"]) {
      $(f).addEventListener("input", e => { const i = e.target.closest("[data-i]")?.dataset.i; if (i == null) return; st.plan[f][i][e.target.dataset.f] = e.target.value; touched(); });
      $(f).addEventListener("click", e => { const b = e.target.closest("[data-act]"); if (!b) return;
        if (b.dataset.act === "add") { (st.plan[f] = st.plan[f] || []).push({name: "", note: ""}); touched(); drawList(f, f === "pr" ? "Add PR outlet" : "Add source");
          $(f).querySelector(".row-e:last-of-type input")?.focus(); }
        if (b.dataset.act === "del") { st.plan[f].splice(+b.closest("[data-i]").dataset.i, 1); touched(); drawMap(); } });
    }
    $("mmEdit").onclick = () => { st.editing = !st.editing; if (!st.editing) st.plan.nodes = st.plan.nodes.filter(n => n.parent !== "tray" || n.name); if (st.editing && !st.sel) st.sel = (st.plan.nodes[0] || {}).id || null; drawMap(); };
    $("mmSave").onclick = save;
  }
  async function save() {
    const b = $("mmSave"); b.disabled = true; b.textContent = "Saving…";
    try {
      const {data: cur} = await SB.from("planning").select("updated_at,updated_by").eq("client", key).maybeSingle();
      if (cur && st.planAt && cur.updated_at > st.planAt && !confirm(`${(cur.updated_by || "Someone").split("@")[0]} saved this map at ${fmtT(cur.updated_at)}, after you opened it. Overwrite with your version?`)) throw new Error("cancelled");
      const clean = {nodes: st.plan.nodes.filter(n => n.name || n.kw || st.plan.nodes.some(c => c.parent === n.id)), nonpr: (st.plan.nonpr || []).filter(x => x.name), pr: (st.plan.pr || []).filter(x => x.name)};
      const now = new Date().toISOString(), email = (window.__me || {}).email || "";
      const {error} = await SB.from("planning").upsert({client: key, data: clean, updated_at: now, updated_by: email}, {onConflict: "client"});
      if (error) throw error;
      st.plan = clean; st.planAt = now; st.planBy = email; st.hasDraft = false; lsSet(draftKey(), null); st.editing = false; st.sel = null; drawMap();
    } catch (e) { if (e.message !== "cancelled") alert("Not saved: " + (e.message || e)); }
    b.textContent = "Save"; b.disabled = st.store !== "ok";
  }

  // ---------- 2. refill by day: Dates | Stock | one column per source | Total ----------
  const MON = {jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12};
  const isoDay = s => { s = String(s || "").trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]*(\d{4})/); if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; return ""; };
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
    if (!ts && !Object.keys(stat).length) { $("refill").innerHTML = `<p class="empty" style="padding:14px">No Outreach Tracker copied for ${esc(CLIENTS[key][0])} yet.</p>`; $("rfMeta").textContent = ""; return; }
    const srcs = ts ? Object.keys(ts.by).sort((a, b) => ts.by[b].n - ts.by[a].n) : [];
    const days = new Set(Object.keys(stat)); (ts ? ts.recs : []).forEach(r => days.add(r.day));
    const list = [...days].sort((a, b) => (b || "0").localeCompare(a || "0"));  // newest first, "before dates" last
    const cnt = {}; (ts ? ts.recs : []).forEach(r => { const k = r.day + "|" + r.src; cnt[k] = (cnt[k] || 0) + 1; });
    const num = v => v ? String(v) : `<span class="z">–</span>`, tot = {};
    const body = list.map(d => { let sum = 0; const cells = srcs.map(s => { const v = cnt[d + "|" + s] || 0; sum += v; tot[s] = (tot[s] || 0) + v; return `<td>${num(v)}</td>`; }).join("");
      const b = stat[d]; return `<tr${d ? "" : ' class="undated"'}><td>${d ? fmtD(d) : "Before dates were kept"}</td><td title="${b ? `Status tab: waiting at start ${esc(b.bank)}, added ${esc(b.added)}, left in pool ${esc(b.left)}` : "No Status row this day"}">${b ? esc(b.bank) : `<span class="z">–</span>`}</td>${cells}<td><b>${num(sum)}</b></td></tr>`; }).join("");
    const all = srcs.reduce((a, s) => a + tot[s], 0);
    const inBank = ts ? ts.recs.filter(r => !r.sent).length : null;
    $("refill").innerHTML = `<table class="t"><thead><tr><th>Date</th><th title="Companies waiting at the start of the day (Status tab)">Stock</th>${srcs.map(s => `<th>${esc(s)}</th>`).join("")}<th>Total added</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td>Total</td><td title="Tracker rows not emailed yet">${inBank == null ? "–" : inBank + " now"}</td>${srcs.map(s => `<td>${tot[s]}</td>`).join("")}<td>${all}</td></tr></tfoot></table>`;
    $("rfMeta").textContent = "Companies added per source, by 'Date added' in the Outreach Tracker";
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

  // ---------- 4. sources: one simple table, rows in the sketch's order ----------
  function drawSources() {
    const ts = trackerStats(), by = ts ? ts.by : {}, recs = ts ? ts.recs : [];
    const sum = re => { const l = Object.entries(by).filter(([s]) => re.test(s)); return {n: l.reduce((a, [, v]) => a + v.n, 0), last: l.map(([, v]) => v.last).sort().pop() || "", names: l.map(([s]) => s)}; };
    const pill = (k, t) => `<span class="pill ${k}">${t}</span>`;
    const ai = sum(/peec|maxvisibility|visibility/i), ah = sum(/ahrefs|backlink/i), dir = sum(/directory|review|g2|capterra/i), prn = sum(/\bpr\b|press|journalist/i);
    const known = /peec|maxvisibility|visibility|ahrefs|backlink|directory|review|g2|capterra|\bpr\b|press|journalist/i;
    const other = Object.entries(by).filter(([s]) => !known.test(s)).sort((a, b) => b[1].n - a[1].n);
    const apo = recs.filter(r => r.apollo).length, sent = recs.filter(r => r.sent).length, rep = recs.filter(r => r.rep).length;
    const row = (name, sub, s, status) => `<tr><td><b>${name} ${status}</b><small>${sub}</small></td><td class="r">${s.n || `<span class="muted">0</span>`}</td><td class="r">${s.last ? new Date(s.last + "T00:00:00").toLocaleDateString("en-GB", {day: "numeric", month: "short"}) : `<span class="muted">–</span>`}</td></tr>`;
    const rows = [
      row("AI Visibility", ai.names.join(" · ") || "Peec · MaxVisibility", ai, ai.n ? pill("on", "In use") : pill("part", "Not used")),
      row("Ahrefs Competitive Analysis", ah.names.join(" · ") || "Competitor backlinks", ah, ah.n ? pill("part", "On request") : pill("off", "Not used")),
      row("Directory Submission and Review Sites", "G2, Capterra, niche directories", dir, dir.n ? pill("on", "In use") : pill("off", "No feed")),
      ...other.map(([s, v]) => row(esc(s), "Other tracker source", v, pill("on", "In use"))),
      ...(other.length ? [] : [`<tr class="blank"><td colspan="3"></td></tr>`]),
      row("PR Network", "Outlets and journalists", prn, prn.n ? pill("on", "In use") : pill("off", "No feed")),
      `<tr><td><b>Apollo ${apo ? pill("on", "Connected") : pill("part", "No accounts")}</b><small>${sent} emailed · ${rep} replied</small></td><td class="r">${apo || `<span class="muted">0</span>`}</td><td class="r"><span class="muted">–</span></td></tr>`,
    ];
    $("sources").innerHTML = `<table class="st"><thead><tr><th>Source</th><th class="r">Companies</th><th class="r">Last added</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
      + (ts ? "" : `<p class="empty">No Outreach Tracker copied for ${esc(CLIENTS[key][0])}, so counts are 0.</p>`);
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
