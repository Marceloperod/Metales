(() => {
  "use strict";

  const ORDER = ["tin", "lead", "silver"];
  const COLORS = { tin: "--tin", lead: "--lead", silver: "--silver" };
  const DEMO = new URLSearchParams(location.search).has("demo");
  const $ = (id) => document.getElementById(id);

  let DATA = null;
  let current = localGet("metal") || "tin";
  let days = Number(localGet("days")) || 66;

  // ---------- utilidades ----------
  function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }

  const fmt = (v, unit) => v == null || isNaN(v) ? "—" :
    v.toLocaleString("es-MX", { minimumFractionDigits: unit === "USD/oz" ? 2 : 0, maximumFractionDigits: unit === "USD/oz" ? 2 : 0 });
  const fmtPct = (v) => (v > 0 ? "+" : "") + v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  const fmtDate = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) =>
    new Date(iso + "T12:00:00").toLocaleDateString("es-MX", opts);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const svgEl = (tag, attrs = {}) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  // Serie uniforme: {date, v, m3?, stock?}
  function series(key) {
    const m = DATA?.metals?.[key];
    if (!m) return [];
    return m.history
      .map((r) => ({ date: r.date, v: r.cash ?? r.close, m3: r.m3 ?? null, stock: r.stock ?? null }))
      .filter((r) => r.v != null);
  }

  function lastChange(s) {
    if (s.length < 2) return null;
    const a = s[s.length - 2].v, b = s[s.length - 1].v;
    return { abs: b - a, pct: ((b - a) / a) * 100 };
  }

  // ---------- carga ----------
  async function load(force = false) {
    $("refresh").classList.add("spin");
    try {
      if (DEMO) {
        DATA = demoData();
      } else {
        const r = await fetch("data/prices.json" + (force ? "?t=" + Date.now() : ""), { cache: force ? "no-store" : "default" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        DATA = await r.json();
      }
      render();
    } catch (e) {
      $("updated").textContent = "No se pudieron cargar los precios";
      showBanner("Sin conexión o sin datos todavía. Si acabas de publicar la app, corre la acción “Actualizar precios” en GitHub.");
      if (!DATA) renderEmpty();
    } finally {
      $("refresh").classList.remove("spin");
    }
  }

  function showBanner(text) { const b = $("banner"); b.textContent = text; b.hidden = !text; }

  // ---------- render ----------
  function render() {
    const upd = DATA.updated ? new Date(DATA.updated) : null;
    $("updated").textContent = upd
      ? "Actualizado " + upd.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "—";
    const notes = [];
    if (DEMO) notes.push("MODO DEMO: datos simulados, no son precios reales.");
    if (!Object.keys(DATA.metals || {}).length) notes.push("Todavía no hay precios. En GitHub, abre Actions → “Actualizar precios” → Run workflow.");
    if (DATA.errors?.length) notes.push("Algunas fuentes no respondieron en la última actualización; se muestran los últimos datos guardados.");
    showBanner(notes.join(" "));
    renderCards();
    renderDetail();
    $("foot").textContent = "Precios de cierre diarios. Estaño y plomo: LME Cash-Settlement (USD/t). Plata: XAG/USD (USD/oz troy). " +
      "Fuentes: " + ORDER.map((k) => DATA.metals?.[k] ? `${DATA.metals[k].name} — ${DATA.metals[k].source}` : "").filter(Boolean).join(" · ") +
      ". Uso informativo; no sustituye la cotización oficial de LME.";
  }

  function renderCards() {
    const box = $("cards");
    box.replaceChildren();
    for (const key of ORDER) {
      const m = DATA.metals?.[key];
      if (!m) continue;
      const s = series(key);
      const last = s[s.length - 1];
      const ch = lastChange(s);
      const cls = !ch ? "flat" : ch.abs > 0 ? "up" : ch.abs < 0 ? "down" : "flat";
      const btn = document.createElement("button");
      btn.className = "card" + (key === current ? " on" : "");
      btn.setAttribute("aria-pressed", key === current);
      const add = (c, t) => { const e = document.createElement("span"); e.className = c; e.textContent = t; btn.append(e); };
      add("name", m.name);
      add("unit", m.unit);
      add("price", last ? fmt(last.v, m.unit) : "—");
      add("chg " + cls, ch ? `${ch.abs > 0 ? "▲" : ch.abs < 0 ? "▼" : "■"} ${fmtPct(ch.pct)}` : "");
      add("date", last ? "Cierre " + fmtDate(last.date) : "Sin datos aún");
      btn.addEventListener("click", () => { current = key; localSet("metal", key); renderCards(); renderDetail(); });
      box.append(btn);
    }
  }

  function renderDetail() {
    const m = DATA?.metals?.[current];
    if (!m) return;
    const all = series(current);
    const s = all.slice(-days);
    $("d-name").textContent = m.name;
    $("d-meta").textContent = `${m.unit} · ${m.source}`;
    document.querySelectorAll("#range button").forEach((b) => b.classList.toggle("on", Number(b.dataset.days) === days));
    drawChart(s, m.unit, css(COLORS[current]));

    // Estadísticas
    const st = $("stats");
    st.replaceChildren();
    const item = (label, value, small) => {
      const d = document.createElement("div");
      const dt = document.createElement("dt"); dt.textContent = label;
      const dd = document.createElement("dd"); dd.textContent = value;
      if (small) { const sm = document.createElement("small"); sm.textContent = " " + small; dd.append(sm); }
      d.append(dt, dd); st.append(d);
    };
    if (!s.length) return;
    const last = s[s.length - 1];
    const ch = lastChange(all);
    const vals = s.map((r) => r.v);
    const hi = Math.max(...vals), lo = Math.min(...vals);
    const first = s[0].v;
    const isLME = m.unit === "USD/t";

    item(isLME ? "Cash" : "Cierre", fmt(last.v, m.unit));
    if (ch) item("Cambio diario", (ch.abs > 0 ? "+" : "") + fmt(ch.abs, m.unit), fmtPct(ch.pct));
    if (isLME && last.m3 != null) {
      item("3 meses", fmt(last.m3, m.unit));
      const spread = last.v - last.m3;
      item("Spread cash–3M", (spread > 0 ? "+" : "") + fmt(spread, m.unit), spread > 0 ? "backwardation" : spread < 0 ? "contango" : "");
    }
    if (isLME && last.stock != null) item("Inventario LME", fmt(last.stock, "USD/t"), "t");
    item("Máx. del periodo", fmt(hi, m.unit));
    item("Mín. del periodo", fmt(lo, m.unit));
    item("Var. del periodo", fmtPct(((last.v - first) / first) * 100), "desde " + fmtDate(s[0].date, { day: "numeric", month: "short" }));
    if (!isLME) item("Por kg", fmt(last.v * 32.1507466, "USD/oz"), "USD/kg");
  }

  // ---------- gráfica (SVG propia, sin librerías) ----------
  function drawChart(s, unit, color) {
    const svg = $("chart");
    const wrap = $("chart-wrap");
    svg.replaceChildren();
    wrap.querySelector(".empty")?.remove();
    svg.style.display = "";
    if (s.length < 2) {
      svg.style.display = "none";
      const e = document.createElement("div"); e.className = "empty";
      e.textContent = "Aún no hay suficiente historial para graficar.";
      wrap.append(e);
      return;
    }
    const W = Math.max(280, wrap.clientWidth), H = 230;
    const pad = { l: 8, r: 58, t: 10, b: 24 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("height", H);

    const vals = s.map((r) => r.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const padY = (hi - lo) * 0.08 || hi * 0.01;
    lo -= padY; hi += padY;
    const x = (i) => pad.l + (i / (s.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

    // Rejilla y eje Y
    const g = svgEl("g", { class: "grid" }), ax = svgEl("g", { class: "axis" });
    const ticks = niceTicks(lo, hi, 4);
    for (const t of ticks) {
      g.append(svgEl("line", { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }));
      const tx = svgEl("text", { x: W - pad.r + 6, y: y(t) + 4 });
      tx.textContent = fmt(t, unit);
      ax.append(tx);
    }
    // Eje X: 4 fechas
    const n = Math.min(4, s.length);
    for (let k = 0; k < n; k++) {
      const i = Math.round((k / (n - 1)) * (s.length - 1));
      const tx = svgEl("text", { x: x(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === n - 1 ? "end" : "middle" });
      tx.textContent = fmtDate(s[i].date, days > 300 ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
      ax.append(tx);
    }
    svg.append(g, ax);

    const d = s.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.v).toFixed(1)}`).join("");
    svg.append(svgEl("path", { d: `${d}L${x(s.length - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z`, class: "area", fill: color }));
    svg.append(svgEl("path", { d, class: "line", stroke: color }));

    // Interacción táctil / ratón
    const cross = svgEl("line", { class: "cross", y1: pad.t, y2: H - pad.b, visibility: "hidden" });
    const dot = svgEl("circle", { r: 4, fill: color, visibility: "hidden" });
    svg.append(cross, dot);
    const tip = $("tip");
    const move = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(s.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (s.length - 1))));
      const cx = x(i), cy = y(s[i].v);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("visibility", "visible");
      tip.textContent = `${fmtDate(s[i].date)} · ${fmt(s[i].v, unit)} ${unit}`;
      tip.hidden = false;
      const left = (cx / W) * rect.width;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(rect.width - tw, left - tw / 2)) + "px";
    };
    const hide = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); };
    svg.onpointermove = (e) => move(e.clientX);
    svg.onpointerdown = (e) => move(e.clientX);
    svg.onpointerleave = hide;
    svg.onpointerup = (e) => { if (e.pointerType !== "mouse") setTimeout(hide, 1500); };
  }

  function niceTicks(lo, hi, count) {
    const span = hi - lo;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(+t.toFixed(6));
    return out;
  }

  function renderEmpty() {
    $("cards").replaceChildren();
    $("d-name").textContent = "Sin datos";
    $("d-meta").textContent = "";
  }

  // ---------- modo demo (datos simulados, solo para ver el diseño) ----------
  function demoData() {
    const mk = (start, vol, n, withLME) => {
      const out = []; let v = start; let st = 4000;
      const d = new Date(); d.setDate(d.getDate() - Math.round(n * 1.4));
      while (out.length < n) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        v *= 1 + (Math.random() - 0.49) * vol; st = Math.max(500, st + (Math.random() - 0.5) * 120);
        const date = d.toISOString().slice(0, 10);
        out.push(withLME ? { date, cash: Math.round(v), m3: Math.round(v * (1 + (Math.random() - 0.6) * 0.01)), stock: Math.round(st) } : { date, close: +v.toFixed(2) });
      }
      return out;
    };
    return {
      updated: new Date().toISOString(), errors: [],
      metals: {
        tin: { name: "Estaño", unit: "USD/t", source: "DEMO", history: mk(30000, 0.02, 400, true) },
        lead: { name: "Plomo", unit: "USD/t", source: "DEMO", history: mk(2000, 0.015, 400, true) },
        silver: { name: "Plata", unit: "USD/oz", source: "DEMO", history: mk(30, 0.02, 400, false) },
      },
    };
  }

  // ---------- eventos ----------
  $("range").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    days = Number(b.dataset.days); localSet("days", days); renderDetail();
  });
  $("refresh").addEventListener("click", () => load(true));
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => DATA && renderDetail(), 150); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(true); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => DATA && renderDetail());

  if ("serviceWorker" in navigator && !DEMO) navigator.serviceWorker.register("sw.js").catch(() => {});
  load();
})();
