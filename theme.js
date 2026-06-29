/* ============================================================
   Vault — theme.js
   h5ai-inspired directory listing using a python script
   Author : Abhiraj Bibhar
   Github : https://github.com/abhirajbibhar
   ============================================================ */

(function () {
  "use strict";

  /* ── Helpers ─────────────────────────────────────────── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function toast(msg, duration = 2400) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), duration);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── Theme toggle ────────────────────────────────────── */
  const THEME_KEY = "pl-theme";

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const icon = $("#theme-icon");
    if (icon) icon.textContent = t === "dark" ? "light_mode" : "dark_mode";
  }

  (function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(saved || preferred);

    const btn = $("#btn-theme");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
      });
    }
  })();

  /* ── Sidebar toggle (mobile) ─────────────────────────── */
  (function initMenu() {
    const btn = $("#btn-menu");
    const sidebar = $(".sidebar");
    if (!btn || !sidebar) return;

    const backdrop = document.createElement("div");
    backdrop.id = "sidebar-backdrop";
    document.body.appendChild(backdrop);

    function openSidebar() {
      sidebar.classList.add("open");
      backdrop.classList.add("visible");
      document.body.style.overflow = "hidden";
    }

    function closeSidebar() {
      sidebar.classList.remove("open");
      backdrop.classList.remove("visible");
      document.body.style.overflow = "";
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });

    backdrop.addEventListener("click", closeSidebar);
    $$("a", sidebar).forEach(a => a.addEventListener("click", closeSidebar));
  })();

  /* ── Keyboard shortcuts ───────────────────────────────── */
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      const q = $("#q");
      if (q) { q.focus(); q.select(); }
    }
    if (e.key === "Escape") {
      closeCtxMenu();
      closeModal();
      hideSearchResults();
      const q = $("#q");
      if (q) { q.value = ""; q.blur(); restoreList(); }
    }
  });

  /* ── Sort ────────────────────────────────────────────── */
  (function initSort() {
    const btns = $$(".seg button[data-sort]");
    const list = $("#files-view");
    if (!list) return;

    let currentSort = "name";
    let ascending = true;

    btns.forEach(btn => {
      const arrow = document.createElement("span");
      arrow.className = "sort-arrow";
      arrow.textContent = " ↑";
      arrow.style.cssText = "font-size:10px;opacity:0;margin-left:2px;transition:opacity .15s";
      btn.appendChild(arrow);
    });

    function updateArrows() {
      btns.forEach(btn => {
        const arrow = btn.querySelector(".sort-arrow");
        if (!arrow) return;
        if (btn.dataset.sort === currentSort) {
          arrow.textContent = ascending ? " ↑" : " ↓";
          arrow.style.opacity = "1";
        } else {
          arrow.style.opacity = "0";
        }
      });
    }

    function sortItems(field, asc) {
      const items = $$("li", list);

      items.sort((a, b) => {
        // Parent directory ".." always stays at the very top
        const aParent = a.dataset.parent === "true";
        const bParent = b.dataset.parent === "true";
        if (aParent !== bParent) return aParent ? -1 : 1;

        const aDir = a.dataset.ext === "folder";
        const bDir = b.dataset.ext === "folder";
        if (aDir !== bDir) return aDir ? -1 : 1;

        let cmp = 0;
        if (field === "name") {
          cmp = (a.dataset.name || "").toLowerCase().localeCompare(
            (b.dataset.name || "").toLowerCase(), undefined, { numeric: true, sensitivity: "base" }
          );
        } else if (field === "ext") {
          cmp = (a.dataset.ext || "").toLowerCase().localeCompare((b.dataset.ext || "").toLowerCase());
        } else if (field === "size") {
          cmp = parseFloat(a.dataset.size || "0") - parseFloat(b.dataset.size || "0");
        } else if (field === "modified") {
          const va = a.dataset.modified || "";
          const vb = b.dataset.modified || "";
          cmp = va < vb ? -1 : va > vb ? 1 : 0;
        }
        return asc ? cmp : -cmp;
      });

      items.forEach(el => list.appendChild(el));
    }

    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.sort;
        if (field === currentSort) {
          ascending = !ascending;
        } else {
          currentSort = field;
          ascending = true;
        }
        btns.forEach(b => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
        updateArrows();
        sortItems(field, ascending);
      });
    });

    updateArrows();
    sortItems("name", true);
  })();

  /* ── Unified Search (local + global) ─────────────────── */
  (function initSearch() {
    const input = $("#q");
    const list = $("#files-view");
    if (!input || !list) return;

    let structureData = null;
    let resultsEl = null;
    let activeIndex = -1;
    let debounceTimer;

    function getResultsEl() {
      if (!resultsEl) {
        resultsEl = document.createElement("ul");
        resultsEl.id = "search-results";
        document.body.appendChild(resultsEl);
      }
      return resultsEl;
    }

    async function loadStructure() {
      if (structureData) return structureData;
      const paths = ["/structure.json", "structure.json", "../structure.json", "../../structure.json"];
      for (const p of paths) {
        try {
          const r = await fetch(p);
          if (r.ok) { structureData = await r.json(); return structureData; }
        } catch (err) {
          console.warn("Failed to load structure.json from", p, err);
        }
      }
      return null;
    }

    function flattenFiles(node, results = []) {
      if (!node) return results;
      (node.files || []).forEach(f => results.push({ ...f, type: "file" }));
      Object.values(node.subdirs || {}).forEach(sub => {
        results.push({ name: sub.label, path: sub.path, type: "dir", ext: "folder" });
        flattenFiles(sub, results);
      });
      return results;
    }

    function getIcon(ext) {
      if (ext === "folder") return "folder";
      const map = {
        pdf: "picture_as_pdf", mp4: "movie", mkv: "movie", mov: "movie",
        mp3: "audio_file", wav: "audio_file", flac: "audio_file",
        png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
        zip: "folder_zip", rar: "folder_zip", gz: "folder_zip",
        doc: "description", docx: "description", txt: "article",
        xls: "table_chart", xlsx: "table_chart", csv: "table_chart",
        js: "code", ts: "code", py: "code", html: "code", css: "code",
      };
      return map[ext] || "insert_drive_file";
    }

    function setActive(items, idx) {
      items.forEach((li, i) => li.classList.toggle("active", i === idx));
      if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: "nearest" });
    }

    function showResults(results, q) {
      const el = getResultsEl();
      activeIndex = -1;
      el.innerHTML = "";

      if (!results.length) {
        el.innerHTML = `<li style="padding:14px;color:var(--muted);font-size:13px;pointer-events:none">No results for "<strong>${escHtml(q)}</strong>"</li>`;
      } else {
        results.slice(0, 20).forEach(r => {
          const li = document.createElement("li");
          const href = r.type === "dir" ? `/${r.path}/index.html` : `/${r.path}`;
          li.innerHTML = `
            <span class="material-symbols-outlined">${getIcon(r.ext || "")}</span>
            <div style="flex:1;overflow:hidden">
              <a href="${href}" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${highlightMatch(escHtml(r.name), q)}</a>
              <div class="result-path">${escHtml(r.path || "/")}</div>
            </div>`;
          li.addEventListener("mousedown", e => {
            e.preventDefault();
            window.location.href = href;
          });
          el.appendChild(li);
        });
      }

      positionResults();
      el.classList.add("visible");
    }

    function positionResults() {
      const el = getResultsEl();
      const rect = input.getBoundingClientRect();
      el.style.top = (rect.bottom + window.scrollY + 4) + "px";
      const left = rect.left + window.scrollX;
      el.style.left = left + "px";
      const available = window.innerWidth - left - 20;
      const w = Math.min(available, 980);
      el.style.width = Math.max(320, w) + "px";
      el.style.position = "absolute";
    }

    function highlightMatch(text, q) {
      if (!q) return text;
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      return text.replace(re, '<mark style="background:var(--accent-dim);color:var(--accent);border-radius:2px">$1</mark>');
    }

    function inlineFilter(q) {
      hideSearchResults();
      let visibleCount = 0;
      $$("#files-view li").forEach(li => {
        if (li.classList.contains("parent-dir")) return;
        const name = (li.dataset.name || "").toLowerCase();
        const match = name.includes(q.toLowerCase());
        li.style.display = match ? "" : "none";
        if (match) visibleCount++;
      });
      toggleEmptyState(visibleCount === 0);
    }

    async function globalSearch(q) {
      const data = await loadStructure();
      if (!data) return;
      const all = flattenFiles(data.root?.structure);
      const matches = all.filter(f => f.name.toLowerCase().includes(q.toLowerCase()));
      showResults(matches, q);
      toggleEmptyState(false);
    }

    function toggleEmptyState(show) {
      const empty = $("#empty-state");
      if (empty) empty.classList.toggle("visible", show);
    }

    // Unified input handler
    input.addEventListener("input", () => {
      const q = input.value.trim();
      if (!q) {
        restoreList();
        hideSearchResults();
        toggleEmptyState(false);
        return;
      }
      // Short queries = fast inline filter; longer/deeper = global search
      if (q.length <= 2 && !q.includes("/")) {
        inlineFilter(q);
      } else {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => globalSearch(q), 160);
      }
    });

    input.addEventListener("focus", () => {
      if (input.value.trim()) input.dispatchEvent(new Event("input"));
    });

    input.addEventListener("blur", () => {
      setTimeout(hideSearchResults, 200);
    });

    // Keyboard navigation in search results
    input.addEventListener("keydown", e => {
      const el = getResultsEl();
      if (!el.classList.contains("visible")) return;
      const items = $$("li", el).filter(li => li.style.pointerEvents !== "none");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        setActive(items, activeIndex);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        setActive(items, activeIndex);
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && items[activeIndex]) {
          const a = $("a", items[activeIndex]);
          if (a) window.location.href = a.href;
        }
      }
    });
  })();

  function hideSearchResults() {
    const el = $("#search-results");
    if (el) el.classList.remove("visible");
  }

  function restoreList() {
    $$("#files-view li").forEach(li => li.style.display = "");
  }

  /* ── Folder tree expand/collapse ─────────────────────── */
  (function initTree() {
    $$(".folder-label").forEach(label => {
      const toggle = $(".toggle", label);
      if (!toggle) return;
      toggle.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        label.closest("li.folder").classList.toggle("expanded");
      });
    });
  })();

  /* ── Context menu (three-dot + right-click) ──────────── */
  let ctxTarget = null;

  function buildCtxMenu() {
    let menu = $("#ctx-menu");
    if (menu) return menu;
    menu = document.createElement("div");
    menu.id = "ctx-menu";
    menu.innerHTML = `
      <button data-action="open"><span class="material-symbols-outlined">open_in_new</span> Open</button>
      <button data-action="download"><span class="material-symbols-outlined">download</span> Download</button>
      <button data-action="copy-url"><span class="material-symbols-outlined">link</span> Copy link</button>
      <button data-action="copy-path"><span class="material-symbols-outlined">content_copy</span> Copy path</button>
      <hr>
      <button data-action="share"><span class="material-symbols-outlined">share</span> Share</button>`;
    document.body.appendChild(menu);

    menu.addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const anchor = ctxTarget ? $("a", ctxTarget) : null;
      const href = anchor?.href || window.location.href;
      const name = ctxTarget?.dataset?.name || document.title;
      const path = ctxTarget?.dataset?.name || "";

      switch (action) {
        case "open":
          if (anchor) window.open(href, "_blank");
          break;
        case "download": {
          const a = document.createElement("a");
          a.href = href; a.download = name; a.click();
          break;
        }
        case "copy-url":
          navigator.clipboard.writeText(href).then(() => toast("Link copied!"));
          break;
        case "copy-path":
          navigator.clipboard.writeText(path).then(() => toast("Path copied!"));
          break;
        case "share":
          if (navigator.share) navigator.share({ title: name, url: href }).catch(() => {});
          else navigator.clipboard.writeText(href).then(() => toast("Link copied!"));
          break;
      }
      closeCtxMenu();
    });
    return menu;
  }

  function showCtxMenu(x, y, target) {
    const menu = buildCtxMenu();
    ctxTarget = target;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.add("visible");
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right > window.innerWidth) menu.style.left = (x - r.width) + "px";
      if (r.bottom > window.innerHeight) menu.style.top = (y - r.height) + "px";
    });
  }

  function closeCtxMenu() {
    const menu = $("#ctx-menu");
    if (menu) menu.classList.remove("visible");
    ctxTarget = null;
  }

  document.addEventListener("click", e => {
    const dot = e.target.closest(".three-dot");
    if (dot) {
      e.stopPropagation();
      const li = dot.closest("li");
      const rect = dot.getBoundingClientRect();
      showCtxMenu(rect.left, rect.bottom + 4, li);
      return;
    }
    closeCtxMenu();
  });

  document.addEventListener("contextmenu", e => {
    const li = e.target.closest("#files-view li");
    if (li) {
      e.preventDefault();
      showCtxMenu(e.clientX, e.clientY, li);
    }
  });

  /* ── Share / Download folder buttons ─────────────────── */
  const shareBtn = $("#btn-share");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const url = window.location.href;
      if (navigator.share) navigator.share({ title: document.title, url }).catch(() => {});
      else navigator.clipboard.writeText(url).then(() => toast("Folder URL copied!"));
    });
  }

  const dlBtn = $("#btn-download");
  if (dlBtn) {
    dlBtn.addEventListener("click", () => toast("Folder download not available in static mode."));
  }

  /* ── File detail modal ───────────────────────────────── */
  function openModal(item) {
    const modal = $("#file-modal");
    if (!modal) return;
    const anchor = $("a", item);
    const name = item.dataset.name || anchor?.textContent || "File";
    const size = (() => {
      const b = parseFloat(item.dataset.size || "0");
      if (!b) return item.querySelector(".meta")?.textContent || "";
      const units = ["B", "KB", "MB", "GB"];
      let s = b, u = 0;
      while (s >= 1024 && u < units.length - 1) { s /= 1024; u++; }
      return `${s.toFixed(1)} ${units[u]}`;
    })();
    const mod = item.dataset.modified || "";
    const href = anchor?.href || "#";
    const ext = item.dataset.ext || "";

    $("#modal-title").textContent = name;
    $("#modal-details").textContent = [ext.toUpperCase(), size, mod].filter(Boolean).join("  ·  ");

    const dlBtnM = $("#modal-download");
    if (dlBtnM) dlBtnM.onclick = () => {
      const a = document.createElement("a");
      a.href = href; a.download = name; a.click();
      closeModal();
    };

    const shareBtnM = $("#modal-share");
    if (shareBtnM) shareBtnM.onclick = () => {
      navigator.clipboard.writeText(href).then(() => toast("Link copied!"));
      closeModal();
    };

    const delBtn = $("#modal-delete");
    if (delBtn) delBtn.onclick = () => {
      toast("Delete not available in static mode.");
      closeModal();
    };

    modal.classList.add("open");
  }

  function closeModal() {
    const modal = $("#file-modal");
    if (modal) modal.classList.remove("open");
  }

  const closeModalBtn = $(".close-modal");
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeModal);
    closeModalBtn.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") closeModal();
    });
  }

  const modal = $("#file-modal");
  if (modal) modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  $$("#files-view li").forEach(li => {
    li.addEventListener("dblclick", e => {
      if (!e.target.closest("a") && !e.target.closest(".three-dot")) openModal(li);
    });
  });

  /* ── Back-to-top button ───────────────────────────────── */
  (function initBackToTop() {
    const btn = document.createElement("button");
    btn.id = "back-to-top";
    btn.title = "Back to top";
    btn.setAttribute("aria-label", "Back to top");
    btn.innerHTML = '<span class="material-symbols-outlined">arrow_upward</span>';
    document.body.appendChild(btn);

    window.addEventListener("scroll", () => {
      btn.classList.toggle("visible", window.scrollY > 320);
    }, { passive: true });

    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  })();

  /* ── Path bar — parent ".." row ──────────────────────── */
  (function initPathBar() {
    const list = $("#files-view");
    if (!list) return;

    const raw = window.location.pathname
      .replace(/\/index\.html$/, "")
      .replace(/\/$/, "");

    const isRoot = !raw || raw === "";
    if (!isRoot) {
      const segments = raw.split("/").filter(Boolean);
      const parentPath = segments.length === 1 ? "/" : "/" + segments.slice(0, -1).join("/") + "/";

      const existing = $("li.parent-dir", list);
      if (existing) existing.remove();

      const li = document.createElement("li");
      li.className = "parent-dir";
      li.dataset.ext = "folder";
      li.dataset.parent = "true";
      li.innerHTML = `
        <span class="material-symbols-outlined">drive_folder_upload</span>
        <a href="${parentPath}">..</a>`;
      list.insertBefore(li, list.firstChild);
    }
  })();

  /* ── Tooltips for truncated names ────────────────────── */
  (function initTooltips() {
    const list = $("#files-view");
    if (!list) return;

    function setTitle(a) {
      if (!a) return;
      try {
        const href = a.getAttribute("href") || a.href || "";
        const url = new URL(href, window.location.href);
        let p = decodeURIComponent(url.pathname || href);
        p = p.replace(/\/index\.html$/, "").replace(/\/$/, "") || url.pathname;
        a.title = p || a.textContent.trim();
      } catch {
        a.title = a.textContent.trim();
      }
    }

    function refresh() {
      $$("#files-view li a").forEach(a => setTitle(a));
      $$(".folder-label a").forEach(a => setTitle(a));
    }

    refresh();
    const obs = new MutationObserver(refresh);
    obs.observe(list, { childList: true, subtree: true });
  })();

  /* ── Resizable sidebar with touch + storage ────────────────── */
  (function initResizableSidebar() {
    const root = document.documentElement;
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    const resizer = document.createElement("div");
    resizer.id = "sidebar-resizer";
    resizer.title = "Drag to resize sidebar (double-click to reset)";
    document.body.appendChild(resizer);

    let dragging = false;
    let startX = 0;
    let startW = parseInt(getComputedStyle(root).getPropertyValue("--sidebar-w")) || 260;

    // Load saved width if available
    const savedW = localStorage.getItem("sidebar-width");
    if (savedW) {
      root.style.setProperty("--sidebar-w", savedW + "px");
    }

    function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

    function startDrag(clientX) {
      if (window.innerWidth <= 720) return;
      dragging = true;
      startX = clientX;
      startW = parseInt(getComputedStyle(root).getPropertyValue("--sidebar-w")) || sidebar.offsetWidth;
      document.body.style.userSelect = "none";
    }

    function moveDrag(clientX) {
      if (!dragging) return;
      const dx = clientX - startX;
      const maxW = Math.min(900, window.innerWidth - 200);
      const newW = clamp(startW + dx, 160, maxW);
      root.style.setProperty("--sidebar-w", newW + "px");
      localStorage.setItem("sidebar-width", newW); // save width
      positionResizer();
    }

    function endDrag() {
      if (dragging) {
        dragging = false;
        document.body.style.userSelect = "";
      }
    }

    // Mouse events
    resizer.addEventListener("mousedown", (e) => startDrag(e.clientX));
    window.addEventListener("mousemove", (e) => moveDrag(e.clientX));
    window.addEventListener("mouseup", endDrag);

    // Touch events (for large screens only)
    resizer.addEventListener("touchstart", (e) => {
      if (window.innerWidth > 720) {
        startDrag(e.touches[0].clientX);
      }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (window.innerWidth > 720) {
        moveDrag(e.touches[0].clientX);
      }
    }, { passive: false });

    window.addEventListener("touchend", endDrag);

    resizer.addEventListener("dblclick", () => {
      root.style.removeProperty("--sidebar-w");
      localStorage.removeItem("sidebar-width"); // reset saved width
    });

    function positionResizer() {
      const rect = sidebar.getBoundingClientRect();
      resizer.style.position = "fixed";
      resizer.style.left = rect.right + "px";
      resizer.style.top = rect.top + "px";
      resizer.style.height = rect.height + "px";
    }

    positionResizer();
    window.addEventListener("resize", positionResizer, { passive: true });
    const obs = new MutationObserver(positionResizer);
    obs.observe(sidebar, { attributes: true, attributeFilter: ["class", "style"] });
  })();

  /* ── File list keyboard navigation ───────────────────── */
  (function initFileListKeyboard() {
    const list = $("#files-view");
    if (!list) return;

    let focusedIndex = -1;
    const getItems = () => $$("#files-view li:not(.parent-dir):not([style*='display: none'])");

    list.addEventListener("keydown", e => {
      const items = getItems();
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
        items[focusedIndex]?.scrollIntoView({ block: "nearest" });
        items[focusedIndex]?.classList.add("focused");
        items.forEach((li, i) => i !== focusedIndex && li.classList.remove("focused"));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        items[focusedIndex]?.scrollIntoView({ block: "nearest" });
        items[focusedIndex]?.classList.add("focused");
        items.forEach((li, i) => i !== focusedIndex && li.classList.remove("focused"));
      } else if (e.key === "Enter") {
        const item = items[focusedIndex];
        if (item) {
          const a = $("a", item);
          if (a) window.location.href = a.href;
        }
      }
    });

    // Make list focusable
    list.setAttribute("tabindex", "0");
  })();

})();
