/* =====================================================================
   RSL Library — Interaktivitaet
   Suche, Filter, Akkordeon, Scroll-Reveal, Download-Toast, Back-to-top
   ===================================================================== */
(function () {
  "use strict";

  /* ---- Scroll reveal ---- */
  const revealEls = document.querySelectorAll(".rsl-item, .mod-card, .dl-hub-card");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  /* ---- Accordion expand/collapse ---- */
  document.querySelectorAll(".rsl-item").forEach((item) => {
    const head = item.querySelector(".rsl-item-head");
    const toggle = item.querySelector(".btn-toggle");
    const open = () => item.classList.toggle("open");
    if (head) {
      head.addEventListener("click", (ev) => {
        // don't toggle when clicking the download button
        if (ev.target.closest(".btn-download")) return;
        open();
      });
    }
    if (toggle) {
      toggle.addEventListener("click", (ev) => {
        ev.stopPropagation();
        open();
      });
    }
  });

  /* ---- Search + filter ---- */
  const searchInput = document.querySelector("#rslSearch");
  const chips = document.querySelectorAll(".rsl-chip");
  const items = document.querySelectorAll("[data-searchable]");
  const countEl = document.querySelector("#rslCount");
  const emptyEl = document.querySelector("#rslEmpty");
  let activeFilter = "all";
  let query = "";

  function applyFilter() {
    let visible = 0;
    items.forEach((el) => {
      const type = el.getAttribute("data-type") || "";
      const text = (el.getAttribute("data-searchable") || "").toLowerCase();
      const matchType = activeFilter === "all" || type === activeFilter;
      const matchQuery = !query || text.includes(query);
      const show = matchType && matchQuery;
      el.style.display = show ? "" : "none";
      if (show) visible++;
    });
    if (countEl) countEl.textContent = visible + (visible === 1 ? " Eintrag" : " Eintraege");
    if (emptyEl) emptyEl.classList.toggle("show", visible === 0);

    // hide section headers if their whole section is empty
    document.querySelectorAll("[data-section]").forEach((sec) => {
      const any = sec.querySelectorAll('[data-searchable]:not([style*="display: none"])');
      let count = 0;
      sec.querySelectorAll("[data-searchable]").forEach((c) => {
        if (c.style.display !== "none") count++;
      });
      sec.style.display = count === 0 ? "none" : "";
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      query = e.target.value.trim().toLowerCase();
      applyFilter();
    });
  }
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      activeFilter = chip.getAttribute("data-filter") || "all";
      applyFilter();
    });
  });
  applyFilter();

  /* ---- Download toast ---- */
  const toast = document.querySelector("#rslToast");
  const toastText = document.querySelector("#rslToastText");
  let toastTimer = null;
  document.querySelectorAll("a[download]").forEach((link) => {
    link.addEventListener("click", () => {
      const name = link.getAttribute("data-name") || "Datei";
      if (toast && toastText) {
        toastText.textContent = "Download gestartet: " + name;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
      }
    });
  });

  /* ---- Back to top ---- */
  const toTop = document.querySelector("#toTop");
  if (toTop) {
    window.addEventListener("scroll", () => {
      toTop.classList.toggle("show", window.scrollY > 600);
    }, { passive: true });
    toTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
})();
