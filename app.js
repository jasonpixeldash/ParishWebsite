(function () {
  const data = window.PARISH_DATA;
  if (!data || !Array.isArray(data.events)) {
    document.getElementById("results").innerHTML = "<p class='empty'>Event data did not load.</p>";
    return;
  }

  const TZ = "America/Chicago";
  const state = {
    q: "",
    cities: new Set(),
    categories: new Set(),
    free: false,
    range: "all",
    view: "grid",
    day: null,
    open: null
  };

  const $ = (id) => document.getElementById(id);
  const results = $("results");
  const search = $("search");

  function parts(date) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", month: "short", day: "numeric",
      year: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h23"
    });
    const map = {};
    fmt.formatToParts(date).forEach((p) => { map[p.type] = p.value; });
    return map;
  }

  function ymd(date) {
    const p = parts(date);
    const months = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
    const m = String(months[p.month]).padStart(2, "0");
    const d = String(p.day).padStart(2, "0");
    return `${p.year}-${m}-${d}`;
  }

  function eventDay(ev) {
    return String(ev.start).slice(0, 10);
  }

  function todayYmd() {
    return ymd(new Date());
  }

  function addDays(ymdStr, n) {
    const [y, m, d] = ymdStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n, 18));
    return dt.toISOString().slice(0, 10);
  }

  function weekdayIndex(ymdStr) {
    const [y, m, d] = ymdStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  function rangeBounds() {
    const today = todayYmd();
    if (state.range === "all") return null;
    if (state.range === "7") return [today, addDays(today, 6)];
    const dow = weekdayIndex(today);
    if (state.range === "weekend") {
      const sat = addDays(today, (6 - dow + 7) % 7);
      if (dow === 0) return [addDays(today, -1), today];
      return [sat, addDays(sat, 1)];
    }
    const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
    return [monday, addDays(monday, 6)];
  }

  function inRange(ev) {
    const bounds = rangeBounds();
    if (!bounds) return true;
    const day = eventDay(ev);
    return day >= bounds[0] && day <= bounds[1];
  }

  function isFree(ev) {
    if (ev.priceMin === 0) return true;
    return typeof ev.priceText === "string" && /\bfree\b/i.test(ev.priceText);
  }

  function haystack(ev) {
    return [ev.title, ev.venue, ev.city, ev.description, ...(ev.tags || [])].join(" ").toLowerCase();
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return data.events.filter((ev) => {
      if (state.cities.size && !state.cities.has(ev.city)) return false;
      if (state.categories.size && !state.categories.has(ev.category)) return false;
      if (state.free && !isFree(ev)) return false;
      if (!inRange(ev)) return false;
      if (q && !haystack(ev).includes(q)) return false;
      return true;
    }).sort((a, b) => String(a.start).localeCompare(String(b.start)) || a.title.localeCompare(b.title));
  }

  function whenLabel(ev) {
    const day = eventDay(ev);
    const [y, m, d] = day.split("-").map(Number);
    const noon = new Date(Date.UTC(y, m - 1, d, 17));
    const p = parts(noon);
    const dateBit = `${p.weekday}, ${p.month} ${p.day}`;
    if (ev.timeUnknown || !String(ev.start).includes("T")) return `${dateBit} · time not listed`;
    const clock = new Date(ev.start);
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour: "numeric", minute: "2-digit"
    }).format(clock);
    return `${dateBit} · ${time}`;
  }

  function media(ev) {
    if (ev.image) {
      const src = ev.image.startsWith("http") ? ev.image : ev.image;
      return `<div class="media" style="background-image:url('${escapeAttr(src)}')"></div>`;
    }
    return `<div class="placeholder"><b>${escapeHtml(ev.category)}</b><span>${escapeHtml(ev.venue || ev.city)}</span></div>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/\)/g, "%29").replace(/\(/g, "%28"); }

  function card(ev, row) {
    const href = ev.ticketUrl || ev.sourceUrl;
    const label = ev.ticketUrl ? "Tickets" : "Details";
    return `<article class="card ${row ? "rowish" : ""}">
      ${media(ev)}
      <div class="body">
        <div class="kicker"><span class="pill">${escapeHtml(ev.category)}</span><span class="city">${escapeHtml(ev.city)}</span></div>
        <h3>${escapeHtml(ev.title)}</h3>
        <p class="venue">${escapeHtml(ev.venue || "Venue not listed")}</p>
        <p class="when">${escapeHtml(whenLabel(ev))}</p>
        <p class="price">${escapeHtml(ev.priceText || "Price not listed")}</p>
        <div class="actions">
          <a href="${escapeAttr(href)}" target="_blank" rel="noopener">${label}</a>
          <button type="button" class="ghost" data-open="${escapeAttr(ev.id)}">More</button>
        </div>
      </div>
    </article>`;
  }

  function renderGrid(list) {
    results.className = "results grid";
    $("date-strip").hidden = true;
    if (!list.length) {
      results.innerHTML = "<p class='empty'>No events match these filters. Clear a city, category, or the search.</p>";
      return;
    }
    results.innerHTML = list.map((ev) => card(ev, false)).join("");
  }

  function renderCalendar(list) {
    results.className = "results calendar";
    const strip = $("date-strip");
    const days = [...new Set(list.map(eventDay))];
    if (!list.length) {
      strip.hidden = true;
      results.innerHTML = "<p class='empty'>No events match these filters. Clear a city, category, or the search.</p>";
      return;
    }
    if (!state.day || !days.includes(state.day)) state.day = days[0];
    strip.hidden = false;
    strip.innerHTML = days.map((day) => {
      const [y, m, d] = day.split("-").map(Number);
      const p = parts(new Date(Date.UTC(y, m - 1, d, 17)));
      return `<button type="button" class="day-btn ${day === state.day ? "on" : ""}" data-day="${day}"><span>${p.weekday}</span><strong>${p.day}</strong></button>`;
    }).join("");
    const groups = days.filter((day) => day === state.day);
    results.innerHTML = groups.map((day) => {
      const [y, m, d] = day.split("-").map(Number);
      const p = parts(new Date(Date.UTC(y, m - 1, d, 17)));
      const items = list.filter((ev) => eventDay(ev) === day).map((ev) => card(ev, true)).join("");
      return `<section class="agenda-day"><h2>${p.weekday}, ${p.month} ${p.day}</h2><div class="agenda-list">${items}</div></section>`;
    }).join("");
  }

  function render() {
    const list = filtered();
    const updated = data.updatedAt
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: TZ, dateStyle: "medium", timeStyle: "short"
        }).format(new Date(data.updatedAt))
      : "unknown";
    $("meta").textContent = `${list.length} event${list.length === 1 ? "" : "s"} · Updated ${updated} CT`;
    if (state.view === "calendar") renderCalendar(list);
    else renderGrid(list);
  }

  function chipRow(container, values, key, includeAll) {
    const buttons = [];
    if (includeAll) buttons.push(["All", null]);
    values.forEach((value) => buttons.push([value, value]));
    container.innerHTML = buttons.map(([label, value]) => {
      const on = value === null ? state[key].size === 0 : state[key].has(value);
      return `<button type="button" class="chip ${on ? "on" : ""}" data-key="${key}" data-value="${escapeAttr(value || "")}">${escapeHtml(label)}</button>`;
    }).join("");
  }

  function usedCategories() {
    const have = new Set(data.events.map((ev) => ev.category));
    return data.categories.filter((cat) => have.has(cat));
  }

  function paintFilters() {
    chipRow($("city-filters"), data.cities, "cities", true);
    chipRow($("category-filters"), usedCategories(), "categories", true);
    const ranges = [
      ["weekend", "This weekend"],
      ["week", "This week"],
      ["7", "Next 7 days"],
      ["all", "All"]
    ];
    $("range-filters").innerHTML = ranges.map(([id, label]) =>
      `<button type="button" class="chip ${state.range === id ? "on" : ""}" data-range="${id}">${label}</button>`
    ).join("");
    $("free-toggle").classList.toggle("on", state.free);
    $("free-toggle").classList.toggle("moss", state.free);
    $("free-toggle").setAttribute("aria-pressed", String(state.free));
    $("view-grid").classList.toggle("on", state.view === "grid");
    $("view-cal").classList.toggle("on", state.view === "calendar");
    $("view-grid").setAttribute("aria-pressed", String(state.view === "grid"));
    $("view-cal").setAttribute("aria-pressed", String(state.view === "calendar"));
  }

  function openPanel(id) {
    const ev = data.events.find((item) => item.id === id);
    if (!ev) return;
    state.open = id;
    const href = ev.ticketUrl || ev.sourceUrl;
    const label = ev.ticketUrl ? "Tickets" : "Details";
    $("panel-body").innerHTML = `
      ${media(ev)}
      <p class="kicker"><span class="pill">${escapeHtml(ev.category)}</span> <span class="city">${escapeHtml(ev.city)}</span></p>
      <h3 id="panel-title">${escapeHtml(ev.title)}</h3>
      <p class="lead">${escapeHtml(ev.venue || "Venue not listed")}</p>
      <p>${escapeHtml(whenLabel(ev))}</p>
      <p>${escapeHtml(ev.priceText || "Price not listed")}</p>
      <p>${escapeHtml(ev.address || "Address not listed")}</p>
      <p class="lead">${escapeHtml(ev.description || "")}</p>
      <p>Source: ${escapeHtml(ev.sourceName || "listed page")}</p>
      <p><a class="go" href="${escapeAttr(href)}" target="_blank" rel="noopener">${label}</a></p>
    `;
    $("panel").hidden = false;
    $("panel-close").focus();
  }

  function closePanel() {
    state.open = null;
    $("panel").hidden = true;
  }

  document.body.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-key]");
    if (chip) {
      const key = chip.dataset.key;
      const value = chip.dataset.value;
      if (!value) state[key].clear();
      else if (state[key].has(value)) state[key].delete(value);
      else state[key].add(value);
      paintFilters();
      render();
      return;
    }
    const range = event.target.closest("[data-range]");
    if (range) {
      state.range = range.dataset.range;
      state.day = null;
      paintFilters();
      render();
      return;
    }
    const day = event.target.closest("[data-day]");
    if (day) {
      state.day = day.dataset.day;
      render();
      return;
    }
    const more = event.target.closest("[data-open]");
    if (more) openPanel(more.dataset.open);
  });

  $("free-toggle").addEventListener("click", () => {
    state.free = !state.free;
    paintFilters();
    render();
  });
  $("view-grid").addEventListener("click", () => { state.view = "grid"; paintFilters(); render(); });
  $("view-cal").addEventListener("click", () => { state.view = "calendar"; state.day = null; paintFilters(); render(); });
  search.addEventListener("input", () => { state.q = search.value; render(); });
  $("panel-close").addEventListener("click", closePanel);
  $("panel").addEventListener("click", (event) => { if (event.target === $("panel")) closePanel(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel();
    if (event.key === "/" && document.activeElement !== search) {
      event.preventDefault();
      search.focus();
    }
  });

  paintFilters();
  render();
})();
