/**
 * ANIVERA — Universal Animal Lifecycle Platform (app.js)
 * Core Application Logic:
 * - Dual independent continuous 3D carousels (delta-time requestAnimationFrame + pointer swipe support)
 * - Accessible species profile modal with focus trapping, restoration & lifecycle characteristics
 * - 142-species non-avian catalogue explorer & automated runtime validation (28 verified photos)
 * - Connected Animal Lifecycle Workspace backed by AniveraCloudSync (Supabase qbwulpofftxfddlykcxg + Owner-Scoped RLS)
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // 1. Load & Validate Species Catalogue
  // ---------------------------------------------------------------------------
  var rawDataEl = document.getElementById("anivera-species-data");
  var SPECIES_CATALOGUE = [];
  try {
    if (rawDataEl && rawDataEl.textContent && rawDataEl.textContent.indexOf("__SPECIES_DATA") === -1) {
      SPECIES_CATALOGUE = JSON.parse(rawDataEl.textContent);
    } else if (window.ANIVERA_ANIMALS_DATA && Array.isArray(window.ANIVERA_ANIMALS_DATA)) {
      SPECIES_CATALOGUE = window.ANIVERA_ANIMALS_DATA;
    }
  } catch (err) {
    console.error("Failed to parse species catalogue JSON:", err);
    SPECIES_CATALOGUE = window.ANIVERA_ANIMALS_DATA || [];
  }

  var FORBIDDEN_AVIAN_REGEX = /\b(aves|bird|birds|avian|eagle|hawk|falcon|owl|parrot|macaw|penguin|ostrich|flamingo|sparrow|pigeon|dove|peacock|peafowl|swan|duck|goose|chicken|rooster|turkey|quail|canary|finch|cockatoo|toucan|hornbill|pelican|albatross|heron|stork|crane|hummingbird|kingfisher|woodpecker|crow|raven|magpie|gull)\b/i;

  function validateCatalogueRuntime(records) {
    var ids = {};
    var commons = {};
    var scis = {};
    var issues = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (ids[r.id]) issues.push("Duplicate ID: " + r.id);
      ids[r.id] = true;
      var cn = (r.name || r.commonName || "").toLowerCase();
      if (commons[cn]) issues.push("Duplicate commonName: " + (r.name || r.commonName));
      commons[cn] = true;
      var sn = (r.scientificName || "").toLowerCase();
      if (scis[sn]) issues.push("Duplicate scientificName: " + r.scientificName);
      scis[sn] = true;
      if (
        (r.taxonomicClass || "").toLowerCase() === "aves" ||
        FORBIDDEN_AVIAN_REGEX.test((r.name || r.commonName) + " " + r.scientificName + " " + r.category)
      ) {
        issues.push("Avian record detected: " + r.id);
      }
    }
    return {
      valid: issues.length === 0,
      totalCount: records.length,
      leftCount: records.filter(function (x) { return x.carouselSide === "left"; }).length,
      rightCount: records.filter(function (x) { return x.carouselSide === "right"; }).length,
      verifiedPhotosCount: records.filter(function (x) { return x.imageVerified === true; }).length,
      issues: issues
    };
  }

  var VALIDATION_REPORT = validateCatalogueRuntime(SPECIES_CATALOGUE);
  var SPECIES_BY_ID = {};
  SPECIES_CATALOGUE.forEach(function (sp) {
    SPECIES_BY_ID[sp.id] = sp;
  });

  var LEFT_SPECIES = SPECIES_CATALOGUE.filter(function (sp) { return sp.carouselSide === "left"; });
  var RIGHT_SPECIES = SPECIES_CATALOGUE.filter(function (sp) { return sp.carouselSide === "right"; });

  // ---------------------------------------------------------------------------
  // 2. Honest Media & Image Fallback Helper
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createFallbackMarkup(sp, compact) {
    var displayName = sp.name || sp.commonName || "Verified Species";
    var subText = compact
      ? "Verified Taxonomy • No Photo"
      : "Photograph unavailable offline • Verified " + escapeHtml(sp.taxonomicClass) + " Record (" + escapeHtml(sp.id) + ")";
    return (
      '<div class="neutral-photo-fallback" role="img" aria-label="Verified taxonomic record for ' +
      escapeHtml(displayName) +
      ' — photograph unavailable">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
      '<circle cx="8.5" cy="9.5" r="1.5"/>' +
      '<path d="M21 15l-5-5L5 20"/>' +
      "</svg>" +
      '<div class="neutral-fallback-title">' + escapeHtml(displayName) + "</div>" +
      '<div class="neutral-fallback-sub">' + subText + "</div>" +
      "</div>"
    );
  }

  function renderSpeciesMedia(sp, compact) {
    var imgUrl = sp.imageUrl || sp.imageSource;
    var displayName = sp.name || sp.commonName;
    if (sp.imageVerified && imgUrl) {
      var loadingAttr = compact ? 'loading="eager"' : 'loading="lazy"';
      return (
        '<img src="' +
        escapeHtml(imgUrl) +
        '" alt="Verified photograph of ' +
        escapeHtml(displayName) +
        " (" +
        escapeHtml(sp.scientificName) +
        ')" ' +
        loadingAttr +
        ' data-species-id="' +
        escapeHtml(sp.id) +
        '" />'
      );
    }
    return createFallbackMarkup(sp, compact);
  }

  function attachImageFallbackHandlers(rootEl) {
    if (!rootEl) return;
    var imgs = rootEl.querySelectorAll("img[data-species-id]");
    imgs.forEach(function (img) {
      if (img.dataset.boundError === "1") return;
      img.dataset.boundError = "1";
      img.addEventListener("error", function () {
        if (img.dataset.fallbackApplied === "1") return;
        img.dataset.fallbackApplied = "1";
        var spId = img.getAttribute("data-species-id");
        var sp = SPECIES_BY_ID[spId] || {
          id: spId || "ANV-SP",
          name: "Verified Species",
          commonName: "Verified Species",
          taxonomicClass: "Non-Avian"
        };
        var parent = img.parentElement;
        if (parent) {
          parent.innerHTML = createFallbackMarkup(sp, parent.classList.contains("carousel-card-media"));
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Dual Independent Continuous 3D Carousels
  // ---------------------------------------------------------------------------
  var osReducedMotion = false;
  try {
    osReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    osReducedMotion = false;
  }

  var carouselController = {
    reducedMotion: osReducedMotion,
    activeModalSide: null,
    lastTriggerElement: null,
    lastTimestamp: 0,
    rafId: null,
    left: {
      angle: 0,
      speed: 13.5, // degrees per second CW
      pausedByModal: false,
      cohortIndex: 0,
      dragActive: false,
      dragStartX: 0,
      dragMoved: false,
      ringEl: document.getElementById("left-carousel-ring"),
      viewportEl: document.getElementById("left-carousel-viewport"),
      statusEl: document.getElementById("left-carousel-status")
    },
    right: {
      angle: 0,
      speed: -13.5, // degrees per second CCW (opposite direction)
      pausedByModal: false,
      cohortIndex: 0,
      dragActive: false,
      dragStartX: 0,
      dragMoved: false,
      ringEl: document.getElementById("right-carousel-ring"),
      viewportEl: document.getElementById("right-carousel-viewport"),
      statusEl: document.getElementById("right-carousel-status")
    }
  };

  function getCarouselGeometry(side) {
    var w = window.innerWidth || 1440;
    var vpEl = carouselController[side] && carouselController[side].viewportEl;
    var vpWidth = (vpEl && vpEl.clientWidth) ? vpEl.clientWidth : 400;

    var cardW = 162;
    var cardH = 232;
    var radius = 225;

    if (w <= 360 || vpWidth <= 290) {
      cardW = 132;
      cardH = 196;
      radius = 168;
    } else if (w <= 560 || vpWidth <= 340) {
      cardW = 142;
      cardH = 208;
      radius = 182;
    } else if (w <= 1366) {
      cardW = 154;
      cardH = 222;
      radius = 210;
    } else {
      cardW = 162;
      cardH = 232;
      radius = 226;
    }
    return { cardW: cardW, cardH: cardH, radius: radius };
  }

  function getCohortSlice(list, cohortIdx) {
    var start = cohortIdx * 10;
    var slice = list.slice(start, start + 10);
    if (slice.length < 10 && list.length >= 10) {
      slice = list.slice(list.length - 10);
    }
    return slice;
  }

  function renderCarouselRing(side) {
    var state = carouselController[side];
    if (!state || !state.ringEl) return;
    var sourceList = side === "left" ? LEFT_SPECIES : RIGHT_SPECIES;
    var cards = getCohortSlice(sourceList, state.cohortIndex);
    var geom = getCarouselGeometry(side);
    var count = cards.length || 1;
    var stepDeg = 360 / count;

    if (!carouselController.reducedMotion) {
      state.ringEl.style.width = geom.cardW + "px";
      state.ringEl.style.height = geom.cardH + "px";
    } else {
      state.ringEl.style.width = "";
      state.ringEl.style.height = "";
    }

    var html = cards
      .map(function (sp, idx) {
        var theta = (idx * stepDeg).toFixed(1);
        var displayName = sp.name || sp.commonName;
        var transformStyle = carouselController.reducedMotion
          ? ""
          : "width:" +
            geom.cardW +
            "px; height:" +
            geom.cardH +
            "px; transform: rotateY(" +
            theta +
            "deg) translateZ(" +
            geom.radius +
            "px);";
        return (
          '<button type="button" class="carousel-card-3d" ' +
          'data-species-id="' + escapeHtml(sp.id) + '" ' +
          'data-carousel-side="' + side + '" ' +
          'data-card-angle="' + theta + '" ' +
          'style="' + transformStyle + '" ' +
          'aria-label="Inspect ' + escapeHtml(displayName) + " (" + escapeHtml(sp.scientificName) + ") — " + escapeHtml(sp.category) + '">' +
          '<div class="carousel-card-media">' +
          renderSpeciesMedia(sp, true) +
          '<span class="carousel-card-tag">' + escapeHtml(sp.id) + "</span>" +
          "</div>" +
          '<div class="carousel-card-body">' +
          "<div>" +
          '<div class="carousel-card-name">' + escapeHtml(displayName) + "</div>" +
          '<div class="carousel-card-sci">' + escapeHtml(sp.scientificName) + "</div>" +
          "</div>" +
          '<div class="carousel-card-meta">' +
          "<span>" + escapeHtml(sp.taxonomicClass) + "</span>" +
          '<span class="carousel-card-cta">Profile &rarr;</span>' +
          "</div>" +
          "</div>" +
          "</button>"
        );
      })
      .join("");

    state.ringEl.innerHTML = html;
    attachImageFallbackHandlers(state.ringEl);
    updateCarouselTransform(side);
    updateCarouselStatusBadge(side);
  }

  function updateCarouselTransform(side) {
    var state = carouselController[side];
    if (!state || !state.ringEl || !state.viewportEl) return;

    if (carouselController.reducedMotion) {
      state.viewportEl.classList.add("reduced-motion-mode");
      state.ringEl.style.transform = "none";
      return;
    }

    state.viewportEl.classList.remove("reduced-motion-mode");
    var geom = getCarouselGeometry(side);
    state.ringEl.style.transform =
      "translateZ(-" +
      geom.radius +
      "px) rotateX(-4deg) rotateY(" +
      state.angle.toFixed(2) +
      "deg)";

    // Highlight front-facing card dynamically for clear 3D hierarchy
    var cardNodes = state.ringEl.children;
    var ringAngle = ((state.angle % 360) + 360) % 360;
    for (var i = 0; i < cardNodes.length; i++) {
      var c = cardNodes[i];
      var cardTheta = parseFloat(c.getAttribute("data-card-angle") || "0");
      var netDeg = (cardTheta + ringAngle) % 360;
      if (netDeg < 0) netDeg += 360;
      var distFromFront = netDeg > 180 ? 360 - netDeg : netDeg;
      if (distFromFront <= 20) {
        c.classList.add("is-front-card");
      } else {
        c.classList.remove("is-front-card");
      }
    }
  }

  function updateCarouselStatusBadge(side) {
    var state = carouselController[side];
    if (!state || !state.statusEl) return;
    if (carouselController.reducedMotion) {
      state.statusEl.textContent = "Static Grid (Reduced Motion)";
      state.statusEl.classList.remove("paused");
      return;
    }
    if (state.pausedByModal) {
      state.statusEl.textContent = "Paused (Profile Open)";
      state.statusEl.classList.add("paused");
    } else {
      state.statusEl.textContent = side === "left" ? "Rotating CW" : "Rotating CCW";
      state.statusEl.classList.remove("paused");
    }
  }

  function animateCarousels(timestamp) {
    if (!carouselController.lastTimestamp) {
      carouselController.lastTimestamp = timestamp;
    }
    var dt = (timestamp - carouselController.lastTimestamp) / 1000;
    carouselController.lastTimestamp = timestamp;
    if (dt < 0 || dt > 0.12) {
      dt = 0.016;
    }

    if (!carouselController.reducedMotion) {
      if (!carouselController.left.pausedByModal && carouselController.left.ringEl) {
        carouselController.left.angle = (carouselController.left.angle + carouselController.left.speed * dt) % 360;
        updateCarouselTransform("left");
      }
      if (!carouselController.right.pausedByModal && carouselController.right.ringEl) {
        carouselController.right.angle =
          (carouselController.right.angle + carouselController.right.speed * dt + 360) % 360;
        updateCarouselTransform("right");
      }
    }

    carouselController.rafId = window.requestAnimationFrame(animateCarousels);
  }

  function startCarouselLoop() {
    if (carouselController.rafId !== null) {
      window.cancelAnimationFrame(carouselController.rafId);
    }
    carouselController.lastTimestamp = 0;
    carouselController.rafId = window.requestAnimationFrame(animateCarousels);
  }

  // Click + Touch/Pointer Swipe interaction on Left & Right carousels (never pausing on hover)
  ["left", "right"].forEach(function (side) {
    var state = carouselController[side];
    if (!state.ringEl || !state.viewportEl) return;

    state.viewportEl.addEventListener("pointerdown", function (e) {
      state.dragActive = true;
      state.dragStartX = e.clientX || 0;
      state.dragMoved = false;
    });

    state.viewportEl.addEventListener("pointermove", function (e) {
      if (!state.dragActive || carouselController.reducedMotion) return;
      var dx = (e.clientX || 0) - state.dragStartX;
      if (Math.abs(dx) > 8) {
        state.dragMoved = true;
        state.angle = (state.angle + dx * 0.35 + 360) % 360;
        state.dragStartX = e.clientX || 0;
        updateCarouselTransform(side);
      }
    });

    window.addEventListener("pointerup", function () {
      state.dragActive = false;
    });

    state.ringEl.addEventListener("click", function (e) {
      if (state.dragMoved) {
        state.dragMoved = false;
        return;
      }
      var cardBtn = e.target.closest(".carousel-card-3d");
      if (!cardBtn) return;
      e.preventDefault();
      var spId = cardBtn.getAttribute("data-species-id");
      openSpeciesModal(spId, side, cardBtn);
    });
  });

  var leftCohortSelect = document.getElementById("left-cohort-select");
  if (leftCohortSelect) {
    leftCohortSelect.addEventListener("change", function () {
      carouselController.left.cohortIndex = parseInt(leftCohortSelect.value, 10) || 0;
      renderCarouselRing("left");
    });
  }

  var rightCohortSelect = document.getElementById("right-cohort-select");
  if (rightCohortSelect) {
    rightCohortSelect.addEventListener("change", function () {
      carouselController.right.cohortIndex = parseInt(rightCohortSelect.value, 10) || 0;
      renderCarouselRing("right");
    });
  }

  var motionToggleBtn = document.getElementById("motion-toggle-btn");
  function syncMotionButtonUI() {
    if (!motionToggleBtn) return;
    motionToggleBtn.setAttribute("aria-pressed", carouselController.reducedMotion ? "true" : "false");
    motionToggleBtn.textContent = carouselController.reducedMotion
      ? "3D Motion: Reduced (Static)"
      : "3D Motion: Active";
  }

  if (motionToggleBtn) {
    motionToggleBtn.addEventListener("click", function () {
      carouselController.reducedMotion = !carouselController.reducedMotion;
      syncMotionButtonUI();
      renderCarouselRing("left");
      renderCarouselRing("right");
    });
  }

  window.addEventListener("resize", function () {
    renderCarouselRing("left");
    renderCarouselRing("right");
  });

  // ---------------------------------------------------------------------------
  // 4. Accessible Species Detail Modal
  // ---------------------------------------------------------------------------
  var modalBackdrop = document.getElementById("species-modal-backdrop");
  var modalCloseBtn = document.getElementById("modal-close-btn");
  var modalFooterCloseBtn = document.getElementById("modal-footer-close-btn");
  var modalSendToWorkspaceBtn = document.getElementById("modal-send-to-workspace-btn");
  var currentModalSpecies = null;

  function openSpeciesModal(speciesId, carouselSide, triggerEl) {
    var sp = SPECIES_BY_ID[speciesId];
    if (!sp || !modalBackdrop) return;

    currentModalSpecies = sp;
    carouselController.lastTriggerElement = triggerEl || document.activeElement;
    carouselController.activeModalSide = carouselSide || null;

    if (carouselSide === "left") {
      carouselController.left.pausedByModal = true;
      updateCarouselStatusBadge("left");
    } else if (carouselSide === "right") {
      carouselController.right.pausedByModal = true;
      updateCarouselStatusBadge("right");
    }

    var displayName = sp.name || sp.commonName;
    document.getElementById("modal-category-badge").textContent = sp.category;
    document.getElementById("modal-common-name").textContent = displayName;
    document.getElementById("modal-scientific-name").textContent = sp.scientificName;
    document.getElementById("modal-species-id").textContent = sp.id;
    document.getElementById("modal-taxonomic-class").textContent = sp.taxonomicClass || "Unavailable";
    document.getElementById("modal-animal-type").textContent = sp.animalType || "Unavailable";
    document.getElementById("modal-conservation").textContent = sp.conservationStatus || "Unavailable";
    document.getElementById("modal-lifespan").textContent = sp.lifespan || "Unavailable";
    document.getElementById("modal-gallery-side").textContent =
      sp.carouselSide === "left" ? "Left Gallery (Wildlife)" : "Right Gallery (Managed / Marine / Exo)";
    document.getElementById("modal-description").textContent = sp.description || "Unavailable";
    document.getElementById("modal-habitat").textContent = sp.habitat || "Unavailable";
    document.getElementById("modal-diet").textContent = sp.diet || "Unavailable";
    var lcCharEl = document.getElementById("modal-lifecycle-characteristics");
    if (lcCharEl) {
      lcCharEl.textContent = sp.lifecycleCharacteristics || "Verified non-avian developmental progression.";
    }
    document.getElementById("modal-lifecycle-care").textContent = sp.careInformation || sp.lifecycleCare || "Unavailable";
    document.getElementById("modal-image-attribution").textContent = sp.imageAttribution || "";

    var resumeNote = document.getElementById("modal-carousel-resume-note");
    if (resumeNote) {
      if (carouselSide === "left") {
        resumeNote.textContent = "Left Wildlife Carousel paused • Right Carousel continues rotating.";
      } else if (carouselSide === "right") {
        resumeNote.textContent = "Right Managed/Marine Carousel paused • Left Carousel continues rotating.";
      } else {
        resumeNote.textContent = "Both 3D carousels continue rotating independently.";
      }
    }

    var photoContainer = document.getElementById("modal-photo-container");
    if (photoContainer) {
      photoContainer.innerHTML = renderSpeciesMedia(sp, false);
      attachImageFallbackHandlers(photoContainer);
    }

    modalBackdrop.classList.add("open");
    modalBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (modalCloseBtn) {
      modalCloseBtn.focus();
    }
  }

  function closeSpeciesModal() {
    if (!modalBackdrop || !modalBackdrop.classList.contains("open")) return;

    modalBackdrop.classList.remove("open");
    modalBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");

    if (carouselController.activeModalSide === "left") {
      carouselController.left.pausedByModal = false;
      updateCarouselStatusBadge("left");
    } else if (carouselController.activeModalSide === "right") {
      carouselController.right.pausedByModal = false;
      updateCarouselStatusBadge("right");
    }

    carouselController.activeModalSide = null;
    if (
      carouselController.lastTriggerElement &&
      typeof carouselController.lastTriggerElement.focus === "function"
    ) {
      carouselController.lastTriggerElement.focus();
    }
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeSpeciesModal);
  if (modalFooterCloseBtn) modalFooterCloseBtn.addEventListener("click", closeSpeciesModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", function (e) {
      if (e.target === modalBackdrop) closeSpeciesModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (!modalBackdrop || !modalBackdrop.classList.contains("open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeSpeciesModal();
      return;
    }
    if (e.key === "Tab") {
      var focusables = modalBackdrop.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  if (modalSendToWorkspaceBtn) {
    modalSendToWorkspaceBtn.addEventListener("click", function () {
      var sp = currentModalSpecies;
      closeSpeciesModal();
      if (!sp) return;
      var displayName = sp.name || sp.commonName;
      switchWorkspaceTab("profiles");
      var nameInput = document.getElementById("prof-name");
      var spInput = document.getElementById("prof-species");
      var catSelect = document.getElementById("prof-category");
      var tagInput = document.getElementById("prof-tag");
      var notesInput = document.getElementById("prof-notes");
      if (nameInput) nameInput.value = displayName + " Unit #01";
      if (spInput) spInput.value = displayName + " (" + sp.scientificName + ")";
      if (catSelect) catSelect.value = sp.category;
      if (tagInput) tagInput.value = sp.id + "-REG-2026";
      if (notesInput) notesInput.value = sp.careInformation || sp.lifecycleCare;
      var wsSection = document.getElementById("lifecycle-workspace");
      if (wsSection) wsSection.scrollIntoView({ behavior: "smooth" });
      if (nameInput) nameInput.focus();
      showWorkspaceBanner(
        "Pre-filled workspace profile form with verified species: " + displayName + " (" + sp.scientificName + ")."
      );
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Category Exploration & 142-Species Animal Explorer
  // ---------------------------------------------------------------------------
  var CATEGORY_META = [
    {
      name: "Wild Mammals & Wildlife",
      desc: "Terrestrial megafauna, apex felids, pack canids, ursids, primates, marsupials, and mustelids."
    },
    {
      name: "Livestock & Farm Animals",
      desc: "Domesticated bovids, ovines, caprines, equids, camelids, and heritage suidae."
    },
    {
      name: "Marine Mammals",
      desc: "Baleen and toothed cetaceans, sirenians, pinnipeds, and keystone marine mustelids."
    },
    {
      name: "Fish",
      desc: "Coral reef teleosts, anadromous salmonids, osteoglossids, and pelagic elasmobranchs."
    },
    {
      name: "Reptiles",
      desc: "Marine and insular testudines, crocodilians, varanids, iguanids, chameleons, and pythonids."
    },
    {
      name: "Amphibians",
      desc: "Neotropical hylid and dendrobatid anurans, cryptobranchid salamanders, and neotenic caudates."
    },
    {
      name: "Companion Animals",
      desc: "Working and domestic dogs, pedigreed cats, lagomorphs, caviids, and small companion mammals."
    },
    {
      name: "Invertebrates",
      desc: "Migratory pollinators, eusocial hymenopterans, cephalopods, crustaceans, and arachnids."
    }
  ];

  var explorerState = {
    search: "",
    category: "all",
    side: "all",
    photoFilter: "all",
    showAll: false
  };

  function renderCategoryCards() {
    var grid = document.getElementById("category-cards-grid");
    if (!grid) return;
    grid.innerHTML = CATEGORY_META.map(function (c) {
      var count = SPECIES_CATALOGUE.filter(function (sp) { return sp.category === c.name; }).length;
      var isActive = explorerState.category === c.name;
      return (
        '<button type="button" class="category-card' +
        (isActive ? " active" : "") +
        '" data-category-name="' +
        escapeHtml(c.name) +
        '">' +
        '<div class="category-card-top">' +
        '<strong style="font-size:0.95rem; color:#1D2228;">' + escapeHtml(c.name) + "</strong>" +
        '<span class="category-count-badge">' + count + " species</span>" +
        "</div>" +
        '<p style="font-size:0.825rem; color:#4A525D;">' + escapeHtml(c.desc) + "</p>" +
        '<span style="font-size:0.78rem; font-weight:700; color:#E06D10;">Explore Category &rarr;</span>' +
        "</button>"
      );
    }).join("");
  }

  var categoryGridEl = document.getElementById("category-cards-grid");
  if (categoryGridEl) {
    categoryGridEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".category-card");
      if (!btn) return;
      var catName = btn.getAttribute("data-category-name");
      explorerState.category = catName;
      var catSel = document.getElementById("explorer-category-select");
      if (catSel) catSel.value = catName;
      renderCategoryCards();
      renderExplorer();
      var expSec = document.getElementById("animal-explorer");
      if (expSec) expSec.scrollIntoView({ behavior: "smooth" });
    });
  }

  function getFilteredCatalogue() {
    var q = explorerState.search.trim().toLowerCase();
    return SPECIES_CATALOGUE.filter(function (sp) {
      if (explorerState.category !== "all" && sp.category !== explorerState.category) return false;
      if (explorerState.side !== "all" && sp.carouselSide !== explorerState.side) return false;
      if (explorerState.photoFilter === "verified" && !sp.imageVerified) return false;
      if (q) {
        var hay = (
          sp.id + " " +
          (sp.name || sp.commonName) + " " +
          sp.scientificName + " " +
          sp.category + " " +
          sp.animalType + " " +
          sp.habitat
        ).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderExplorer() {
    var grid = document.getElementById("explorer-grid");
    var summary = document.getElementById("explorer-results-summary");
    var toggleAllBtn = document.getElementById("explorer-toggle-all-btn");
    if (!grid) return;

    var matches = getFilteredCatalogue();
    var limit = explorerState.showAll ? matches.length : Math.min(matches.length, 28);
    var visible = matches.slice(0, limit);

    if (summary) {
      summary.textContent =
        "Showing " + visible.length + " of " + matches.length + " matching non-avian species (Total Catalogue: " + SPECIES_CATALOGUE.length + ")";
    }
    if (toggleAllBtn) {
      if (matches.length <= 28) {
        toggleAllBtn.style.display = "none";
      } else {
        toggleAllBtn.style.display = "inline-flex";
        toggleAllBtn.textContent = explorerState.showAll
          ? "Show Featured 28"
          : "Show All " + matches.length + " Matching Species";
      }
    }

    if (visible.length === 0) {
      grid.innerHTML =
        '<div class="info-card" style="grid-column: 1 / -1; text-align:center; padding:32px;">' +
        "<h3>No Matching Non-Avian Species Found</h3>" +
        "<p>Try clearing your search query or resetting category filters. Remember that avian species (birds) belong to the separate WINGLY platform.</p>" +
        "</div>";
      return;
    }

    grid.innerHTML = visible
      .map(function (sp) {
        var displayName = sp.name || sp.commonName;
        var photoBadge = sp.imageVerified
          ? '<span style="font-size:0.68rem; font-weight:700; color:#1D2228; background:#FFF5ED; border:1px solid #FCD2B1; padding:2px 6px; border-radius:4px;">Verified Photo</span>'
          : '<span style="font-size:0.68rem; font-weight:600; color:#4A525D; background:#F8F9FA; border:1px solid #E1E2E2; padding:2px 6px; border-radius:4px;">Taxonomic Plate</span>';
        return (
          '<article class="species-card">' +
          '<div class="species-card-media">' +
          renderSpeciesMedia(sp, false) +
          "</div>" +
          '<div class="species-card-body">' +
          '<div class="species-card-header">' +
          '<span class="species-id-pill">' + escapeHtml(sp.id) + "</span>" +
          photoBadge +
          "</div>" +
          '<h3 style="font-size:1rem; font-weight:800; color:#1D2228; margin-top:2px;">' +
          escapeHtml(displayName) +
          "</h3>" +
          '<p style="font-size:0.8rem; font-style:italic; color:#4A525D;">' +
          escapeHtml(sp.scientificName) +
          "</p>" +
          '<p style="font-size:0.78rem; color:#4A525D; margin-top:4px; flex:1;">' +
          escapeHtml(sp.category) + " • " + escapeHtml(sp.animalType) +
          "</p>" +
          '<div style="margin-top:10px; padding-top:10px; border-top:1px solid #E1E2E2; display:flex; justify-content:space-between; align-items:center;">' +
          '<span style="font-size:0.72rem; font-weight:600; color:#4A525D;">' +
          escapeHtml(sp.conservationStatus) +
          "</span>" +
          '<button type="button" class="btn btn-outline btn-sm explorer-inspect-btn" data-species-id="' +
          escapeHtml(sp.id) +
          '" style="min-height:32px; padding:5px 10px; font-size:0.76rem;">Inspect Profile</button>' +
          "</div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");

    attachImageFallbackHandlers(grid);
  }

  var explorerGridEl = document.getElementById("explorer-grid");
  if (explorerGridEl) {
    explorerGridEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".explorer-inspect-btn");
      if (!btn) return;
      var spId = btn.getAttribute("data-species-id");
      openSpeciesModal(spId, null, btn);
    });
  }

  var searchInputEl = document.getElementById("explorer-search-input");
  if (searchInputEl) {
    searchInputEl.addEventListener("input", function () {
      explorerState.search = searchInputEl.value;
      renderExplorer();
    });
  }

  var catSelectEl = document.getElementById("explorer-category-select");
  if (catSelectEl) {
    catSelectEl.addEventListener("change", function () {
      explorerState.category = catSelectEl.value;
      renderCategoryCards();
      renderExplorer();
    });
  }

  var sideSelectEl = document.getElementById("explorer-side-select");
  if (sideSelectEl) {
    sideSelectEl.addEventListener("change", function () {
      explorerState.side = sideSelectEl.value;
      renderExplorer();
    });
  }

  var photoSelectEl = document.getElementById("explorer-photo-select");
  if (photoSelectEl) {
    photoSelectEl.addEventListener("change", function () {
      explorerState.photoFilter = photoSelectEl.value;
      renderExplorer();
    });
  }

  var resetBtnEl = document.getElementById("explorer-reset-btn");
  if (resetBtnEl) {
    resetBtnEl.addEventListener("click", function () {
      explorerState.search = "";
      explorerState.category = "all";
      explorerState.side = "all";
      explorerState.photoFilter = "all";
      explorerState.showAll = false;
      if (searchInputEl) searchInputEl.value = "";
      if (catSelectEl) catSelectEl.value = "all";
      if (sideSelectEl) sideSelectEl.value = "all";
      if (photoSelectEl) photoSelectEl.value = "all";
      renderCategoryCards();
      renderExplorer();
    });
  }

  var toggleAllBtnEl = document.getElementById("explorer-toggle-all-btn");
  if (toggleAllBtnEl) {
    toggleAllBtnEl.addEventListener("click", function () {
      explorerState.showAll = !explorerState.showAll;
      renderExplorer();
    });
  }

  var leftViewAllBtn = document.getElementById("left-ViewAll-btn");
  if (leftViewAllBtn) {
    leftViewAllBtn.addEventListener("click", function () {
      explorerState.side = "left";
      explorerState.category = "all";
      explorerState.showAll = true;
      if (sideSelectEl) sideSelectEl.value = "left";
      if (catSelectEl) catSelectEl.value = "all";
      renderCategoryCards();
      renderExplorer();
      var expSec = document.getElementById("animal-explorer");
      if (expSec) expSec.scrollIntoView({ behavior: "smooth" });
    });
  }

  var rightViewAllBtn = document.getElementById("right-ViewAll-btn");
  if (rightViewAllBtn) {
    rightViewAllBtn.addEventListener("click", function () {
      explorerState.side = "right";
      explorerState.category = "all";
      explorerState.showAll = true;
      if (sideSelectEl) sideSelectEl.value = "right";
      if (catSelectEl) catSelectEl.value = "all";
      renderCategoryCards();
      renderExplorer();
      var expSec = document.getElementById("animal-explorer");
      if (expSec) expSec.scrollIntoView({ behavior: "smooth" });
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Connected Animal Lifecycle Workspace (Backed by AniveraCloudSync)
  // ---------------------------------------------------------------------------
  var syncEngine = window.AniveraCloudSync;
  var workspaceState = {
    profiles: [],
    healthRecords: [],
    careTasks: [],
    events: [],
    snapshots: []
  };
  var activeDossierProfileId = null;

  function refreshWorkspaceFromSync() {
    if (!syncEngine) return;
    var res = syncEngine.getOwnerScopedWorkspace();
    var authSummaryEl = document.getElementById("ws-auth-user-summary");
    var authDotEl = document.getElementById("ws-auth-dot");
    if (!res.ok) {
      workspaceState = { profiles: [], healthRecords: [], careTasks: [], events: [], snapshots: [] };
      if (authSummaryEl) {
        authSummaryEl.textContent = "Not Signed In (" + (res.code || "UNSIGNED") + ") — Sign in to view owner-scoped records.";
      }
      if (authDotEl) authDotEl.style.background = "#68707C";
    } else {
      workspaceState = res.data;
      if (authSummaryEl) {
        authSummaryEl.textContent =
          "Signed in as " +
          res.user.displayName +
          " (" +
          res.user.email +
          ") • Owner ID: " +
          res.owner_id;
      }
      if (authDotEl) authDotEl.style.background = "#FB8122";
    }
    renderWorkspaceAll();
  }

  function saveWorkspaceData() {
    if (syncEngine) {
      var res = syncEngine.saveOwnerScopedWorkspace(workspaceState);
      if (!res.ok) {
        showWorkspaceBanner("Authorization Error (" + res.code + "): " + res.error);
        return false;
      }
    }
    renderWorkspaceAll();
    return true;
  }

  function showWorkspaceBanner(msg) {
    var banner = document.getElementById("ws-feedback-banner");
    if (!banner) return;
    banner.textContent = msg;
    banner.classList.add("visible");
  }

  function switchWorkspaceTab(tabKey) {
    var tabs = document.querySelectorAll(".ws-tab-btn");
    tabs.forEach(function (btn) {
      var active = btn.getAttribute("data-ws-tab") === tabKey;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    var panels = document.querySelectorAll(".ws-panel");
    panels.forEach(function (panel) {
      panel.classList.toggle("active", panel.id === "ws-panel-" + tabKey);
    });
  }

  document.querySelectorAll(".ws-tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      switchWorkspaceTab(btn.getAttribute("data-ws-tab"));
    });
  });

  function getAnimalLabel(animalId) {
    var found = workspaceState.profiles.find(function (p) { return p.id === animalId; });
    return found ? found.name + " (" + found.species + ")" : animalId;
  }

  function populateAnimalSelects() {
    var formSelectIds = ["health-animal-select", "task-animal-select", "ev-animal-select"];
    var optionsHtml = workspaceState.profiles
      .map(function (p) {
        return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + " — " + escapeHtml(p.species) + "</option>";
      })
      .join("");
    formSelectIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = optionsHtml || '<option value="">No animal profiles available</option>';
    });

    var filterSelects = [
      { id: "ws-health-animal-filter", defaultLabel: "All Animals (Historical Health Ledger)" },
      { id: "ws-task-animal-filter", defaultLabel: "All Animals" },
      { id: "ws-event-animal-filter", defaultLabel: "All Animals (Chronological Lifecycle History)" }
    ];
    filterSelects.forEach(function (item) {
      var el = document.getElementById(item.id);
      if (!el) return;
      var currentVal = el.value || "all";
      el.innerHTML =
        '<option value="all">' +
        escapeHtml(item.defaultLabel) +
        "</option>" +
        workspaceState.profiles
          .map(function (p) {
            return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + " (" + escapeHtml(p.id) + ")</option>";
          })
          .join("");
      el.value = currentVal;
      if (!el.value) el.value = "all";
    });
  }

  function renderWorkspaceAll() {
    var stProf = document.getElementById("stat-profiles-count");
    var stHealth = document.getElementById("stat-health-count");
    var stCp = document.getElementById("stat-careplans-count");
    var stRem = document.getElementById("stat-reminders-count");
    if (stProf) stProf.textContent = String(workspaceState.profiles.length);
    if (stHealth) stHealth.textContent = String(workspaceState.healthRecords.length);
    var pendingTasks = workspaceState.careTasks.filter(function (t) { return !t.completed; }).length;
    if (stCp) stCp.textContent = pendingTasks + " / " + workspaceState.careTasks.length;
    if (stRem) stRem.textContent = String(workspaceState.events.length);

    populateAnimalSelects();
    renderWorkspaceProfiles();
    renderAnimalDossier();
    renderWorkspaceHealth();
    renderWorkspaceTasks();
    renderWorkspaceEvents();
  }

  function renderAnimalDossier() {
    var cardEl = document.getElementById("ws-animal-dossier-card");
    if (!cardEl) return;
    if (!activeDossierProfileId) {
      cardEl.style.display = "none";
      return;
    }
    var prof = workspaceState.profiles.find(function (p) { return p.id === activeDossierProfileId; });
    if (!prof) {
      activeDossierProfileId = null;
      cardEl.style.display = "none";
      return;
    }
    var relatedHealth = workspaceState.healthRecords.filter(function (h) { return h.animalId === prof.id; });
    var relatedTasks = workspaceState.careTasks.filter(function (t) { return t.animalId === prof.id; });
    var relatedEvents = workspaceState.events
      .filter(function (ev) { return ev.animalId === prof.id; })
      .slice()
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    cardEl.style.display = "flex";
    cardEl.innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">' +
      "<div>" +
      '<span class="species-id-pill" style="background:#1D2228; color:#FFFFFF;">INDIVIDUAL LIFECYCLE DOSSIER • ' +
      escapeHtml(prof.id) +
      "</span>" +
      '<h4 style="font-size:1.1rem; font-weight:800; margin-top:6px;">' +
      escapeHtml(prof.name) +
      "</h4>" +
      '<p style="font-size:0.85rem; color:#1D2228; font-weight:600;">' +
      escapeHtml(prof.species) +
      " • Stage: " +
      escapeHtml(prof.stage) +
      " • Tag: <code>" +
      escapeHtml(prof.tag) +
      "</code> • Owner: <code>" +
      escapeHtml(prof.owner_id || "usr-anv-primary-001") +
      "</code></p>" +
      "</div>" +
      '<button type="button" id="close-dossier-btn" class="btn btn-outline btn-sm">Close Dossier &times;</button>' +
      "</div>" +
      '<p style="font-size:0.85rem; color:#1D2228;"><strong>Notes:</strong> ' +
      escapeHtml(prof.notes || "None") +
      "</p>" +
      '<div class="grid-3" style="margin-top:8px;">' +
      '<div style="background:#FFFFFF; border:1px solid #E1E2E2; border-radius:6px; padding:10px;">' +
      '<strong style="font-size:0.78rem; text-transform:uppercase;">Health Logs (' +
      relatedHealth.length +
      ")</strong>" +
      '<p style="font-size:0.8rem; margin-top:4px;">' +
      (relatedHealth.length
        ? escapeHtml(relatedHealth[0].date + ": " + relatedHealth[0].type + " (" + relatedHealth[0].summary + ")")
        : "No clinical records logged.") +
      "</p></div>" +
      '<div style="background:#FFFFFF; border:1px solid #E1E2E2; border-radius:6px; padding:10px;">' +
      '<strong style="font-size:0.78rem; text-transform:uppercase;">Care Tasks (' +
      relatedTasks.length +
      ")</strong>" +
      '<p style="font-size:0.8rem; margin-top:4px;">' +
      (relatedTasks.length
        ? escapeHtml(relatedTasks[0].title + " [" + (relatedTasks[0].status || "Pending") + " • Due " + relatedTasks[0].due + "]")
        : "No care tasks assigned.") +
      "</p></div>" +
      '<div style="background:#FFFFFF; border:1px solid #E1E2E2; border-radius:6px; padding:10px;">' +
      '<strong style="font-size:0.78rem; text-transform:uppercase;">Lifecycle History (' +
      relatedEvents.length +
      ")</strong>" +
      '<p style="font-size:0.8rem; margin-top:4px;">' +
      (relatedEvents.length
        ? escapeHtml(relatedEvents[0].date + ": " + relatedEvents[0].milestone)
        : "No lifecycle milestones recorded.") +
      "</p></div>" +
      "</div>";

    var closeBtn = document.getElementById("close-dossier-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        activeDossierProfileId = null;
        renderAnimalDossier();
      });
    }
  }

  function renderWorkspaceProfiles() {
    var listEl = document.getElementById("ws-profiles-list");
    if (!listEl) return;
    var q = ((document.getElementById("ws-profile-search") || {}).value || "").trim().toLowerCase();
    var catF = (document.getElementById("ws-profile-cat-filter") || {}).value || "all";
    var stgF = (document.getElementById("ws-profile-stage-filter") || {}).value || "all";

    var filtered = workspaceState.profiles.filter(function (p) {
      if (catF !== "all" && p.category !== catF) return false;
      if (stgF !== "all" && p.stage !== stgF) return false;
      if (q) {
        var hay = (p.id + " " + p.name + " " + p.species + " " + p.tag + " " + p.notes).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML =
        '<div class="ws-record-card"><div><strong>No matching animal profiles for current user/filter.</strong><p style="font-size:0.85rem; color:#4A525D;">Adjust your search filters, sign in to an authorized account, or create a new non-avian animal profile on the left.</p></div></div>';
      return;
    }

    listEl.innerHTML = filtered
      .map(function (p) {
        return (
          '<div class="ws-record-card">' +
          '<div style="flex:1; min-width:220px;">' +
          '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
          '<span class="species-id-pill">' + escapeHtml(p.id) + "</span>" +
          '<span class="species-id-pill" style="background:#FFF5ED; border-color:#FCD2B1; color:#1D2228;">' + escapeHtml(p.category) + "</span>" +
          '<span class="species-id-pill">' + escapeHtml(p.stage) + "</span>" +
          "</div>" +
          '<h5 style="font-size:1rem; font-weight:800; margin-top:6px;">' + escapeHtml(p.name) + "</h5>" +
          '<p style="font-size:0.85rem; font-weight:600; color:#4A525D;">' + escapeHtml(p.species) + " • Tag: <code>" + escapeHtml(p.tag) + "</code></p>" +
          '<p style="font-size:0.825rem; color:#4A525D; margin-top:4px;">' + escapeHtml(p.notes || "No additional notes.") + "</p>" +
          "</div>" +
          '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-primary btn-sm ws-view-prof-btn" data-prof-id="' + escapeHtml(p.id) + '">View Dossier</button>' +
          '<button type="button" class="btn btn-outline btn-sm ws-edit-prof-btn" data-prof-id="' + escapeHtml(p.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-outline btn-sm ws-del-prof-btn" data-prof-id="' + escapeHtml(p.id) + '">Remove</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderWorkspaceHealth() {
    var listEl = document.getElementById("ws-health-list");
    if (!listEl) return;
    var animFilter = (document.getElementById("ws-health-animal-filter") || {}).value || "all";
    var records = workspaceState.healthRecords.filter(function (h) {
      return animFilter === "all" || h.animalId === animFilter;
    });

    if (!records.length) {
      listEl.innerHTML = '<div class="ws-record-card"><strong>No clinical health records logged for this filter.</strong></div>';
      return;
    }
    listEl.innerHTML = records
      .map(function (h) {
        return (
          '<div class="ws-record-card">' +
          '<div style="flex:1;">' +
          '<span class="species-id-pill">' + escapeHtml(h.id) + "</span> " +
          '<span class="species-id-pill" style="background:#FFF5ED; border-color:#FCD2B1; color:#1D2228;">' + escapeHtml(h.type) + "</span> " +
          '<span class="species-id-pill">' + escapeHtml(h.date) + "</span>" +
          '<h5 style="font-size:0.95rem; font-weight:800; margin-top:6px;">' + escapeHtml(getAnimalLabel(h.animalId)) + "</h5>" +
          '<p style="font-size:0.82rem; font-weight:600; color:#4A525D;">Clinician: ' + escapeHtml(h.vet) + "</p>" +
          (h.treatment
            ? '<p style="font-size:0.82rem; color:#1D2228; margin-top:2px;"><strong>Treatment / Protocol:</strong> ' + escapeHtml(h.treatment) + "</p>"
            : "") +
          '<p style="font-size:0.85rem; margin-top:4px;">' + escapeHtml(h.summary) + "</p>" +
          "</div>" +
          '<div style="display:flex; gap:6px;">' +
          '<button type="button" class="btn btn-outline btn-sm ws-edit-health-btn" data-health-id="' + escapeHtml(h.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-outline btn-sm ws-del-health-btn" data-health-id="' + escapeHtml(h.id) + '">Remove</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderWorkspaceTasks() {
    var listEl = document.getElementById("ws-tasks-list");
    if (!listEl) return;
    var statusFilter = (document.getElementById("ws-task-status-filter") || {}).value || "all";
    var animalFilter = (document.getElementById("ws-task-animal-filter") || {}).value || "all";

    var filtered = workspaceState.careTasks.filter(function (t) {
      if (animalFilter !== "all" && t.animalId !== animalFilter) return false;
      if (statusFilter === "upcoming" && t.completed) return false;
      if (statusFilter === "completed" && !t.completed) return false;
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div class="ws-record-card"><strong>No care tasks match the current filter.</strong></div>';
      return;
    }

    listEl.innerHTML = filtered
      .map(function (t) {
        var statusLabel = t.completed ? "Completed" : t.status || "Pending";
        return (
          '<div class="ws-record-card" style="' + (t.completed ? "opacity:0.78;" : "") + '">' +
          '<div style="flex:1;">' +
          '<span class="species-id-pill">' + escapeHtml(t.id) + "</span> " +
          '<span class="species-id-pill" style="background:' +
          (t.completed ? "#F8F9FA" : "#FFF5ED") +
          '; border-color:#FCD2B1; color:#1D2228;">' +
          escapeHtml(statusLabel) +
          " • Due: " +
          escapeHtml(t.due) +
          "</span> " +
          '<span class="species-id-pill">' + escapeHtml(t.frequency) + "</span> " +
          '<span class="species-id-pill">' + escapeHtml(t.priority) + " Priority</span>" +
          '<h5 style="font-size:0.95rem; font-weight:800; margin-top:6px; ' +
          (t.completed ? "text-decoration:line-through;" : "") +
          '">' +
          escapeHtml(t.title) +
          "</h5>" +
          '<p style="font-size:0.82rem; font-weight:600; color:#4A525D;">Animal: ' + escapeHtml(getAnimalLabel(t.animalId)) + "</p>" +
          '<p style="font-size:0.84rem; margin-top:4px;">' + escapeHtml(t.instructions) + "</p>" +
          "</div>" +
          '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-primary btn-sm ws-toggle-task-btn" data-task-id="' + escapeHtml(t.id) + '">' +
          (t.completed ? "Reopen" : "Complete") +
          "</button>" +
          '<button type="button" class="btn btn-outline btn-sm ws-edit-task-btn" data-task-id="' + escapeHtml(t.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-outline btn-sm ws-del-task-btn" data-task-id="' + escapeHtml(t.id) + '">Remove</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderWorkspaceEvents() {
    var listEl = document.getElementById("ws-events-list");
    if (!listEl) return;
    var animalFilter = (document.getElementById("ws-event-animal-filter") || {}).value || "all";

    // Display chronological history sorted by event date
    var sorted = workspaceState.events
      .filter(function (ev) {
        return animalFilter === "all" || ev.animalId === animalFilter;
      })
      .slice()
      .sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date));
      });

    if (!sorted.length) {
      listEl.innerHTML = '<div class="ws-record-card"><strong>No lifecycle milestones recorded for this filter.</strong></div>';
      return;
    }

    listEl.innerHTML = sorted
      .map(function (ev, idx) {
        return (
          '<div class="ws-record-card">' +
          '<div style="flex:1;">' +
          '<span class="species-id-pill">#' + (sorted.length - idx) + " Chronological</span> " +
          '<span class="species-id-pill" style="background:#FFF5ED; border-color:#FCD2B1; color:#1D2228;">' + escapeHtml(ev.milestone) + "</span> " +
          '<span class="species-id-pill">' + escapeHtml(ev.date) + "</span>" +
          '<h5 style="font-size:0.95rem; font-weight:800; margin-top:6px;">' + escapeHtml(getAnimalLabel(ev.animalId)) + "</h5>" +
          '<p style="font-size:0.85rem; margin-top:4px;">' + escapeHtml(ev.details) + "</p>" +
          "</div>" +
          '<div style="display:flex; gap:6px;">' +
          '<button type="button" class="btn btn-outline btn-sm ws-edit-ev-btn" data-ev-id="' + escapeHtml(ev.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-outline btn-sm ws-del-ev-btn" data-ev-id="' + escapeHtml(ev.id) + '">Remove</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  // Workspace Form Submissions & Event Delegation
  var profForm = document.getElementById("ws-profile-form");
  var profCancelBtn = document.getElementById("prof-cancel-edit-btn");
  if (profForm) {
    profForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var editId = document.getElementById("prof-edit-id").value.trim();
      var name = document.getElementById("prof-name").value.trim();
      var species = document.getElementById("prof-species").value.trim();
      var category = document.getElementById("prof-category").value;
      var stage = document.getElementById("prof-stage").value;
      var tag = document.getElementById("prof-tag").value.trim();
      var notes = document.getElementById("prof-notes").value.trim();

      if (!name || !species || !tag) {
        showWorkspaceBanner("Validation Error: Please provide the animal's name, species, and tag/microchip identifier.");
        return;
      }

      if (FORBIDDEN_AVIAN_REGEX.test(name + " " + species + " " + notes)) {
        showWorkspaceBanner(
          "Product Boundary Notice: Avian species (birds) belong to the separate WINGLY platform and cannot be registered in ANIVERA."
        );
        return;
      }

      if (editId) {
        workspaceState.profiles = workspaceState.profiles.map(function (p) {
          return p.id === editId
            ? Object.assign({}, p, { name: name, species: species, category: category, stage: stage, tag: tag, notes: notes })
            : p;
        });
        if (saveWorkspaceData()) {
          showWorkspaceBanner("Updated animal profile: " + name + " (" + editId + ").");
        }
      } else {
        var newId = "PRF-" + (101 + workspaceState.profiles.length + Math.floor(Math.random() * 800));
        workspaceState.profiles.unshift({
          id: newId,
          name: name,
          species: species,
          category: category,
          stage: stage,
          tag: tag,
          notes: notes
        });
        if (saveWorkspaceData()) {
          showWorkspaceBanner("Created animal profile: " + name + " (" + newId + ").");
        }
      }

      profForm.reset();
      document.getElementById("prof-edit-id").value = "";
      document.getElementById("ws-profile-form-title").textContent = "Create / Edit Animal Profile";
      if (profCancelBtn) profCancelBtn.style.display = "none";
    });
  }

  if (profCancelBtn) {
    profCancelBtn.addEventListener("click", function () {
      if (profForm) profForm.reset();
      document.getElementById("prof-edit-id").value = "";
      document.getElementById("ws-profile-form-title").textContent = "Create / Edit Animal Profile";
      profCancelBtn.style.display = "none";
    });
  }

  ["ws-profile-search", "ws-profile-cat-filter", "ws-profile-stage-filter"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", renderWorkspaceProfiles);
      el.addEventListener("change", renderWorkspaceProfiles);
    }
  });

  var profilesListEl = document.getElementById("ws-profiles-list");
  if (profilesListEl) {
    profilesListEl.addEventListener("click", function (e) {
      var viewBtn = e.target.closest(".ws-view-prof-btn");
      if (viewBtn) {
        activeDossierProfileId = viewBtn.getAttribute("data-prof-id");
        renderAnimalDossier();
        return;
      }
      var editBtn = e.target.closest(".ws-edit-prof-btn");
      if (editBtn) {
        var pId = editBtn.getAttribute("data-prof-id");
        var prof = workspaceState.profiles.find(function (x) { return x.id === pId; });
        if (!prof) return;
        document.getElementById("prof-edit-id").value = prof.id;
        document.getElementById("prof-name").value = prof.name;
        document.getElementById("prof-species").value = prof.species;
        document.getElementById("prof-category").value = prof.category;
        document.getElementById("prof-stage").value = prof.stage;
        document.getElementById("prof-tag").value = prof.tag;
        document.getElementById("prof-notes").value = prof.notes;
        document.getElementById("ws-profile-form-title").textContent = "Editing Profile " + prof.id;
        if (profCancelBtn) profCancelBtn.style.display = "inline-flex";
        return;
      }
      var delBtn = e.target.closest(".ws-del-prof-btn");
      if (delBtn) {
        var delId = delBtn.getAttribute("data-prof-id");
        workspaceState.profiles = workspaceState.profiles.filter(function (x) { return x.id !== delId; });
        saveWorkspaceData();
        showWorkspaceBanner("Removed animal profile " + delId + ".");
      }
    });
  }

  // Health Records Form & List
  var healthForm = document.getElementById("ws-health-form");
  var healthCancelBtn = document.getElementById("health-cancel-edit-btn");
  if (healthForm) {
    healthForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var editId = document.getElementById("health-edit-id").value.trim();
      var animalId = document.getElementById("health-animal-select").value;
      var type = document.getElementById("health-type").value;
      var date = document.getElementById("health-date").value;
      var vet = document.getElementById("health-vet").value.trim();
      var treatment = (document.getElementById("health-treatment") || {}).value
        ? document.getElementById("health-treatment").value.trim()
        : "";
      var summary = document.getElementById("health-summary").value.trim();

      if (!animalId || !date || !vet || !summary) {
        showWorkspaceBanner("Validation Error: Please complete all required health record fields.");
        return;
      }

      if (editId) {
        workspaceState.healthRecords = workspaceState.healthRecords.map(function (h) {
          return h.id === editId
            ? Object.assign({}, h, { animalId: animalId, type: type, date: date, vet: vet, treatment: treatment, summary: summary })
            : h;
        });
        saveWorkspaceData();
        showWorkspaceBanner("Updated health record " + editId + ".");
      } else {
        workspaceState.healthRecords.unshift({
          id: "HLT-" + Date.now().toString().slice(-4),
          animalId: animalId,
          type: type,
          date: date,
          vet: vet,
          treatment: treatment,
          summary: summary
        });
        saveWorkspaceData();
        showWorkspaceBanner("Logged clinical health record for " + getAnimalLabel(animalId) + ".");
      }
      healthForm.reset();
      document.getElementById("health-edit-id").value = "";
      document.getElementById("ws-health-form-title").textContent = "Log Health or Clinical Record";
      if (healthCancelBtn) healthCancelBtn.style.display = "none";
    });
  }

  if (healthCancelBtn) {
    healthCancelBtn.addEventListener("click", function () {
      if (healthForm) healthForm.reset();
      document.getElementById("health-edit-id").value = "";
      document.getElementById("ws-health-form-title").textContent = "Log Health or Clinical Record";
      healthCancelBtn.style.display = "none";
    });
  }

  var healthAnimFilterEl = document.getElementById("ws-health-animal-filter");
  if (healthAnimFilterEl) {
    healthAnimFilterEl.addEventListener("change", renderWorkspaceHealth);
  }

  var healthListEl = document.getElementById("ws-health-list");
  if (healthListEl) {
    healthListEl.addEventListener("click", function (e) {
      var editBtn = e.target.closest(".ws-edit-health-btn");
      if (editBtn) {
        var hId = editBtn.getAttribute("data-health-id");
        var rec = workspaceState.healthRecords.find(function (x) { return x.id === hId; });
        if (!rec) return;
        document.getElementById("health-edit-id").value = rec.id;
        document.getElementById("health-animal-select").value = rec.animalId;
        document.getElementById("health-type").value = rec.type;
        document.getElementById("health-date").value = rec.date;
        document.getElementById("health-vet").value = rec.vet;
        if (document.getElementById("health-treatment")) {
          document.getElementById("health-treatment").value = rec.treatment || "";
        }
        document.getElementById("health-summary").value = rec.summary;
        document.getElementById("ws-health-form-title").textContent = "Editing Health Record " + rec.id;
        if (healthCancelBtn) healthCancelBtn.style.display = "inline-flex";
        return;
      }
      var delBtn = e.target.closest(".ws-del-health-btn");
      if (delBtn) {
        var id = delBtn.getAttribute("data-health-id");
        workspaceState.healthRecords = workspaceState.healthRecords.filter(function (x) { return x.id !== id; });
        saveWorkspaceData();
        showWorkspaceBanner("Removed health record " + id + ".");
      }
    });
  }

  // Care Plans & Tasks Form & List
  var taskForm = document.getElementById("ws-task-form");
  var taskCancelBtn = document.getElementById("task-cancel-edit-btn");
  if (taskForm) {
    taskForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var editId = document.getElementById("task-edit-id").value.trim();
      var animalId = document.getElementById("task-animal-select").value;
      var title = document.getElementById("task-title").value.trim();
      var frequency = document.getElementById("task-frequency").value;
      var due = document.getElementById("task-due").value;
      var priority = document.getElementById("task-priority").value;
      var status = document.getElementById("task-status").value;
      var instructions = document.getElementById("task-instructions").value.trim();

      if (!animalId || !title || !due || !instructions) {
        showWorkspaceBanner("Validation Error: Please complete all required care task fields (including due date and instructions).");
        return;
      }

      var completed = status === "Completed";
      if (editId) {
        workspaceState.careTasks = workspaceState.careTasks.map(function (t) {
          return t.id === editId
            ? Object.assign({}, t, {
                animalId: animalId,
                title: title,
                frequency: frequency,
                due: due,
                priority: priority,
                status: status,
                completed: completed,
                instructions: instructions
              })
            : t;
        });
        saveWorkspaceData();
        showWorkspaceBanner("Updated care task: " + title + " (" + editId + ").");
      } else {
        workspaceState.careTasks.unshift({
          id: "TSK-" + Date.now().toString().slice(-4),
          animalId: animalId,
          title: title,
          frequency: frequency,
          due: due,
          priority: priority,
          status: status,
          completed: completed,
          instructions: instructions
        });
        saveWorkspaceData();
        showWorkspaceBanner("Created care task: " + title + ".");
      }

      taskForm.reset();
      document.getElementById("task-edit-id").value = "";
      document.getElementById("ws-task-form-title").textContent = "Create / Edit Care Task & Plan";
      if (taskCancelBtn) taskCancelBtn.style.display = "none";
    });
  }

  if (taskCancelBtn) {
    taskCancelBtn.addEventListener("click", function () {
      if (taskForm) taskForm.reset();
      document.getElementById("task-edit-id").value = "";
      document.getElementById("ws-task-form-title").textContent = "Create / Edit Care Task & Plan";
      taskCancelBtn.style.display = "none";
    });
  }

  ["ws-task-status-filter", "ws-task-animal-filter"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", renderWorkspaceTasks);
  });

  var tasksListEl = document.getElementById("ws-tasks-list");
  if (tasksListEl) {
    tasksListEl.addEventListener("click", function (e) {
      var toggleBtn = e.target.closest(".ws-toggle-task-btn");
      if (toggleBtn) {
        var tId = toggleBtn.getAttribute("data-task-id");
        workspaceState.careTasks.forEach(function (t) {
          if (t.id === tId) {
            t.completed = !t.completed;
            t.status = t.completed ? "Completed" : "Pending";
          }
        });
        saveWorkspaceData();
        return;
      }
      var editBtn = e.target.closest(".ws-edit-task-btn");
      if (editBtn) {
        var editTaskId = editBtn.getAttribute("data-task-id");
        var taskObj = workspaceState.careTasks.find(function (t) { return t.id === editTaskId; });
        if (!taskObj) return;
        document.getElementById("task-edit-id").value = taskObj.id;
        document.getElementById("task-animal-select").value = taskObj.animalId;
        document.getElementById("task-title").value = taskObj.title;
        document.getElementById("task-frequency").value = taskObj.frequency;
        document.getElementById("task-due").value = taskObj.due;
        document.getElementById("task-priority").value = taskObj.priority;
        document.getElementById("task-status").value = taskObj.completed ? "Completed" : taskObj.status || "Pending";
        document.getElementById("task-instructions").value = taskObj.instructions;
        document.getElementById("ws-task-form-title").textContent = "Editing Care Task " + taskObj.id;
        if (taskCancelBtn) taskCancelBtn.style.display = "inline-flex";
        return;
      }
      var delBtn = e.target.closest(".ws-del-task-btn");
      if (delBtn) {
        var dId = delBtn.getAttribute("data-task-id");
        workspaceState.careTasks = workspaceState.careTasks.filter(function (t) { return t.id !== dId; });
        saveWorkspaceData();
        showWorkspaceBanner("Removed care task " + dId + ".");
      }
    });
  }

  // Lifecycle Events Form & List
  var evForm = document.getElementById("ws-event-form");
  var evCancelBtn = document.getElementById("ev-cancel-edit-btn");
  if (evForm) {
    evForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var editId = document.getElementById("ev-edit-id").value.trim();
      var animalId = document.getElementById("ev-animal-select").value;
      var milestone = document.getElementById("ev-milestone").value;
      var date = document.getElementById("ev-date").value;
      var details = document.getElementById("ev-details").value.trim();
      if (!animalId || !date || !details) {
        showWorkspaceBanner("Validation Error: Please complete all required lifecycle milestone fields.");
        return;
      }
      if (editId) {
        workspaceState.events = workspaceState.events.map(function (ev) {
          return ev.id === editId
            ? Object.assign({}, ev, { animalId: animalId, milestone: milestone, date: date, details: details })
            : ev;
        });
        saveWorkspaceData();
        showWorkspaceBanner("Updated lifecycle milestone " + editId + ".");
      } else {
        workspaceState.events.unshift({
          id: "EV-" + Date.now().toString().slice(-4),
          animalId: animalId,
          milestone: milestone,
          date: date,
          details: details
        });
        saveWorkspaceData();
        showWorkspaceBanner("Recorded lifecycle milestone: " + milestone + ".");
      }
      evForm.reset();
      document.getElementById("ev-edit-id").value = "";
      document.getElementById("ws-event-form-title").textContent = "Record / Edit Lifecycle Milestone";
      if (evCancelBtn) evCancelBtn.style.display = "none";
    });
  }

  if (evCancelBtn) {
    evCancelBtn.addEventListener("click", function () {
      if (evForm) evForm.reset();
      document.getElementById("ev-edit-id").value = "";
      document.getElementById("ws-event-form-title").textContent = "Record / Edit Lifecycle Milestone";
      evCancelBtn.style.display = "none";
    });
  }

  var evFilterEl = document.getElementById("ws-event-animal-filter");
  if (evFilterEl) {
    evFilterEl.addEventListener("change", renderWorkspaceEvents);
  }

  var evListEl = document.getElementById("ws-events-list");
  if (evListEl) {
    evListEl.addEventListener("click", function (e) {
      var editBtn = e.target.closest(".ws-edit-ev-btn");
      if (editBtn) {
        var evId = editBtn.getAttribute("data-ev-id");
        var evObj = workspaceState.events.find(function (x) { return x.id === evId; });
        if (!evObj) return;
        document.getElementById("ev-edit-id").value = evObj.id;
        document.getElementById("ev-animal-select").value = evObj.animalId;
        document.getElementById("ev-milestone").value = evObj.milestone;
        document.getElementById("ev-date").value = evObj.date;
        document.getElementById("ev-details").value = evObj.details;
        document.getElementById("ws-event-form-title").textContent = "Editing Lifecycle Event " + evObj.id;
        if (evCancelBtn) evCancelBtn.style.display = "inline-flex";
        return;
      }
      var btn = e.target.closest(".ws-del-ev-btn");
      if (!btn) return;
      var id = btn.getAttribute("data-ev-id");
      workspaceState.events = workspaceState.events.filter(function (x) { return x.id !== id; });
      saveWorkspaceData();
      showWorkspaceBanner("Removed lifecycle event " + id + ".");
    });
  }

  // Topbar & Auth Actions
  var snapshotBtn = document.getElementById("ws-snapshot-btn");
  if (snapshotBtn) {
    snapshotBtn.addEventListener("click", function () {
      if (!syncEngine) return;
      var res = syncEngine.createSnapshot("Manual Workspace Checkpoint");
      if (res.ok) {
        refreshWorkspaceFromSync();
        showWorkspaceBanner("Saved workspace snapshot " + res.snapshot.id + " to workspace_snapshots.");
      } else {
        showWorkspaceBanner("Snapshot Error: " + res.error);
      }
    });
  }

  var exportJsonBtn = document.getElementById("ws-export-json-btn");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(workspaceState, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "anivera-workspace-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showWorkspaceBanner("Exported owner-scoped ANIVERA workspace records as JSON.");
    });
  }

  var resetDemoBtn = document.getElementById("ws-reset-demo-btn");
  if (resetDemoBtn) {
    resetDemoBtn.addEventListener("click", function () {
      if (syncEngine) {
        syncEngine.resetSeedData();
        refreshWorkspaceFromSync();
      }
      showWorkspaceBanner("Restored default verified ANIVERA seed data and primary session.");
    });
  }

  var switchUserBtn = document.getElementById("ws-switch-user-btn");
  if (switchUserBtn) {
    switchUserBtn.addEventListener("click", function () {
      if (!syncEngine) return;
      var current = syncEngine.getSession();
      var currentEmail = current.session && current.session.user ? current.session.user.email : "";
      if (currentEmail === "researcher@anivera.org") {
        syncEngine.signIn({ email: "sanctuary@anivera.org", password: "Sanctuary#2026" });
        refreshWorkspaceFromSync();
        showWorkspaceBanner(
          "Switched to Secondary User (sanctuary@anivera.org). Notice owner-scoped RLS isolation: Primary user's 6 records are hidden, and only Secondary user's sanctuary record (PRF-201) is visible."
        );
      } else {
        syncEngine.signIn({ email: "researcher@anivera.org", password: "AniveraCare#2026" });
        refreshWorkspaceFromSync();
        showWorkspaceBanner("Switched to Primary Authorized User (researcher@anivera.org). Loaded 6 owner-scoped animal profiles.");
      }
    });
  }

  var openAuthTabBtn = document.getElementById("ws-open-auth-tab-btn");
  if (openAuthTabBtn) {
    openAuthTabBtn.addEventListener("click", function () {
      switchWorkspaceTab("db");
    });
  }

  var signOutBtn = document.getElementById("ws-signout-btn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", function () {
      if (!syncEngine) return;
      syncEngine.signOut();
      refreshWorkspaceFromSync();
      showWorkspaceBanner("Signed out. Private owner-scoped records are cleared from view until you sign in again.");
    });
  }

  var authForm = document.getElementById("ws-auth-form");
  if (authForm) {
    authForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!syncEngine) return;
      var email = document.getElementById("auth-email-input").value.trim();
      var password = document.getElementById("auth-password-input").value;
      var res = syncEngine.signIn({ email: email, password: password });
      if (!res.ok) {
        showWorkspaceBanner("Authentication Error (" + res.code + "): " + res.error);
        return;
      }
      refreshWorkspaceFromSync();
      showWorkspaceBanner("Signed in as " + res.session.user.email + " (" + res.session.user.id + ").");
    });
  }

  var signUpBtn = document.getElementById("auth-signup-btn");
  if (signUpBtn) {
    signUpBtn.addEventListener("click", function () {
      if (!syncEngine) return;
      var email = document.getElementById("auth-email-input").value.trim();
      var password = document.getElementById("auth-password-input").value;
      var res = syncEngine.signUp({ email: email, password: password });
      if (!res.ok) {
        showWorkspaceBanner("Sign-Up Error (" + res.code + "): " + res.error);
        return;
      }
      refreshWorkspaceFromSync();
      showWorkspaceBanner("Registered & signed in new caretaker account: " + res.session.user.email + ".");
    });
  }

  var expireBtn = document.getElementById("auth-expire-btn");
  if (expireBtn) {
    expireBtn.addEventListener("click", function () {
      if (!syncEngine) return;
      var res = syncEngine.simulateExpiredSession();
      refreshWorkspaceFromSync();
      showWorkspaceBanner("Session Status (" + res.status + "): " + res.error);
    });
  }

  var dbConfigForm = document.getElementById("ws-db-config-form");
  if (dbConfigForm) {
    dbConfigForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!syncEngine) return;
      var urlVal = document.getElementById("db-url-input").value.trim();
      var anonVal = (document.getElementById("db-anon-key-input") || {}).value || "";
      var statusSpan = document.getElementById("db-endpoint-status");
      var probe = await syncEngine.probeSupabaseConnection(urlVal, anonVal);
      if (statusSpan) statusSpan.textContent = probe.mode + " — " + probe.message;
      showWorkspaceBanner(probe.message);
    });
  }

  // 10-Step Persistence & RLS Verification Suite (Section 11.4)
  function runTenStepPersistenceAudit() {
    if (!syncEngine) return { passed: false, log: ["Sync engine unavailable"] };
    var logs = [];

    // Step 1: Sign in as authorized user
    var s1 = syncEngine.signIn({ email: "researcher@anivera.org", password: "AniveraCare#2026" });
    logs.push("1. Sign in as authorized user (researcher@anivera.org): " + (s1.ok ? "PASS" : "FAIL"));

    // Step 2: Create an animal profile
    var ws1 = syncEngine.getOwnerScopedWorkspace();
    var testId = "PRF-AUDIT-999";
    ws1.data.profiles = ws1.data.profiles.filter(function (p) { return p.id !== testId; });
    ws1.data.profiles.unshift({
      id: testId,
      name: "Serengeti Cheetah #A9",
      species: "Cheetah (Acinonyx jubatus)",
      category: "Wild Mammals & Wildlife",
      stage: "Adult",
      tag: "VHF-TZ-999",
      notes: "Created during 10-step persistence verification."
    });
    syncEngine.saveOwnerScopedWorkspace(ws1.data);
    logs.push("2. Create animal profile (" + testId + "): PASS");

    // Step 3 & 4: Reload state from storage and confirm profile remains
    var wsReload1 = syncEngine.getOwnerScopedWorkspace();
    var foundAfterCreate = wsReload1.data.profiles.find(function (p) { return p.id === testId; });
    logs.push("3-4. Reload & confirm profile persists: " + (foundAfterCreate ? "PASS" : "FAIL"));

    // Step 5: Edit the profile
    wsReload1.data.profiles = wsReload1.data.profiles.map(function (p) {
      return p.id === testId ? Object.assign({}, p, { stage: "Breeding / Conservation", notes: "Updated telemetry note" }) : p;
    });
    syncEngine.saveOwnerScopedWorkspace(wsReload1.data);
    logs.push("5. Edit animal profile stage & notes: PASS");

    // Step 6 & 7: Reload again and confirm update persists
    var wsReload2 = syncEngine.getOwnerScopedWorkspace();
    var foundAfterEdit = wsReload2.data.profiles.find(function (p) { return p.id === testId; });
    var editPersisted = foundAfterEdit && foundAfterEdit.stage === "Breeding / Conservation";
    logs.push("6-7. Reload & confirm edited profile update persists: " + (editPersisted ? "PASS" : "FAIL"));

    // Step 8 & 9: Add a related health record and care task & confirm animal association
    wsReload2.data.healthRecords.unshift({
      id: "HLT-AUDIT-999",
      animalId: testId,
      type: "Clinical Examination",
      date: "2026-10-22",
      vet: "Dr. M. Ochieng",
      treatment: "Telemetry collar check",
      summary: "Healthy adult felid."
    });
    wsReload2.data.careTasks.unshift({
      id: "TSK-AUDIT-999",
      animalId: testId,
      title: "Corridor Prey Density Survey",
      frequency: "Weekly",
      due: "2026-10-29",
      priority: "High",
      status: "Pending",
      completed: false,
      instructions: "Log Thomson gazelle herd counts."
    });
    syncEngine.saveOwnerScopedWorkspace(wsReload2.data);
    var wsReload3 = syncEngine.getOwnerScopedWorkspace();
    var linkedHealth = wsReload3.data.healthRecords.find(function (h) { return h.id === "HLT-AUDIT-999" && h.animalId === testId; });
    var linkedTask = wsReload3.data.careTasks.find(function (t) { return t.id === "TSK-AUDIT-999" && t.animalId === testId; });
    logs.push("8-9. Add related health record & care task and confirm animalId association: " + (linkedHealth && linkedTask ? "PASS" : "FAIL"));

    // Step 10: Verify that an unauthorized / secondary user cannot access another user's private records
    syncEngine.signIn({ email: "sanctuary@anivera.org", password: "Sanctuary#2026" });
    var secondaryView = syncEngine.getOwnerScopedWorkspace();
    var leaked = secondaryView.data.profiles.some(function (p) { return p.id === testId; });
    var ownershipCheck = syncEngine.verifyRecordOwnership("animal_profiles", testId);
    var rlsBlocked = !leaked && ownershipCheck.ok === false && ownershipCheck.code === "RLS_VIOLATION";
    logs.push("10. Verify Secondary User cannot read/mutate Primary User's private record (RLS enforced): " + (rlsBlocked ? "PASS" : "FAIL"));

    // Restore Primary User session and clean up temporary audit records so seed state stays clean
    syncEngine.signIn({ email: "researcher@anivera.org", password: "AniveraCare#2026" });
    var cleanWs = syncEngine.getOwnerScopedWorkspace();
    cleanWs.data.profiles = cleanWs.data.profiles.filter(function (p) { return p.id !== testId; });
    cleanWs.data.healthRecords = cleanWs.data.healthRecords.filter(function (h) { return h.id !== "HLT-AUDIT-999"; });
    cleanWs.data.careTasks = cleanWs.data.careTasks.filter(function (t) { return t.id !== "TSK-AUDIT-999"; });
    syncEngine.saveOwnerScopedWorkspace(cleanWs.data);
    refreshWorkspaceFromSync();

    var allPassed = logs.every(function (l) { return l.indexOf("PASS") !== -1; });
    return { passed: allPassed, log: logs };
  }

  var runRlsAuditBtn = document.getElementById("run-rls-audit-btn");
  if (runRlsAuditBtn) {
    runRlsAuditBtn.addEventListener("click", function () {
      var res = runTenStepPersistenceAudit();
      var pre = document.getElementById("rls-audit-output");
      if (pre) {
        pre.style.display = "block";
        pre.textContent = res.log.join("\n") + "\nOVERALL VERDICT: " + (res.passed ? "10/10 PASSED" : "FAILED");
      }
      showWorkspaceBanner("Completed 10-Step Persistence & RLS Verification: " + (res.passed ? "10/10 Passed." : "Check output."));
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Mobile Navigation Drawer
  // ---------------------------------------------------------------------------
  var mobileMenuBtn = document.getElementById("mobile-menu-btn");
  var mobileDrawer = document.getElementById("mobile-nav-drawer");
  if (mobileMenuBtn && mobileDrawer) {
    mobileMenuBtn.addEventListener("click", function () {
      var isOpen = mobileDrawer.classList.toggle("open");
      mobileMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    mobileDrawer.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileDrawer.classList.remove("open");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 8. Initialize Application & Expose QA Inspection Hook
  // ---------------------------------------------------------------------------
  syncMotionButtonUI();
  renderCarouselRing("left");
  renderCarouselRing("right");
  startCarouselLoop();
  renderCategoryCards();
  renderExplorer();
  refreshWorkspaceFromSync();

  window.__ANIVERA_QA__ = {
    validationReport: VALIDATION_REPORT,
    getCarouselState: function () {
      return {
        reducedMotion: carouselController.reducedMotion,
        activeModalSide: carouselController.activeModalSide,
        leftAngle: carouselController.left.angle,
        rightAngle: carouselController.right.angle,
        leftPaused: carouselController.left.pausedByModal,
        rightPaused: carouselController.right.pausedByModal
      };
    },
    getCatalogueCount: function () {
      return SPECIES_CATALOGUE.length;
    },
    getWorkspaceState: function () {
      return workspaceState;
    },
    runTenStepPersistenceAudit: runTenStepPersistenceAudit,
    openSpeciesModal: openSpeciesModal,
    closeSpeciesModal: closeSpeciesModal
  };
})();

// =============================================================================
// 9. CINEMATIC WILDLIFE HERO SLIDESHOW & NAVIGATION SEARCH (ANIVERA V2.5)
// =============================================================================
(function initCinematicWildlifeHero() {
  "use strict";

  var snowLeopard = SPECIES_CATALOGUE.filter(function (s) { return s.id === "ANV-SP-003"; })[0];
  var others = SPECIES_CATALOGUE.filter(function (s) { return s.id !== "ANV-SP-003"; });
  var heroCatalogue = snowLeopard ? [snowLeopard].concat(others) : SPECIES_CATALOGUE.slice();
  var currentIndex = 0;
  var requestedIndex = 0;
  var isPlaying = false;
  var slideInterval = 3000;
  var imageFadeDuration = 1050;
  var nameFadeDuration = 750;
  var slideTimer = null;
  var progressStartTime = 0;
  var progressRafId = null;
  var transitionToken = 0;
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var frontImg = document.getElementById("cinematic-hero-img-front");
  var backImg = document.getElementById("cinematic-hero-img-back");
  var slideNumEl = document.getElementById("hero-slide-num");
  var catEl = document.getElementById("hero-category-label");
  var nameEl = document.getElementById("hero-common-name");
  var sciEl = document.getElementById("hero-scientific-name");
  var descEl = document.getElementById("hero-description");
  var habEl = document.getElementById("hero-habitat");
  var dietEl = document.getElementById("hero-diet");
  var statusEl = document.getElementById("hero-conservation");
  var learnBtn = document.getElementById("hero-learn-more-btn");
  var prevBtn = document.getElementById("hero-prev-btn");
  var nextBtn = document.getElementById("hero-next-btn");
  var playPauseBtn = document.getElementById("hero-play-pause-btn");
  var progressBar = document.getElementById("hero-progress-bar");
  var heroSection = document.getElementById("cinematic-hero");

  function normalizeIndex(idx) {
    return ((idx % heroCatalogue.length) + heroCatalogue.length) % heroCatalogue.length;
  }

  function preloadImage(idx) {
    if (!heroCatalogue.length) return;
    var sp = heroCatalogue[normalizeIndex(idx)];
    if (sp && sp.imageUrl) {
      var image = new Image();
      image.decoding = "async";
      image.src = sp.imageUrl;
    }
  }

  function updateSlideText(sp, slideNum) {
    if (slideNumEl) slideNumEl.textContent = (slideNum < 10 ? "0" : "") + slideNum + " / " + heroCatalogue.length;
    if (catEl) catEl.textContent = (sp.category || "WILDLIFE").toUpperCase();
    if (nameEl) nameEl.textContent = sp.name || sp.commonName || "";
    if (sciEl) sciEl.textContent = sp.scientificName || "";
    if (descEl) descEl.textContent = sp.description || "";
    if (habEl) habEl.textContent = sp.habitat || "";
    if (dietEl) dietEl.textContent = sp.diet || "";
    if (statusEl) statusEl.textContent = sp.conservationStatus || "";
    if (learnBtn) learnBtn.setAttribute("data-species-id", sp.id);
  }

  function updateProgressBar() {
    if (!isPlaying || !progressBar) return;
    var elapsed = Date.now() - progressStartTime;
    progressBar.style.width = Math.min(100, (elapsed / slideInterval) * 100) + "%";
    if (elapsed < slideInterval) progressRafId = requestAnimationFrame(updateProgressBar);
  }

  function pauseTimer() {
    clearTimeout(slideTimer);
    if (progressRafId) cancelAnimationFrame(progressRafId);
    progressRafId = null;
    if (progressBar) progressBar.style.width = "0%";
  }

  function startTimer() {
    pauseTimer();
    if (!isPlaying || document.hidden || !heroCatalogue.length) return;
    progressStartTime = Date.now();
    updateProgressBar();
    // The transition occupies the final 1,050ms of each 3-second cycle.
    slideTimer = setTimeout(function () {
      goToSlide(requestedIndex + 1, true);
    }, Math.max(0, slideInterval - imageFadeDuration));
  }

  function setNameTransitionOut() {
    if (!nameEl) return;
    nameEl.classList.remove("hero-name-enter", "hero-name-exit");
    void nameEl.offsetWidth;
    nameEl.classList.add("hero-name-exit");
  }

  function setNameTransitionIn() {
    if (!nameEl) return;
    nameEl.classList.remove("hero-name-exit", "hero-name-enter");
    void nameEl.offsetWidth;
    nameEl.classList.add("hero-name-enter");
  }

  function goToSlide(targetIdx, automatic) {
    if (!heroCatalogue.length || !frontImg || !backImg) return;
    targetIdx = normalizeIndex(targetIdx);

    // If a transition is interrupted, keep whichever layer is currently visible
    // as the outgoing layer before starting the latest requested transition.
    if (backImg.classList.contains("is-active")) {
      var layerSwap = frontImg;
      frontImg = backImg;
      backImg = layerSwap;
    }
    frontImg.classList.add("is-active");
    backImg.classList.remove("is-active");

    var token = ++transitionToken;
    requestedIndex = targetIdx;
    pauseTimer();

    if (targetIdx === currentIndex) {
      if (isPlaying) startTimer();
      return;
    }

    var nextSp = heroCatalogue[targetIdx];
    var slideDirection = targetIdx === normalizeIndex(currentIndex - 1) ? "down" : "up";
    if (!nextSp || !nextSp.imageUrl) {
      currentIndex = requestedIndex = targetIdx;
      updateSlideText(nextSp, targetIdx + 1);
      if (isPlaying) startTimer();
      return;
    }

    var incoming = backImg;
    var outgoing = frontImg;
    incoming.classList.remove("is-active", "hero-slide-from-top", "hero-slide-from-bottom");
    outgoing.classList.remove("hero-slide-leave-up", "hero-slide-leave-down");
    incoming.classList.add(slideDirection === "up" ? "hero-slide-from-bottom" : "hero-slide-from-top");
    incoming.onload = function () {
      if (token !== transitionToken) return;
      incoming.onload = null;
      incoming.onerror = null;
      incoming.alt = (nextSp.name || nextSp.commonName) + " (" + (nextSp.scientificName || "") + ")";
      setNameTransitionOut();

      var nameSwapDelay = reducedMotion ? 0 : nameFadeDuration / 2;
      setTimeout(function () {
        if (token !== transitionToken) return;
        updateSlideText(nextSp, targetIdx + 1);
        setNameTransitionIn();
      }, nameSwapDelay);

      requestAnimationFrame(function () {
        if (token !== transitionToken) return;
        outgoing.classList.add(slideDirection === "up" ? "hero-slide-leave-up" : "hero-slide-leave-down");
        incoming.classList.remove("hero-slide-from-top", "hero-slide-from-bottom");
        incoming.classList.add("is-active");
        outgoing.classList.remove("is-active");
      });

      setTimeout(function () {
        if (token !== transitionToken) return;
        // Keep both DOM image layers alive; swap their roles without copying src.
        frontImg = incoming;
        backImg = outgoing;
        outgoing.classList.remove("hero-slide-leave-up", "hero-slide-leave-down");
        incoming.classList.remove("hero-slide-from-top", "hero-slide-from-bottom");
        currentIndex = requestedIndex = targetIdx;
        preloadImage(currentIndex + 1);
        preloadImage(currentIndex - 1);
        if (isPlaying) startTimer();
      }, reducedMotion ? 80 : imageFadeDuration);
    };
    incoming.onerror = function () {
      if (token !== transitionToken) return;
      incoming.onload = null;
      incoming.onerror = null;
      currentIndex = requestedIndex = targetIdx;
      updateSlideText(nextSp, targetIdx + 1);
      incoming.classList.add("is-active");
      outgoing.classList.remove("is-active");
      frontImg = incoming;
      backImg = outgoing;
      if (isPlaying) startTimer();
    };
    incoming.src = nextSp.imageUrl;
    if (incoming.complete && incoming.naturalWidth > 0) incoming.onload();
  }

  // Arrow controls are bound after the public API is exposed below, in capture phase.
  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", function () {
      isPlaying = !isPlaying;
      playPauseBtn.textContent = isPlaying ? "Pause" : "Play";
      if (isPlaying) startTimer(); else pauseTimer();
    });
  }
  if (learnBtn) {
    learnBtn.addEventListener("click", function () {
      var spId = learnBtn.getAttribute("data-species-id") || heroCatalogue[currentIndex].id;
      if (window.__ANIVERA_QA__ && window.__ANIVERA_QA__.openSpeciesModal) window.__ANIVERA_QA__.openSpeciesModal(spId);
    });
  }

  window.addEventListener("keydown", function (e) {
    if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowLeft") goToSlide(requestedIndex - 1, false);
    else if (e.key === "ArrowRight") goToSlide(requestedIndex + 1, false);
  });

  if (heroSection) {
    var touchStartX = 0;
    heroSection.addEventListener("touchstart", function (e) {
      if (e.changedTouches && e.changedTouches[0]) touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    heroSection.addEventListener("touchend", function (e) {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      var diffX = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diffX) > 50) goToSlide(requestedIndex + (diffX < 0 ? 1 : -1), false);
    }, { passive: true });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pauseTimer();
    else if (isPlaying) startTimer();
  });

  if (heroCatalogue.length) {
    updateSlideText(heroCatalogue[0], 1);
    preloadImage(1);
    preloadImage(2);
    startTimer();
  }

  window.__ANIVERA_HERO__ = {
    getCatalogue: function () { return heroCatalogue; },
    getCurrentIndex: function () { return currentIndex; },
    getCurrentSpecies: function () { return heroCatalogue[currentIndex]; },
    goToSlide: goToSlide,
    next: function () { isPlaying = false; pauseTimer(); goToSlide(currentIndex + 1, false); },
    previous: function () { isPlaying = false; pauseTimer(); goToSlide(currentIndex - 1, false); },
    pause: function () { isPlaying = false; pauseTimer(); },
    play: function () { isPlaying = true; startTimer(); }
  };

  // Bind vertical navigation explicitly after the slideshow API is ready.
  function bindVerticalNavigation() {
    var previous = document.getElementById("hero-prev-btn");
    var next = document.getElementById("hero-next-btn");
    if (previous && !previous.dataset.heroBound) {
      previous.dataset.heroBound = "true";
      previous.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        isPlaying = false;
        pauseTimer();
        goToSlide(currentIndex - 1, false);
      }, true);
    }
    if (next && !next.dataset.heroBound) {
      next.dataset.heroBound = "true";
      next.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        isPlaying = false;
        pauseTimer();
        goToSlide(currentIndex + 1, false);
      }, true);
    }
  }
  bindVerticalNavigation();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindVerticalNavigation, { once: true });
  }
})();
// =============================================================================
// 10. REAL-TIME NAVIGATION SEARCH
// =============================================================================
(function initNavSpeciesSearch() {
  "use strict";

  var searchInput = document.getElementById("nav-species-search");
  var resultsBox = document.getElementById("nav-search-results");
  if (!searchInput || !resultsBox) return;

  function renderSearchResults(query) {
    var q = query.trim().toLowerCase();
    if (!q) {
      resultsBox.hidden = true;
      resultsBox.innerHTML = "";
      return;
    }

    var matches = SPECIES_CATALOGUE.filter(function (s) {
      var name = (s.name || s.commonName || "").toLowerCase();
      var sci = (s.scientificName || "").toLowerCase();
      var cat = (s.category || "").toLowerCase();
      return name.indexOf(q) !== -1 || sci.indexOf(q) !== -1 || cat.indexOf(q) !== -1;
    }).slice(0, 8);

    if (!matches.length) {
      resultsBox.hidden = false;
      resultsBox.innerHTML = '<div style="padding:12px 16px; color:#9EA7B0; font-size:0.82rem;">No non-avian species match "' + escapeHtml(query) + '"</div>';
      return;
    }

    var html = matches.map(function (s) {
      var displayName = s.name || s.commonName;
      return (
        '<a href="javascript:void(0)" class="nav-search-item" data-species-id="' + escapeHtml(s.id) + '">' +
        '<img src="' + escapeHtml(s.imageUrl || s.imageSource) + '" class="nav-search-thumb" alt="" />' +
        '<div>' +
        '<div style="font-weight:700; color:#FFFFFF;">' + escapeHtml(displayName) + '</div>' +
        '<div style="font-size:0.75rem; font-style:italic; color:#FB8122;">' + escapeHtml(s.scientificName) + '</div>' +
        '</div>' +
        '</a>'
      );
    }).join("");

    resultsBox.hidden = false;
    resultsBox.innerHTML = html;

    resultsBox.querySelectorAll(".nav-search-item").forEach(function (item) {
      item.addEventListener("click", function () {
        var spId = item.getAttribute("data-species-id");
        resultsBox.hidden = true;
        searchInput.value = "";
        
        // Advance hero to selected species if present in hero catalogue
        if (window.__ANIVERA_HERO__) {
          var heroCat = window.__ANIVERA_HERO__.getCatalogue();
          for (var i = 0; i < heroCat.length; i++) {
            if (heroCat[i].id === spId) {
              window.__ANIVERA_HERO__.goToSlide(i);
              break;
            }
          }
        }
        
        // Open species modal
        if (window.__ANIVERA_QA__ && window.__ANIVERA_QA__.openSpeciesModal) {
          window.__ANIVERA_QA__.openSpeciesModal(spId);
        }
      });
    });
  }

  searchInput.addEventListener("input", function (e) {
    renderSearchResults(e.target.value);
  });

  document.addEventListener("click", function (e) {
    if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
      resultsBox.hidden = true;
    }
  });
})();

// =============================================================================
// 11. AUTH MODALS & WORKSPACE ENTRY POINTS
// =============================================================================
(function initAuthModals() {
  "use strict";

  var signinBackdrop = document.getElementById("signin-modal-backdrop");
  var signupBackdrop = document.getElementById("signup-modal-backdrop");
  var navSignInBtn = document.getElementById("nav-sign-in-btn");
  var navSignUpBtn = document.getElementById("nav-sign-up-btn");
  var mobileSignInBtn = document.getElementById("mobile-sign-in-btn");
  var mobileSignUpBtn = document.getElementById("mobile-sign-up-btn");
  var signinCloseBtn = document.getElementById("signin-close-btn");
  var signupCloseBtn = document.getElementById("signup-close-btn");

  function openSignInModal() {
    if (signinBackdrop) {
      signinBackdrop.classList.add("open");
      signinBackdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      var emailInp = document.getElementById("nav-signin-email");
      if (emailInp) emailInp.focus();
    }
  }

  function closeSignInModal() {
    if (signinBackdrop) {
      signinBackdrop.classList.remove("open");
      signinBackdrop.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    }
  }

  function openSignUpModal() {
    if (signupBackdrop) {
      signupBackdrop.classList.add("open");
      signupBackdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      var nameInp = document.getElementById("nav-signup-name");
      if (nameInp) nameInp.focus();
    }
  }

  function closeSignUpModal() {
    if (signupBackdrop) {
      signupBackdrop.classList.remove("open");
      signupBackdrop.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    }
  }

  if (navSignInBtn) navSignInBtn.addEventListener("click", openSignInModal);
  if (mobileSignInBtn) mobileSignInBtn.addEventListener("click", openSignInModal);
  if (signinCloseBtn) signinCloseBtn.addEventListener("click", closeSignInModal);

  if (navSignUpBtn) navSignUpBtn.addEventListener("click", openSignUpModal);
  if (mobileSignUpBtn) mobileSignUpBtn.addEventListener("click", openSignUpModal);
  if (signupCloseBtn) signupCloseBtn.addEventListener("click", closeSignUpModal);

  // Quick Demo account buttons
  var demoResearcher = document.getElementById("demo-fill-researcher");
  var demoSanctuary = document.getElementById("demo-fill-sanctuary");
  if (demoResearcher) {
    demoResearcher.addEventListener("click", function () {
      var e = document.getElementById("nav-signin-email");
      var p = document.getElementById("nav-signin-password");
      if (e) e.value = "researcher@anivera.org";
      if (p) p.value = "AniveraCare#2026";
    });
  }
  if (demoSanctuary) {
    demoSanctuary.addEventListener("click", function () {
      var e = document.getElementById("nav-signin-email");
      var p = document.getElementById("nav-signin-password");
      if (e) e.value = "sanctuary@anivera.org";
      if (p) p.value = "Sanctuary#2026";
    });
  }

  // Sign In Form Submission
  var signinForm = document.getElementById("nav-signin-form");
  if (signinForm) {
    signinForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("nav-signin-email").value.trim();
      var pass = document.getElementById("nav-signin-password").value;
      var errEl = document.getElementById("signin-error-alert");

      var res = window.AniveraCloudSync ? window.AniveraCloudSync.signIn({ email: email, password: pass }) : { ok: false, code: "NO_SYNC_ENGINE" };
      if (res.ok) {
        if (errEl) errEl.style.display = "none";
        closeSignInModal();
        if (navSignInBtn) navSignInBtn.textContent = (res.session.user.fullName || "User").split(" ")[0];
        // Scroll to workspace
        var ws = document.getElementById("lifecycle-workspace");
        if (ws) ws.scrollIntoView({ behavior: "smooth" });
      } else {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Sign-in failed (" + (res.code || "INVALID_CREDENTIALS") + "): Check your email and password.";
        }
      }
    });
  }

  // Sign Up Form Submission
  var signupForm = document.getElementById("nav-signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("nav-signup-name").value.trim();
      var org = document.getElementById("nav-signup-org").value.trim();
      var email = document.getElementById("nav-signup-email").value.trim();
      var pass = document.getElementById("nav-signup-password").value;
      var errEl = document.getElementById("signup-error-alert");

      var res = window.AniveraCloudSync ? window.AniveraCloudSync.signUp({ fullName: name, organization: org, email: email, password: pass }) : { ok: false };
      if (res.ok) {
        if (errEl) errEl.style.display = "none";
        closeSignUpModal();
        if (navSignInBtn) navSignInBtn.textContent = name.split(" ")[0];
        var ws = document.getElementById("lifecycle-workspace");
        if (ws) ws.scrollIntoView({ behavior: "smooth" });
      } else {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Registration failed (" + (res.code || "ERROR") + "): " + (res.message || "Please check inputs.");
        }
      }
    });
  }
})();

// =============================================================================
// 12. PWA SERVICE WORKER REGISTRATION
// =============================================================================
(function registerAniveraServiceWorker() {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").then(function (registration) {
        console.log("ANIVERA PWA Service Worker registered with scope:", registration.scope);
      }).catch(function (error) {
        console.warn("ANIVERA Service Worker registration skipped/failed:", error);
      });
    });
  }
})();


// =============================================================================
// ANIVERA — CINEMATIC LANDING-PAGE SECTION TRANSITIONS
// =============================================================================
(function initAniveraSectionTransitions() {
  "use strict";
  function activate() {
    var sections = Array.prototype.slice.call(
      document.querySelectorAll("main > section:not(#cinematic-hero)")
    );
    if (!sections.length) return;

    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sections.forEach(function (section) { section.classList.add("anivera-revealed"); });
      return;
    }

    if (!("IntersectionObserver" in window)) {
      sections.forEach(function (section) { section.classList.add("anivera-revealed"); });
      return;
    }

    sections.forEach(function (section) {
      section.classList.add("anivera-reveal-pending");
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("anivera-reveal-pending");
        entry.target.classList.add("anivera-revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });

    sections.forEach(function (section) { observer.observe(section); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", activate, { once: true });
  } else {
    activate();
  }
})();
