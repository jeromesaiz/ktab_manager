/* popup.js – Tab Manager with Domain + Window grouping */
(async () => {
  const root = document.getElementById("root");
  const searchInput = document.getElementById("searchInput");
  const totalCountEl = document.getElementById("totalCount");
  const btnDomain = document.getElementById("btnDomain");
  const btnWindow = document.getElementById("btnWindow");
  const btnDupes   = document.getElementById("btnDupes");
  const btnMuteAll = document.getElementById("btnMuteAll");
  const btnPopularity = document.getElementById("btnPopularity");

  // ── Fetch tabs ────────────────────────────────────────────────────────────
  const tabs = await browser.tabs.query({});
  totalCountEl.textContent = tabs.length + " tab" + (tabs.length !== 1 ? "s" : "");

  if (tabs.length === 0) {
    root.innerHTML = '<div class="empty">No tabs found.</div>';
    return;
  }

  // Disable dupes button if nothing to close
  function updateDupesBtn() {
    const seen = new Set();
    const hasDupes = tabs.some(function(t) {
      if (!t.url || t.url === "about:newtab") return false;
      if (seen.has(t.url)) return true;
      seen.add(t.url); return false;
    });
    btnDupes.disabled = !hasDupes;
    btnDupes.title = hasDupes ? "Close all duplicate tabs, keeping one per URL" : "No duplicate tabs";
  }

  // Update mute-all button appearance based on current audio state
  function updateMuteAllBtn() {
    const audibleTabs = tabs.filter(function(t) { return t.audible && !(t.mutedInfo && t.mutedInfo.muted); });
    const mutedTabs   = tabs.filter(function(t) { return t.mutedInfo && t.mutedInfo.muted; });
    const allMuted    = audibleTabs.length === 0 && mutedTabs.length > 0;

    btnMuteAll.classList.toggle("has-audio",  audibleTabs.length > 0);
    btnMuteAll.classList.toggle("all-muted",  allMuted);

    if (audibleTabs.length > 0) {
      btnMuteAll.innerHTML = "&#128266;"; // 🔊
      btnMuteAll.title = "Mute all playing tabs (" + audibleTabs.length + ")";
    } else if (allMuted) {
      btnMuteAll.innerHTML = "&#128263;"; // 🔇
      btnMuteAll.title = "Unmute all muted tabs";
    } else {
      btnMuteAll.innerHTML = "&#128266;"; // 🔊
      btnMuteAll.title = "No audio playing";
    }
  }

  // ── Popularity sort state ──────────────────────────────────────────────────
  let popularitySort = true;
  let accessCounts = {};
  try {
    accessCounts = await browser.runtime.sendMessage({ type: "getAccessCounts" }) || {};
  } catch (e) {
    accessCounts = {};
  }
  var POPULARITY_THRESHOLD = 5;
  function getCount(tabId) {
    var count = accessCounts[tabId] || 0;
    return count >= POPULARITY_THRESHOLD ? count : 0;
  }

  updateDupesBtn();
  updateMuteAllBtn();

  // ── Color palette — vivid, distinct ──────────────────────────────────────
  const PALETTE = [
    "#e53935", // red
    "#1e88e5", // blue
    "#43a047", // green
    "#8e24aa", // purple
    "#fb8c00", // orange
    "#00897b", // teal
    "#d81b60", // pink
    "#6d4c41", // brown
    "#039be5", // light blue
    "#7cb342", // light green
    "#f4511e", // deep orange
    "#5e35b1", // deep purple
    "#00acc1", // cyan
    "#c0ca33", // lime
    "#ffb300", // amber
  ];
  const colorCache = {};
  let colorIdx = 0;
  function colorFor(key) {
    if (!colorCache[key]) colorCache[key] = PALETTE[colorIdx++ % PALETTE.length];
    return colorCache[key];
  }
  // Dim version (rgba) for selected-row background
  function dimColor(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return "rgba(" + r + "," + g + "," + b + ",0.18)";
  }

  // ── Domain helper ─────────────────────────────────────────────────────────
  function domainOf(url) {
    if (!url) return "browser";
    try {
      const u = new URL(url);
      if (!["http:", "https:", "ftp:"].includes(u.protocol)) return "browser";
      // strip www.
      return u.hostname.replace(/^www\./, "");
    } catch (e) { return "browser"; }
  }

  // ── Build groups: domain or window ───────────────────────────────────────
  function buildDomainGroups(tabs) {
    const map = new Map();
    tabs.forEach(function(t) {
      const d = domainOf(t.url);
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(t);
    });
    return new Map([...map.entries()].sort(function(a, b) {
      if (a[0] === "browser") return 1;
      if (b[0] === "browser") return -1;
      if (popularitySort) {
        var aSum = a[1].reduce(function(s, t) { return s + getCount(t.id); }, 0);
        var bSum = b[1].reduce(function(s, t) { return s + getCount(t.id); }, 0);
        if (aSum !== bSum) return bSum - aSum;
      }
      return a[0].localeCompare(b[0]);
    }));
  }

  function buildWindowGroups(tabs) {
    const map = new Map();
    tabs.forEach(function(t) {
      if (!map.has(t.windowId)) map.set(t.windowId, []);
      map.get(t.windowId).push(t);
    });
    return new Map([...map.entries()].sort(function(a, b) {
      if (popularitySort) {
        var aSum = a[1].reduce(function(s, t) { return s + getCount(t.id); }, 0);
        var bSum = b[1].reduce(function(s, t) { return s + getCount(t.id); }, 0);
        if (aSum !== bSum) return bSum - aSum;
      }
      var aA = a[1].some(function(t) { return t.active; }) ? 0 : 1;
      var bA = b[1].some(function(t) { return t.active; }) ? 0 : 1;
      return aA - bA || a[0] - b[0];
    }));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  let currentMode = "domain"; // "domain" | "window"
  let allRows = [];
  let winCounter = 0;

  function render(mode) {
    root.innerHTML = "";
    allRows = [];
    winCounter = 0;
    const frag = document.createDocumentFragment();

    // Sort tabs by popularity before grouping (preserves within-group order)
    const sortedTabs = popularitySort
      ? tabs.slice().sort(function(a, b) { return getCount(b.id) - getCount(a.id); })
      : tabs;

    const groups = mode === "domain" ? buildDomainGroups(sortedTabs) : buildWindowGroups(sortedTabs);

    groups.forEach(function(groupTabs, groupKey) {
      const label = mode === "domain"
        ? groupKey
        : ("Window " + (++winCounter) + (groupTabs.some(function(t) { return t.active; }) ? " ●" : ""));

      const color = colorFor(groupKey);
      const dim   = dimColor(color);

      const section = document.createElement("div");
      section.className = "group-section";
      section.style.setProperty("--group-color", color);
      section.style.setProperty("--group-color-dim", dim);

      // Header
      const header = document.createElement("div");
      header.className = "group-header";
      const pill = document.createElement("span");
      pill.className = "group-pill";
      pill.textContent = label;
      const count = document.createElement("span");
      count.className = "group-count";
      count.textContent = groupTabs.length;
      const chev = document.createElement("span");
      chev.className = "group-chev";
      chev.innerHTML = "&#9660;";

      // Close-group button — appears on header hover
      const closeGroupBtn = document.createElement("button");
      closeGroupBtn.className = "group-close-btn";
      closeGroupBtn.title = "Close all tabs in this group";
      closeGroupBtn.innerHTML = "&#10005;";
      closeGroupBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        closeGroup(section, groupTabs.slice());
      });

      header.appendChild(pill);
      header.appendChild(count);
      header.appendChild(closeGroupBtn);
      header.appendChild(chev);
      // Collapse on pill/chev click, not on close button
      header.addEventListener("click", function() { section.classList.toggle("collapsed"); });

      // Tab list
      const ul = document.createElement("ul");
      ul.className = "tab-list";

      groupTabs.forEach(function(tab) {
        const li = buildTabRow(tab, mode, color);
        ul.appendChild(li);
        allRows.push(li);
      });

      section.appendChild(header);
      section.appendChild(ul);
      frag.appendChild(section);
    });

    root.appendChild(frag);
    searchInput.dispatchEvent(new Event("input")); // re-apply active filter
  }

  function buildTabRow(tab, mode, groupColor) {
    const isMuted   = tab.mutedInfo && tab.mutedInfo.muted;
    const isAudible = tab.audible && !isMuted;

    const li = document.createElement("li");
    li.className = "tab-row" +
      (tab.active   ? " active-tab" : "") +
      (isAudible    ? " is-audible" : "") +
      (isMuted      ? " is-muted"   : "");
    li.tabIndex = -1;
    li.dataset.tabId  = tab.id;
    li.dataset.title  = (tab.title || "").toLowerCase();
    li.dataset.url    = (tab.url   || "").toLowerCase();

    // Favicon
    const favWrap = document.createElement("div");
    favWrap.className = "tab-favicon-wrap";
    const favUrl = tab.favIconUrl;
    if (favUrl && favUrl.indexOf("chrome://") !== 0 && favUrl !== "") {
      const img = document.createElement("img");
      img.className = "tab-favicon";
      img.src = favUrl;
      img.alt = "";
      img.onerror = function() {
        const ph = makeFaviconPh(tab);
        img.replaceWith(ph);
      };
      favWrap.appendChild(img);
    } else {
      favWrap.appendChild(makeFaviconPh(tab));
    }

    // Text
    const info = document.createElement("div");
    info.className = "tab-info";
    const titleEl = document.createElement("div");
    titleEl.className = "tab-title";
    titleEl.textContent = tab.title || "Untitled";
    info.appendChild(titleEl);

    // Domain label (shown in both modes — useful context in window mode)
    const domainEl = document.createElement("div");
    domainEl.className = "tab-domain";
    domainEl.textContent = domainOf(tab.url);

    // Active dot
    const dot = tab.active ? (() => { const d = document.createElement("div"); d.className = "active-dot"; return d; })() : null;

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "tab-actions";

    const reloadBtn = document.createElement("button");
    reloadBtn.className = "act-btn";
    reloadBtn.title = "Reload";
    reloadBtn.innerHTML = "&#8635;";
    reloadBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      browser.tabs.reload(tab.id);
    });

    // Mute / unmute
    const muteBtn = document.createElement("button");
    // Three states: audible (playing), muted (silenced), silent (neither)
    if (isMuted) {
      muteBtn.className = "act-btn muted-btn";
      muteBtn.title     = "Unmute tab";
      muteBtn.innerHTML = "&#128263;"; // 🔇
    } else if (isAudible) {
      muteBtn.className = "act-btn audible-btn";
      muteBtn.title     = "Mute tab";
      muteBtn.innerHTML = "&#128266;"; // 🔊
    } else {
      muteBtn.className = "act-btn";
      muteBtn.title     = "Mute tab";
      muteBtn.innerHTML = "&#128266;"; // 🔊 — shown only on hover
    }
    muteBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      const nowMuted = tab.mutedInfo && tab.mutedInfo.muted;
      browser.tabs.update(tab.id, { muted: !nowMuted }).then(function(updated) {
        tab.mutedInfo = updated.mutedInfo;
        tab.audible   = updated.audible;
        const nowM = updated.mutedInfo && updated.mutedInfo.muted;
        const nowA = updated.audible && !nowM;
        if (nowM) {
          muteBtn.className = "act-btn muted-btn";
          muteBtn.title     = "Unmute tab";
          muteBtn.innerHTML = "&#128263;";
        } else if (nowA) {
          muteBtn.className = "act-btn audible-btn";
          muteBtn.title     = "Mute tab";
          muteBtn.innerHTML = "&#128266;";
        } else {
          muteBtn.className = "act-btn";
          muteBtn.title     = "Mute tab";
          muteBtn.innerHTML = "&#128266;";
        }
        li.classList.toggle("is-muted",   nowM);
        li.classList.toggle("is-audible", nowA);
        updateMuteAllBtn();
      });
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "act-btn close";
    closeBtn.title = "Close tab (Alt+X)";
    closeBtn.innerHTML = "&#10005;";
    closeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      closeTabRow(tab, li);
    });

    actions.appendChild(reloadBtn);
    actions.appendChild(muteBtn);
    actions.appendChild(closeBtn);

    li.appendChild(favWrap);
    li.appendChild(info);
    li.appendChild(domainEl);
    if (dot) li.appendChild(dot);
    li.appendChild(actions);

    li.addEventListener("click", function() { goToTab(tab); });
    li.addEventListener("keydown", function(e) { if (e.key === "Enter") goToTab(tab); });

    return li;
  }

  function makeFaviconPh(tab) {
    const ph = document.createElement("div");
    ph.className = "favicon-ph";
    // Use first letter of domain as placeholder
    const d = domainOf(tab.url);
    ph.textContent = d === "browser" ? "⊙" : d[0].toUpperCase();
    return ph;
  }

  // ── Mute all / unmute all ─────────────────────────────────────────────────
  btnMuteAll.addEventListener("click", async function() {
    const audibleTabs = tabs.filter(function(t) { return t.audible && !(t.mutedInfo && t.mutedInfo.muted); });
    const mutedTabs   = tabs.filter(function(t) { return t.mutedInfo && t.mutedInfo.muted; });
    const shouldMute  = audibleTabs.length > 0; // mute if anything playing; else unmute all

    const targets = shouldMute ? audibleTabs : mutedTabs;
    await Promise.all(targets.map(function(t) {
      return browser.tabs.update(t.id, { muted: shouldMute }).then(function(updated) {
        t.mutedInfo = updated.mutedInfo;
        t.audible   = updated.audible;
      });
    }));

    updateMuteAllBtn();
    render(currentMode); // re-render to reflect new mute icons on rows
  });

  // ── Close duplicates ──────────────────────────────────────────────────────
  btnDupes.addEventListener("click", async function() {
    const seen  = new Map(); // url → tab to keep (prefer active, else first)
    const toClose = [];

    tabs.forEach(function(t) {
      if (!t.url || t.url === "about:newtab") return;
      if (!seen.has(t.url)) {
        seen.set(t.url, t);
      } else {
        // Replace kept tab with active one if this one is active
        if (t.active && !seen.get(t.url).active) {
          toClose.push(seen.get(t.url));
          seen.set(t.url, t);
        } else {
          toClose.push(t);
        }
      }
    });

    if (toClose.length === 0) return;

    const idsToClose = toClose.map(function(t) { return t.id; });
    await browser.tabs.remove(idsToClose);

    // Remove closed tabs from local array and re-render
    const closedSet = new Set(idsToClose);
    tabs.splice(0, tabs.length, ...tabs.filter(function(t) { return !closedSet.has(t.id); }));
    totalCountEl.textContent = tabs.length + " tab" + (tabs.length !== 1 ? "s" : "");
    updateDupesBtn();
    render(currentMode);
  });

  // ── Mode toggle ───────────────────────────────────────────────────────────
  btnDomain.addEventListener("click", function() { switchMode("domain"); });
  btnWindow.addEventListener("click", function() { switchMode("window"); });
  btnPopularity.addEventListener("click", function() {
    popularitySort = !popularitySort;
    btnPopularity.classList.toggle("active", popularitySort);
    render(currentMode);
  });

  // ── Search ────────────────────────────────────────────────────────────────
  searchInput.addEventListener("input", function() {
    const q = searchInput.value.toLowerCase().trim();
    allRows.forEach(function(row) {
      const matches = !q || row.dataset.title.indexOf(q) !== -1 || row.dataset.url.indexOf(q) !== -1;
      row.classList.toggle("no-match", !matches);
      if (!matches) row.classList.remove("selected");
    });
    // Hide empty groups
    root.querySelectorAll(".group-section").forEach(function(sec) {
      const anyVisible = sec.querySelector(".tab-row:not(.no-match)");
      sec.classList.toggle("all-hidden", !anyVisible);
    });
    if (q) selectRow(visibleRows()[0] || null);
    else deselectAll();
  });

  // ── Shared helpers used by both UI and keyboard ───────────────────────────
  function closeTabRow(tab, li) {
    // Move selection to next visible row before removing
    const visible = visibleRows();
    const idx = visible.indexOf(li);
    const nextRow = visible[idx + 1] || visible[idx - 1] || null;

    browser.tabs.remove(tab.id).then(function() {
      li.remove();
      const i = allRows.indexOf(li);
      if (i !== -1) allRows.splice(i, 1);
      // Update group count, hide group if empty
      const ul = li.closest(".tab-list");
      if (ul) {
        const remaining = ul.querySelectorAll(".tab-row:not(.no-match)").length;
        const countEl = ul.closest(".group-section").querySelector(".group-count");
        if (countEl) countEl.textContent = remaining;
        if (remaining === 0) ul.closest(".group-section").classList.add("all-hidden");
      }
      // Update total count
      const tidx = tabs.indexOf(tab);
      if (tidx !== -1) tabs.splice(tidx, 1);
      totalCountEl.textContent = tabs.length + " tab" + (tabs.length !== 1 ? "s" : "");
      updateDupesBtn();
      // Shift selection to neighbour
      if (nextRow) selectRow(nextRow);
    });
  }

  function switchMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;
    btnDomain.classList.toggle("active", mode === "domain");
    btnWindow.classList.toggle("active", mode === "window");
    render(mode);
  }

  // Close every tab in a group and remove the section from the DOM
  function closeGroup(section, groupTabs) {
    const ids = groupTabs.map(function(t) { return t.id; });
    browser.tabs.remove(ids).then(function() {
      // Remove rows from allRows
      groupTabs.forEach(function(t) {
        const row = allRows.find(function(r) { return parseInt(r.dataset.tabId) === t.id; });
        if (row) allRows.splice(allRows.indexOf(row), 1);
        const ti = tabs.indexOf(t);
        if (ti !== -1) tabs.splice(ti, 1);
      });
      section.remove();
      totalCountEl.textContent = tabs.length + " tab" + (tabs.length !== 1 ? "s" : "");
      updateDupesBtn();
    });
  }

  // ── Keyboard nav (document-level so it works regardless of focus) ─────────
  document.addEventListener("keydown", function(e) {
    const visible = visibleRows();
    const cur = root.querySelector(".tab-row.selected");
    const idx = visible.indexOf(cur);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      searchInput.blur();
      selectRow(idx === -1 ? visible[0] : visible[Math.min(idx + 1, visible.length - 1)]);

    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      searchInput.blur();
      selectRow(idx === -1 ? visible[0] : visible[Math.max(idx - 1, 0)]);

    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = root.querySelector(".tab-row.selected");
      if (sel) sel.click();

    } else if (e.code === "KeyX" && e.altKey && cur && document.activeElement !== searchInput) {
      e.preventDefault();
      const tabId = parseInt(cur.dataset.tabId);
      const tabObj = tabs.find(function(t) { return t.id === tabId; });
      if (tabObj) closeTabRow(tabObj, cur);

    } else if (e.key === "Tab") {
      // Cycle Domain ↔ Window without leaving keyboard
      e.preventDefault();
      switchMode(currentMode === "domain" ? "window" : "domain");

    } else if (e.key === "Escape") {
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input"));
      searchInput.focus();

    } else if (
      e.key.length === 1 &&
      !e.ctrlKey && !e.metaKey && !e.altKey &&
      document.activeElement !== searchInput
    ) {
      searchInput.focus();
    }
  });

  function visibleRows() {
    return allRows.filter(function(r) { return !r.classList.contains("no-match"); });
  }
  function deselectAll() { allRows.forEach(function(r) { r.classList.remove("selected"); }); }
  function selectRow(row) {
    deselectAll();
    if (row) { row.classList.add("selected"); row.scrollIntoView({ block: "nearest" }); }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function goToTab(tab) {
    await browser.tabs.update(tab.id, { active: true });
    await browser.windows.update(tab.windowId, { focused: true });
    window.close();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  render("domain");
  searchInput.focus();
})();
