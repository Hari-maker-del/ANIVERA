/* ANIVERA loading/feedback primitives. Non-invasive: only binds explicit data attributes. */
(function () {
  "use strict";
  if (window.ANIVERA_LOADING) return;

  function createOverlay(label) {
    var overlay = document.createElement("div");
    overlay.className = "anivera-loading-overlay";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = '<div class="anivera-loading-brand"><span class="anivera-loader-ring" aria-hidden="true"></span><span class="anivera-loading-label"></span><span class="anivera-loading-progress" aria-hidden="true"></span></div>';
    overlay.querySelector(".anivera-loading-label").textContent = label || "Loading ANIVERA…";
    document.body.appendChild(overlay);
    return overlay;
  }

  function setButtonLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.aniveraOriginalText) button.dataset.aniveraOriginalText = button.textContent.trim();
      button.classList.add("anivera-button-loading");
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      if (label) button.dataset.aniveraLoadingText = label;
      if (button.dataset.aniveraLoadingText) button.textContent = button.dataset.aniveraLoadingText;
    } else {
      button.classList.remove("anivera-button-loading");
      button.removeAttribute("aria-busy");
      button.disabled = false;
      if (button.dataset.aniveraOriginalText) button.textContent = button.dataset.aniveraOriginalText;
      delete button.dataset.aniveraLoadingText;
    }
  }

  function setSaveStatus(element, state, message) {
    if (!element) return;
    element.className = "anivera-save-status";
    element.dataset.state = state || "idle";
    element.textContent = message || ({saving:"Saving…",saved:"Saved",error:"Couldn't save. Try again."}[state] || "");
    element.setAttribute("role", state === "error" ? "alert" : "status");
  }

  window.ANIVERA_LOADING = {
    show: function (label) { return createOverlay(label); },
    hide: function (overlay) { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); },
    button: setButtonLoading,
    saveStatus: setSaveStatus,
    skeleton: function (container, count) {
      if (!container) return;
      container.setAttribute("aria-busy", "true");
      container.innerHTML = "";
      for (var i = 0; i < (count || 3); i++) {
        var card = document.createElement("div");
        card.className = "anivera-skeleton anivera-skeleton-block";
        card.setAttribute("aria-hidden", "true");
        card.innerHTML = '<div style="padding:14px"><div class="anivera-skeleton anivera-skeleton-line" style="width:55%"></div><div class="anivera-skeleton anivera-skeleton-line" style="width:82%"></div><div class="anivera-skeleton anivera-skeleton-line" style="width:68%"></div></div>';
        container.appendChild(card);
      }
    },
    clearSkeleton: function (container) { if (container) container.removeAttribute("aria-busy"); }
  };

  // Add real feedback to explicitly marked async forms/buttons without changing their handlers.
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.matches("[data-anivera-loading-form]")) return;
    var button = form.querySelector('button[type="submit"],input[type="submit"]');
    if (button) setButtonLoading(button, true, button.dataset.loadingLabel || "Please wait…");
  });
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-anivera-loading-button]");
    if (button && !button.disabled) setButtonLoading(button, true, button.dataset.loadingLabel || "Loading…");
  });
})();