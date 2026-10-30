/**
 * Comifuro 23 Interactive Floormap & Navigation Engine
 * Built for ICE BSD Halls 5-10
 */

// State Management
const state = window.state = {
  circles: [],
  coordsData: null,
  startPoint: null,       // { type: 'landmark'|'booth', id, name, x, y, code? }
  destPoint: null,        // { type: 'landmark'|'booth', id, name, x, y, code? }
  activeRoute: null,      // array of [x, y] points
  wishlist: new Set(),
  activeFilter: 'all',
  activeTab: 'tab-route',
  activeDay: 'all',
  selectedBlock: null,
  selectedFandom: null,
  highlightMarkers: [],
  fandomIndex: [],
  stampRallies: [],
  selectedRally: null,
  currentModalTarget: null, // 'start' or 'dest'
  selectedCircle: null,
  
  // Viewport Transform (Pan & Zoom)
  scale: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0
};

// Map Native Dimensions (matches original floormap.png)
const MAP_WIDTH = 6574;
const MAP_HEIGHT = 3117;

// DOM Elements

function setSidebarCollapsed(collapsed) {
  if (!el.sidePanel) return;
  if (collapsed) {
    el.sidePanel.classList.add('collapsed');
    el.sidePanel.classList.remove('sheet-half', 'sheet-full');
    el.sidePanel.classList.add('sheet-peek');
    if (el.btnReopenPanel) el.btnReopenPanel.style.display = 'flex';
  } else {
    el.sidePanel.classList.remove('collapsed', 'sheet-peek');
    el.sidePanel.classList.add('sheet-half');
    if (el.btnReopenPanel) el.btnReopenPanel.style.display = 'none';
  }
}

const el = {
  mapContainer: document.getElementById('map-container'),
  mapCanvasLayer: document.getElementById('map-canvas-layer'),
  floormapImg: document.getElementById('floormap-img'),
  routeSvg: document.getElementById('route-svg'),
  routeMainPath: document.getElementById('route-main-path'),
  routeGlowPath: document.getElementById('route-glow-path'),
  pinsLayer: document.getElementById('pins-layer'),
  
  sidePanel: document.getElementById('side-panel'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  btnCloseSidePanel: document.getElementById('btn-close-side-panel'),
  btnReopenPanel: document.getElementById('btn-reopen-panel'),
  
  btnSelectStart: document.getElementById('btn-select-start'),
  labelStartPoint: document.getElementById('label-start-point'),
  btnSelectDest: document.getElementById('btn-select-dest'),
  labelDestPoint: document.getElementById('label-dest-point'),
  btnSwapPoints: document.getElementById('btn-swap-points'),
  btnFindRoute: document.getElementById('btn-find-route'),
  
  directionsContainer: document.getElementById('directions-container'),
  routeStepList: document.getElementById('route-step-list'),
  routeEstTime: document.getElementById('route-est-time'),
  routeEstDist: document.getElementById('route-est-dist'),
  btnClearRoute: document.getElementById('btn-clear-route'),
  
  circleDetailCard: document.getElementById('circle-detail-card'),
  detailBanner: document.getElementById('detail-banner'),
  detailCode: document.getElementById('detail-code'),
  detailName: document.getElementById('detail-name'),
  detailTags: document.getElementById('detail-tags'),
  detailFandom: document.getElementById('detail-fandom'),
  btnDetailStar: document.getElementById('btn-detail-star'),
  btnSetAsDest: document.getElementById('btn-set-as-dest'),
  btnSetAsStart: document.getElementById('btn-set-as-start'),
  detailSocials: document.getElementById('detail-socials'),
  
  globalSearchInput: document.getElementById('global-search-input'),
  autocompleteModal: document.getElementById('autocomplete-modal'),
  modalSearchInput: document.getElementById('modal-search-input'),
  autocompleteResults: document.getElementById('autocomplete-results'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  
  wishlistModal: document.getElementById('wishlist-modal'),
  btnOpenWishlist: document.getElementById('btn-open-wishlist'),
  btnCloseWishlist: document.getElementById('btn-close-wishlist'),
  wishlistItemsContainer: document.getElementById('wishlist-items-container'),
  wishlistCount: document.getElementById('wishlist-count'),
  btnClearWishlist: document.getElementById('btn-clear-wishlist'),
  
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnResetMap: document.getElementById('btn-reset-map'),
  btnLocateEntrance: document.getElementById('btn-locate-entrance'),
  filterChips: document.querySelectorAll('.filter-chip')
};

// Initialize Application
async function init() {
  loadWishlistFromStorage();
  
  // Load data files
  try {
    const [circlesRes, coordsRes, fandomRes, rallyRes] = await Promise.all([
      fetch('circles_optimized.json'),
      fetch('booth_coordinates.json'),
      fetch('fandom_index.json'),
      fetch('stamp_rallies.json')
    ]);
    state.circles = await circlesRes.json();
    state.coordsData = await coordsRes.json();
    state.fandomIndex = await fandomRes.json();
    state.stampRallies = await rallyRes.json();
    console.log(`Loaded ${state.circles.length} circles and booth coordinates.`);
  } catch (err) {
    console.error('Error loading data:', err);
  }

  // Set default starting point to Front Entrance / Lost & Found
  if (state.coordsData && state.coordsData.landmarks) {
    const defaultEntrance = state.coordsData.landmarks['ENTRANCE_LOST_FOUND'];
    state.startPoint = {
      type: 'landmark',
      id: 'ENTRANCE_LOST_FOUND',
      name: defaultEntrance.name,
      x: defaultEntrance.x,
      y: defaultEntrance.y
    };
    updateStartLabel();
  }

  initBlockAndFandomUI();
  initMobileSheetGestures();
  initStampRallyUI();
  initUniversalModalEvents();
  updateWishlistBadge();
  initHallJumpBar();
  setupEventListeners();
  setupMapInteraction();

  // Query param test triggers
  const params = new URLSearchParams(window.location.search);
  if (params.get("test") === "modal") {
    setTimeout(() => {
      const c = state.circles.find(item => item.code.includes("AA-04") || item.code.includes("C-24"));
      const coords = state.coordsData?.booths[c.code] || findBoothCoords(c.code);
      if (c && coords) openCircleModal(c, coords);
    }, 600);
  } else if (params.get("test") === "fandom") {
    setTimeout(() => {
      document.querySelector("[data-tab=\"tab-fandom\"]").click();
      setTimeout(() => selectFandom("Genshin Impact"), 300);
    }, 600);
  }

  
  // Set initial map position centered near Entrance
  resetMapView();
  renderPins();
  
  if (window.lucide) {
    lucide.createIcons();
  }
}

// -----------------------------------------------------------------------------
// Map Pan & Zoom Engine
// -----------------------------------------------------------------------------
function setupMapInteraction() {
  const container = el.mapContainer;

  // Mouse drag
  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('.marker-pin') || e.target.closest('.map-controls')) return;
    state.isDragging = true;
    state.dragStartX = e.clientX - state.panX;
    state.dragStartY = e.clientY - state.panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    state.panX = e.clientX - state.dragStartX;
    state.panY = e.clientY - state.dragStartY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    state.isDragging = false;
  });

  // Wheel zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    zoomAtPoint(zoomFactor, e.clientX, e.clientY);
  }, { passive: false });

  // Touch Support (Pinch to zoom & single finger pan)
  let initialTouchDist = null;
  let initialScale = 1;
  let touchStartCenter = { x: 0, y: 0 };

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      state.isDragging = true;
      state.dragStartX = e.touches[0].clientX - state.panX;
      state.dragStartY = e.touches[0].clientY - state.panY;
    } else if (e.touches.length === 2) {
      state.isDragging = false;
      initialTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialScale = state.scale;
      touchStartCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && state.isDragging) {
      state.panX = e.touches[0].clientX - state.dragStartX;
      state.panY = e.touches[0].clientY - state.dragStartY;
      applyTransform();
    } else if (e.touches.length === 2 && initialTouchDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const newScale = Math.min(Math.max(initialScale * (dist / initialTouchDist), 0.25), 3.5);
      const scaleDelta = newScale / state.scale;
      zoomAtPoint(scaleDelta, touchStartCenter.x, touchStartCenter.y);
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    state.isDragging = false;
    initialTouchDist = null;
  });

  // Click on map container to select booth near cursor
  container.addEventListener('click', (e) => {
    if (e.target.closest('.marker-pin') || e.target.closest('.map-controls') || e.target.closest('.top-nav')) return;
    
    // Convert click clientXY to Map Coordinates
    const rect = container.getBoundingClientRect();
    const clickScreenX = e.clientX - rect.left;
    const clickScreenY = e.clientY - rect.top;
    
    const mapX = (clickScreenX - state.panX) / state.scale * (MAP_WIDTH / el.floormapImg.clientWidth);
    const mapY = (clickScreenY - state.panY) / state.scale * (MAP_HEIGHT / el.floormapImg.clientHeight);
    
    findNearestBoothOrLandmark(mapX, mapY);
  });
}

function zoomAtPoint(factor, clientX, clientY) {
  const containerRect = el.mapContainer.getBoundingClientRect();
  const originX = clientX - containerRect.left;
  const originY = clientY - containerRect.top;

  const newScale = Math.min(Math.max(state.scale * factor, 0.25), 3.5);
  state.panX = originX - (originX - state.panX) * (newScale / state.scale);
  state.panY = originY - (originY - state.panY) * (newScale / state.scale);
  state.scale = newScale;
  applyTransform();
}

function applyTransform() {
  el.mapCanvasLayer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
}

function resetMapView() {
  const container = el.mapContainer;
  const cWidth = container.clientWidth;
  const cHeight = container.clientHeight;
  const isMobile = window.innerWidth <= 768;

  const imgW = el.floormapImg.clientWidth || 2400;
  const imgH = el.floormapImg.clientHeight || 1137;

  if (isMobile) {
    state.scale = 0.85; // readable scale for phone screens
    // Focus in upper-middle of screen so bottom sheet doesn't occlude the entrance
    state.panX = cWidth / 2 - (imgW * 0.88) * state.scale;
    state.panY = (cHeight * 0.4) - (imgH * 0.52) * state.scale;
  } else {
    const fitScale = Math.min(cWidth / 2400, cHeight / 1137) * 1.1;
    state.scale = Math.max(fitScale, 0.45);
    const sidebarOffset = !el.sidePanel.classList.contains("collapsed") ? 190 : 0;
    state.panX = (cWidth / 2 + sidebarOffset) - (imgW * 0.88) * state.scale;
    state.panY = cHeight / 2 - (imgH * 0.52) * state.scale;
  }
  applyTransform();
}

function panToCoordinate(mapX, mapY, targetScale = 1.2) {
  const container = el.mapContainer;
  const cWidth = container.clientWidth;
  const cHeight = container.clientHeight;
  
  state.scale = targetScale;
  
  const imgW = el.floormapImg.clientWidth;
  const imgH = el.floormapImg.clientHeight;
  
  const screenX = (mapX / MAP_WIDTH) * imgW;
  const screenY = (mapY / MAP_HEIGHT) * imgH;
  
  // Offset to the right if sidebar is open on desktop (> 768px)
  const sidebarOffset = (window.innerWidth > 768 && !el.sidePanel.classList.contains("collapsed")) ? 190 : 0;
  
  state.panX = (cWidth / 2 + sidebarOffset) - screenX * state.scale;
  state.panY = cHeight / 2 - screenY * state.scale;
  
  applyTransform();
}

// -----------------------------------------------------------------------------
// Landmark & Booth Search / Selection
// -----------------------------------------------------------------------------
function findNearestBoothOrLandmark(mapX, mapY) {
  if (!state.coordsData) return;
  
  let closest = null;
  let minDist = 120; // max click radius in map coords

  // Check landmarks
  for (const [key, lm] of Object.entries(state.coordsData.landmarks)) {
    const d = Math.hypot(lm.x - mapX, lm.y - mapY);
    if (d < minDist) {
      minDist = d;
      closest = { type: 'landmark', data: lm, key };
    }
  }

  // Check booths
  for (const [code, b] of Object.entries(state.coordsData.booths)) {
    const d = Math.hypot(b.x - mapX, b.y - mapY);
    if (d < minDist) {
      minDist = d;
      const circleInfo = state.circles.find(c => c.code === code);
      closest = { type: 'booth', data: b, code, circle: circleInfo };
    }
  }

  if (closest) {
    if (closest.type === 'booth' && closest.circle) {
      showCircleDetails(closest.circle, closest.data);
    } else if (closest.type === 'landmark') {
      // Set as destination
      selectDestination({
        type: 'landmark',
        id: closest.key,
        name: closest.data.name,
        x: closest.data.x,
        y: closest.data.y
      });
    }
  }
}

function showCircleDetails(circle, boothCoords) {
  state.selectedCircle = { ...circle, coords: boothCoords };
  
  el.circleDetailCard.style.display = 'flex';
  if (el.circleDetailCard.parentElement) {
    el.circleDetailCard.parentElement.prepend(el.circleDetailCard);
  }
  const pc = document.querySelector('.panel-content');
  if (pc) pc.scrollTop = 0;
  setTimeout(() => {
    el.circleDetailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
  el.detailCode.textContent = circle.code;
  el.detailName.textContent = circle.name;
  el.detailFandom.textContent = [circle.fandom, circle.other_fandom].filter(Boolean).join(' • ') || 'General / Original';
  
  if (circle.cut) {
    el.detailBanner.src = circle.cut;
    el.detailBanner.style.display = 'block';
  } else {
    el.detailBanner.style.display = 'none';
  }
  
  // Render general tags
  const tagsHtml = [];
  if (circle.day) tagsHtml.push(`<span class="tag-item highlight">${circle.day}</span>`);
  if (circle.rating && circle.rating !== "General") tagsHtml.push(`<span class="tag-item" style="color: #f87171;">${circle.rating}</span>`);
  if (boothCoords && boothCoords.hall) tagsHtml.push(`<span class="tag-item">Hall ${boothCoords.hall}</span>`);
  el.detailTags.innerHTML = tagsHtml.join('');

  // 1. Items Offered Badges
  const itemsContainer = document.getElementById("detail-items-container");
  const itemsTags = document.getElementById("detail-items-tags");
  const itemBadges = [];

  const ITEM_LABELS = {
    "artbook": "🎨 Artbook / Ilustrasi",
    "goods": "✨ Merchandise / Goods (Ganci, Standee, Stiker)",
    "comic": "📖 Komik / Doujinshi",
    "novel": "📚 Light Novel / Fiksimini",
    "game": "🎮 Video Game / TCG",
    "music": "🎵 Musik / CD Album",
    "handmade-crafts": "🧵 Handmade Crafts / Aksesoris",
    "photobook-cosplay": "🎭 Cosplay Photobook / Cheki",
    "commission": "✏️ Open Commission"
  };

  if (circle.items_offered && Array.isArray(circle.items_offered)) {
    circle.items_offered.forEach(item => {
      const label = ITEM_LABELS[item] || item.toUpperCase();
      itemBadges.push(`<span class="tag-item highlight" style="font-size: 11px;">${label}</span>`);
    });
  } else {
    // Fallback to boolean flags
    if (circle.goods) itemBadges.push('<span class="tag-item highlight">✨ Merchandise / Goods</span>');
    if (circle.artbook) itemBadges.push('<span class="tag-item highlight">🎨 Artbook</span>');
    if (circle.comic) itemBadges.push('<span class="tag-item highlight">📖 Komik</span>');
    if (circle.craft) itemBadges.push('<span class="tag-item highlight">🧵 Handmade Crafts</span>');
    if (circle.novel) itemBadges.push('<span class="tag-item highlight">📚 Novel</span>');
    if (circle.game) itemBadges.push('<span class="tag-item highlight">🎮 Game / TCG</span>');
    if (circle.music) itemBadges.push('<span class="tag-item highlight">🎵 Musik</span>');
    if (circle.cosplay) itemBadges.push('<span class="tag-item highlight">🎭 Cosplay</span>');
    if (circle.commission) itemBadges.push('<span class="tag-item highlight">✏️ Commission</span>');
  }

  if (itemBadges.length > 0) {
    itemsContainer.style.display = 'block';
    itemsTags.innerHTML = itemBadges.join('');
  } else {
    itemsContainer.style.display = 'none';
  }

  // 1.5. Merchandise Sample Photos Gallery
  const galleryContainer = document.getElementById("detail-gallery-container");
  const galleryStrip = document.getElementById("detail-gallery-strip");
  const sampleImages = circle.sample_images || [];

  if (sampleImages.length > 0) {
    galleryContainer.style.display = 'block';
    galleryStrip.innerHTML = sampleImages.map(imgUrl => `
      <div class="gallery-thumb-item" data-full-url="${imgUrl}">
        <img class="gallery-thumb-img" src="${imgUrl}" alt="Sample Item" loading="lazy" onerror="this.parentElement.style.display='none'">
      </div>
    `).join('');

    galleryStrip.querySelectorAll(".gallery-thumb-item").forEach(item => {
      item.addEventListener("click", () => {
        openLightbox(item.dataset.fullUrl);
      });
    });
  } else {
    galleryContainer.style.display = 'none';
  }


  // 2. Pre-Order & Online Catalogue Links
  const linksContainer = document.getElementById("detail-links-container");
  const poLinks = document.getElementById("detail-po-links");
  const linkList = circle.catalogue_links || [];
  if (linkList.length > 0 || circle.market) {
    linksContainer.style.display = 'block';
    const linkItems = [];
    linkList.forEach(l => {
      linkItems.push(`<a href="${l.url}" target="_blank" class="po-link-btn">📝 ${l.label} ↗</a>`);
    });
    if (circle.market && !linkList.some(l => l.url === circle.market)) {
      linkItems.push(`<a href="${circle.market}" target="_blank" class="po-link-btn">🛍️ Marketplace / Katalog Online ↗</a>`);
    }
    poLinks.innerHTML = linkItems.join('');
  } else {
    linksContainer.style.display = 'none';
  }

  // 3. Social Media Posts & Announcements (Instagram / X)
  const postsContainer = document.getElementById("detail-posts-container");
  const postsList = document.getElementById("detail-posts-list");
  const postList = circle.catalogue_posts || [];
  if (postList.length > 0) {
    postsContainer.style.display = 'block';
    postsList.innerHTML = postList.map(p => {
      const cleanText = p.text ? p.text.replace(/\n/g, '<br>') : '';
      return `
        <div class="detail-post-card">
          <div>${cleanText}</div>
          ${p.url ? `<a href="${p.url}" target="_blank" class="detail-post-link">Buka Postingan ↗</a>` : ''}
        </div>
      `;
    }).join('');
  } else {
    postsContainer.style.display = 'none';
  }

  // 4. Social Links & Profiles
  const socHtml = [];
  if (circle.tw) socHtml.push(`<a href="${circle.tw}" target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;">Twitter/X</a>`);
  if (circle.ig) socHtml.push(`<a href="${circle.ig}" target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;">Instagram</a>`);
  if (circle.yt && circle.yt !== "-") socHtml.push(`<a href="${circle.yt}" target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;">YouTube</a>`);
  if (circle.fb && circle.fb !== "-") socHtml.push(`<a href="${circle.fb}" target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;">Facebook</a>`);

  // Extra socials from enrich
  if (circle.extra_socials) {
    circle.extra_socials.forEach(s => {
      if (!socHtml.some(h => h.includes(s.url))) {
        socHtml.push(`<a href="${s.url}" target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;">${s.platform}</a>`);
      }
    });
  }

  el.detailSocials.innerHTML = socHtml.join('') || '<span style="font-size: 11px; color: #64748b;">Tidak ada link medsos publik</span>';

  updateDetailStarButton();
  
  if (boothCoords) {
    panToCoordinate(boothCoords.x, boothCoords.y, 1.4);
  }

  setSidebarCollapsed(false);
  setMobileSheetState('half');
  if (pc) pc.scrollTop = 0;
}

function calculateRoute(start, dest) {
  if (!start || !dest) return null;

  const x1 = start.x;
  const y1 = start.y;
  const x2 = dest.x;
  const y2 = dest.y;

  // Major horizontal walking corridors (Ground Truth measured from floormap.png)
  const CORRIDOR_NORTH = 830.0;     // Back corridor behind booths
  const CORRIDOR_MID = 1580.0;      // Cross aisle walkway in middle
  const CORRIDOR_SOUTH = 2320.0;    // Main south hall corridor (near hall doors)
  const CORRIDOR_LOBBY = 2466.0;    // Outer lobby entrance walkway

  const path = [[x1, y1]];

  // 1. If start is outside in the lobby (like Entrance)
  if (y1 > 2400) {
    // Walk to the nearest hall door on the South Corridor
    path.push([x1, CORRIDOR_LOBBY]);
    path.push([x1, CORRIDOR_SOUTH]);
  }

  // 2. Choose the optimal horizontal corridor (North, Mid, or South) to travel between columns
  // Whichever corridor minimizes vertical walking detours
  const avgY = (y1 + y2) / 2.0;
  let chosenCorridor = CORRIDOR_MID;
  
  if (Math.abs(avgY - CORRIDOR_SOUTH) < Math.abs(avgY - CORRIDOR_MID) && Math.abs(avgY - CORRIDOR_SOUTH) < Math.abs(avgY - CORRIDOR_NORTH)) {
    chosenCorridor = CORRIDOR_SOUTH;
  } else if (Math.abs(avgY - CORRIDOR_NORTH) < Math.abs(avgY - CORRIDOR_MID)) {
    chosenCorridor = CORRIDOR_NORTH;
  }

  // Walk vertically to chosen corridor
  const lastPoint = path[path.length - 1];
  if (Math.abs(lastPoint[1] - chosenCorridor) > 30) {
    path.push([lastPoint[0], chosenCorridor]);
  }

  // Traverse horizontally along corridor to destination's column
  path.push([x2, chosenCorridor]);

  // Walk vertically into destination aisle
  path.push([x2, y2]);

  return path;
}

function renderRouteOnSvg(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    el.routeMainPath.setAttribute('d', '');
    el.routeGlowPath.setAttribute('d', '');
    return;
  }

  // Construct SVG Path 'd'
  let d = `M ${pathPoints[0][0]} ${pathPoints[0][1]}`;
  for (let i = 1; i < pathPoints.length; i++) {
    d += ` L ${pathPoints[i][0]} ${pathPoints[i][1]}`;
  }

  el.routeMainPath.setAttribute('d', d);
  el.routeGlowPath.setAttribute('d', d);
}

function generateTurnByTurnSteps(start, dest, path) {
  const steps = [];
  
  // Step 1: Origin
  steps.push({
    title: `Mulai dari ${start.name}`,
    desc: 'Persiapkan barang bawaan dan pastikan gelang tiket terpasang.'
  });

  // Step 2: Transition from Entrance
  if (start.id === "ENTRANCE_LOST_FOUND" || start.x > 6000) {
    steps.push({
      title: "Masuk melalui Gate Pintu Utama Hall 10",
      desc: "Melewati area antrean / turnstiles pemeriksaan tiket di sebelah Luggage Deposit & Lost-Found menuju lorong Hall 10."
    });
  } else if (start.y > 2400) {
    steps.push({
      title: "Masuk melalui Pintu Lobi Selatan",
      desc: "Berjalan dari lobi depan melewati gate pemeriksaan tiket menuju selasar utama."
    });
  }

  // Step 3: Horizontal movement
  const dx = dest.x - start.x;
  const direction = dx > 0 ? 'kanan (ke arah timur / Hall 9-10)' : 'kiri (ke arah barat / Hall 5-6)';
  const distMeters = Math.round(Math.abs(dx) * 0.08); // rough scale: 1 px ≈ 0.08 meter
  
  if (distMeters > 15) {
    steps.push({
      title: `Jalan lurus ke arah ${direction}`,
      desc: `Telusuri lorong utama sejauh ±${distMeters} meter menuju deretan blok tujuan.`
    });
  }

  // Step 4: Turn into booth aisle
  if (dest.type === 'booth') {
    const bCode = dest.code || '';
    const bSide = dest.x > (dest.blockX || dest.x) ? 'sisi kanan' : 'sisi kiri';
    steps.push({
      title: `Belok masuk ke lorong ${dest.name}`,
      desc: `Cari papan nomor booth ${bCode}. Booth berada di ${bSide} lorong.`
    });
  } else {
    steps.push({
      title: `Menuju area ${dest.name}`,
      desc: 'Anda telah tiba di zona fasilitas yang dituju.'
    });
  }

  // Step 5: Arrival
  steps.push({
    title: `Sampai di tujuan: ${dest.name}`,
    desc: 'Selamat berbelanja & dukung kreator favoritmu!'
  });

  return steps;
}

function executeRoutePlanning() {
  if (!state.startPoint || !state.destPoint) {
    alert('Silakan pilih titik awal dan booth tujuan terlebih dahulu!');
    return;
  }

  const path = calculateRoute(state.startPoint, state.destPoint);
  state.activeRoute = path;
  
  renderRouteOnSvg(path);
  renderPins();

  // Calculate distance & estimated walking time
  let totalDistPx = 0;
  for (let i = 0; i < path.length - 1; i++) {
    totalDistPx += Math.hypot(path[i+1][0] - path[i][0], path[i+1][1] - path[i][1]);
  }
  const meters = Math.round(totalDistPx * 0.08);
  const minutes = Math.max(1, Math.round(meters / 60)); // ~60m / minute convention walk speed

  el.routeEstDist.textContent = `${meters} m`;
  el.routeEstTime.textContent = `~${minutes} menit`;

  // Render steps
  const steps = generateTurnByTurnSteps(state.startPoint, state.destPoint, path);
  el.routeStepList.innerHTML = steps.map(s => `
    <div class="step-item">
      <div class="step-bullet"></div>
      <div>
        <div style="font-weight: 700; color: #fff;">${s.title}</div>
        <div style="color: #94a3b8; font-size: 11.5px; margin-top: 2px;">${s.desc}</div>
      </div>
    </div>
  `).join('');

  el.directionsContainer.style.display = 'flex';
  setSidebarCollapsed(false);

  // Zoom map to encompass the route
  const minX = Math.min(...path.map(p => p[0]));
  const maxX = Math.max(...path.map(p => p[0]));
  const minY = Math.min(...path.map(p => p[1]));
  const maxY = Math.max(...path.map(p => p[1]));
  
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  
  const spanX = Math.max(maxX - minX, 800);
  const spanY = Math.max(maxY - minY, 500);
  
  const fitScale = Math.min(
    el.mapContainer.clientWidth / (spanX * 1.5),
    el.mapContainer.clientHeight / (spanY * 1.5),
    1.6
  );

  panToCoordinate(midX, midY, Math.min(Math.max(fitScale, 0.5), 1.2));
}

// -----------------------------------------------------------------------------
// Pins & Markers Layer
// -----------------------------------------------------------------------------
function renderPins() {
  const container = el.pinsLayer;
  container.innerHTML = '';

  const imgW = el.floormapImg.clientWidth;
  const imgH = el.floormapImg.clientHeight;

  function toScreenPercent(x, y) {
    return {
      left: `${(x / MAP_WIDTH) * 100}%`,
      top: `${(y / MAP_HEIGHT) * 100}%`
    };
  }

  // 1. Start Marker
  if (state.startPoint) {
    const pos = toScreenPercent(state.startPoint.x, state.startPoint.y);
    const pin = document.createElement('div');
    pin.className = 'marker-pin';
    pin.style.left = pos.left;
    pin.style.top = pos.top;
    pin.innerHTML = `
      <div class="pin-beacon beacon-start" title="Awal: ${state.startPoint.name}">
        <i data-lucide="map-pin" style="width: 18px; height: 18px;"></i>
        <div class="beacon-pulse"></div>
      </div>
    `;
    container.appendChild(pin);
  }

  // 2. Destination Marker
  if (state.destPoint) {
    const pos = toScreenPercent(state.destPoint.x, state.destPoint.y);
    const pin = document.createElement('div');
    pin.className = 'marker-pin';
    pin.style.left = pos.left;
    pin.style.top = pos.top;
    pin.innerHTML = `
      <div class="pin-beacon beacon-dest" title="Tujuan: ${state.destPoint.name}">
        <i data-lucide="navigation-2" style="width: 18px; height: 18px;"></i>
        <div class="beacon-pulse"></div>
      </div>
    `;
    container.appendChild(pin);
  }

  if (window.lucide) {
    lucide.createIcons({ root: container });
  }
}

// -----------------------------------------------------------------------------
// Selection & Autocomplete Modal
// -----------------------------------------------------------------------------
function openSelectionModal(target) {
  state.currentModalTarget = target;
  el.autocompleteModal.classList.add('active');
  el.modalSearchInput.value = '';
  el.modalSearchInput.focus();
  renderAutocompleteList('');
}

function closeSelectionModal() {
  el.autocompleteModal.classList.remove('active');
}


function renderFilteredList(category) {
  const list = el.autocompleteResults;
  list.innerHTML = "";
  const matches = state.circles.filter(c => {
    if (category === "corporate") return c.is_corporate;
    return Boolean(c[category]);
  }).slice(0, 50);

  if (matches.length === 0) {
    list.innerHTML = `<div style="padding: 24px; text-align: center; color: #64748b; font-size: 13px;">Tidak ada booth dengan kategori ${category}.</div>`;
    return;
  }

  list.innerHTML = matches.map(c => {
    const coords = state.coordsData?.booths[c.code];
    return `
      <div class="autocomplete-item" data-id="${c.code}" data-type="booth">
        <div class="item-left">
          <i data-lucide="${c.is_corporate ? "building-2" : "store"}" style="color: ${c.is_corporate ? "#f59e0b" : "#38bdf8"}; width: 18px; height: 18px;"></i>
          <div>
            <div class="item-name">${c.code} - ${c.name}</div>
            <div class="item-fandom">${c.fandom || c.other_fandom || "Exhibition"}</div>
          </div>
        </div>
        <span class="tag-item" style="${c.is_corporate ? "color: #f59e0b; border-color: rgba(245,158,11,0.3);" : ""}">${coords ? `Hall ${coords.hall}` : (c.is_corporate ? "Hall 10" : "Booth")}</span>
      </div>
    `;
  }).join("");

  if (window.lucide) {
    lucide.createIcons({ root: list });
  }

  list.querySelectorAll(".autocomplete-item").forEach(elItem => {
    elItem.addEventListener("click", () => {
      const code = elItem.dataset.id;
      const circle = state.circles.find(c => c.code === code);
      const coords = state.coordsData?.booths[code];
      if (circle && coords) {
        selectDestination({
          type: "booth",
          id: code,
          code,
          name: `${code} - ${circle.name}`,
          x: coords.x,
          y: coords.y,
          circle,
          coords
        });
        showCircleDetails(circle, coords);
        closeSelectionModal();
      }
    });
  });
}

function renderAutocompleteList(query) {
  const q = query.toLowerCase().trim();
  const list = el.autocompleteResults;
  list.innerHTML = '';

  const results = [];

  // Match landmarks
  if (state.coordsData && state.coordsData.landmarks) {
    for (const [key, lm] of Object.entries(state.coordsData.landmarks)) {
      if (!q || lm.name.toLowerCase().includes(q) || lm.desc.toLowerCase().includes(q)) {
        results.push({
          type: 'landmark',
          id: key,
          name: lm.name,
          subtitle: lm.desc,
          badge: lm.hall === 'Lobby' ? 'LOBI' : `HALL ${lm.hall}`,
          x: lm.x,
          y: lm.y
        });
      }
    }
  }

  // Match circles with relevance scoring
  if (state.circles) {
    const scoredCircles = [];
    for (const c of state.circles) {
      const cCode = c.code.toLowerCase();
      const cName = c.name.toLowerCase();
      const cFandom = (c.fandom + ' ' + (c.other_fandom || '')).toLowerCase();
      const cPosts = (c.catalogue_posts || []).map(p => p.text).join(' ').toLowerCase();
      const cItems = (c.items_offered || []).join(' ').toLowerCase();
      
      let score = 0;
      if (!q) {
        score = 1;
      } else if (cCode === q || cName === q) {
        score = 100;
      } else if (cCode.startsWith(q) || cName.startsWith(q)) {
        score = 80;
      } else if (cName.includes(' ' + q)) {
        score = 60;
      } else if (cCode.includes(q)) {
        score = 50;
      } else if (cName.includes(q)) {
        score = 40;
      } else if (cFandom.includes(q)) {
        score = 25;
      } else if (cItems.includes(q)) {
        score = 20;
      } else if (cPosts.includes(q)) {
        score = 15;
      }

      if (c.is_corporate && score > 0) {
        score += 15; // boost corporate booths when matching
      }

      if (score > 0) {
        const coords = state.coordsData?.booths[c.code];
        if (coords) {
          scoredCircles.push({
            score,
            type: 'booth',
            id: c.code,
            code: c.code,
            name: `${c.code} - ${c.name}`,
            subtitle: c.fandom ? `Fandom: ${c.fandom}` : (c.is_corporate ? 'Corporate Area' : (c.day || 'Circle Space')),
            badge: `Hall ${coords.hall}`,
            x: coords.x,
            y: coords.y,
            circle: c,
            coords
          });
        }
      }
    }

    scoredCircles.sort((a, b) => b.score - a.score);
    for (const item of scoredCircles.slice(0, 50)) {
      results.push(item);
    }
  }

  if (results.length === 0) {
    list.innerHTML = '<div style="padding: 24px; text-align: center; color: #64748b; font-size: 13px;">Tidak ada booth atau lokasi yang cocok.</div>';
    return;
  }

  list.innerHTML = results.map(item => `
    <div class="autocomplete-item" data-id="${item.id}" data-type="${item.type}">
      <div class="item-left">
        <i data-lucide="${item.type === 'landmark' ? 'landmark' : 'store'}" style="color: ${item.type === 'landmark' ? '#10b981' : '#38bdf8'}; width: 18px; height: 18px;"></i>
        <div>
          <div class="item-name">${item.name}</div>
          <div class="item-fandom">${item.subtitle}</div>
        </div>
      </div>
      <span class="tag-item">${item.badge}</span>
    </div>
  `).join('');

  if (window.lucide) {
    lucide.createIcons({ root: list });
  }

  // Click on item
  list.querySelectorAll('.autocomplete-item').forEach(elItem => {
    elItem.addEventListener('click', () => {
      const id = elItem.dataset.id;
      const type = elItem.dataset.type;
      const match = results.find(r => r.id === id && r.type === type);
      if (match) {
        if (state.currentModalTarget === 'start') {
          selectStartPoint(match);
        } else {
          selectDestination(match);
          if (match.circle) {
            showCircleDetails(match.circle, match.coords);
          }
        }
        closeSelectionModal();
      }
    });
  });
}

function selectStartPoint(item) {
  state.startPoint = item;
  updateStartLabel();
  renderPins();
}

function selectDestination(item) {
  state.destPoint = item;
  updateDestLabel();
  renderPins();
}

function updateStartLabel() {
  if (state.startPoint) {
    el.labelStartPoint.textContent = state.startPoint.name;
    el.labelStartPoint.style.color = '#fff';
  } else {
    el.labelStartPoint.textContent = 'Pilih posisi awal...';
    el.labelStartPoint.style.color = '#94a3b8';
  }
}

function updateDestLabel() {
  if (state.destPoint) {
    el.labelDestPoint.textContent = state.destPoint.name;
    el.labelDestPoint.style.color = '#fff';
  } else {
    el.labelDestPoint.textContent = 'Pilih booth tujuan...';
    el.labelDestPoint.style.color = '#94a3b8';
  }
}

// -----------------------------------------------------------------------------
// Wishlist Engine
// -----------------------------------------------------------------------------
function loadWishlistFromStorage() {
  try {
    const raw = localStorage.getItem('cf23_wishlist');
    if (raw) {
      state.wishlist = new Set(JSON.parse(raw));
    }
  } catch (e) {
    state.wishlist = new Set();
  }
  updateWishlistCountBadge();
}

function saveWishlistToStorage() {
  localStorage.setItem('cf23_wishlist', JSON.stringify(Array.from(state.wishlist)));
  updateWishlistCountBadge();
  updateDetailStarButton();
}

function toggleWishlist(code) {
  if (state.wishlist.has(code)) {
    state.wishlist.delete(code);
    updateWishlistBadge();
  } else {
    state.wishlist.add(code);
    updateWishlistBadge();
  }
  saveWishlistToStorage();
}

function updateWishlistCountBadge() {
  el.wishlistCount.textContent = state.wishlist.size;
}

function updateDetailStarButton() {
  if (!state.selectedCircle) return;
  const isStarred = state.wishlist.has(state.selectedCircle.code);
  el.btnDetailStar.innerHTML = `<i data-lucide="star" style="width: 16px; height: 16px; color: #fbbf24; fill: ${isStarred ? '#fbbf24' : 'none'};"></i>`;
  if (window.lucide) {
    lucide.createIcons({ root: el.btnDetailStar });
  }
}

function openWishlistModal() {
  el.wishlistModal.classList.add('active');
  const container = el.wishlistItemsContainer;
  container.innerHTML = '';

  if (state.wishlist.size === 0) {
    container.innerHTML = '<div style="padding: 32px; text-align: center; color: #64748b; font-size: 13.5px;">Belum ada booth favorit yang disimpan.<br>Klik ikon bintang pada detail booth untuk menyimpan ke sini!</div>';
    return;
  }

  const starredCircles = state.circles.filter(c => state.wishlist.has(c.code));
  container.innerHTML = starredCircles.map(c => {
    const coords = state.coordsData?.booths[c.code];
    return `
      <div class="autocomplete-item" data-code="${c.code}">
        <div class="item-left">
          <button class="btn-icon btn-remove-star" data-code="${c.code}" style="width: 28px; height: 28px; background: transparent; border: none;" title="Hapus dari Wishlist">
            <i data-lucide="star" style="width: 16px; height: 16px; color: #fbbf24; fill: #fbbf24;"></i>
          </button>
          <div>
            <div class="item-name">${c.code} - ${c.name}</div>
            <div class="item-fandom">${c.fandom || c.day || 'Circle Space'}</div>
          </div>
        </div>
        <button class="btn-primary btn-route-to-star" data-code="${c.code}" style="padding: 6px 12px; font-size: 12px;">
          <span>Rute</span>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons({ root: container });
  }

  // Wishlist event handlers
  container.querySelectorAll('.btn-remove-star').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(b.dataset.code);
      openWishlistModal(); // re-render
    });
  });

  container.querySelectorAll('.btn-route-to-star').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = b.dataset.code;
      const circle = state.circles.find(c => c.code === code);
      const coords = state.coordsData?.booths[code];
      if (circle && coords) {
        selectDestination({
          type: 'booth',
          id: code,
          code,
          name: `${code} - ${circle.name}`,
          x: coords.x,
          y: coords.y,
          circle,
          coords
        });
        showCircleDetails(circle, coords);
        el.wishlistModal.classList.remove('active');
        executeRoutePlanning();
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Global Event Listeners
// -----------------------------------------------------------------------------
function setupEventListeners() {
  const btnCloseLb = document.getElementById("btn-close-lightbox");
  if (btnCloseLb) btnCloseLb.addEventListener("click", closeLightbox);
  const lbModal = document.getElementById("image-lightbox-modal");
  if (lbModal) {
    lbModal.addEventListener("click", (e) => {
      if (e.target === lbModal) closeLightbox();
    });
  }

  // Sidebar toggles

  el.btnToggleSidebar.addEventListener('click', () => {
    const isNowCollapsed = !el.sidePanel.classList.contains('collapsed');
    setSidebarCollapsed(isNowCollapsed);
  });

  el.btnCloseSidePanel.addEventListener('click', () => {
    setSidebarCollapsed(true);
  });

  if (el.btnReopenPanel) {
    el.btnReopenPanel.addEventListener('click', () => {
      setSidebarCollapsed(false);
    });
  }

  // Start & Destination selector buttons
  el.btnSelectStart.addEventListener('click', () => openSelectionModal('start'));
  el.btnSelectDest.addEventListener('click', () => openSelectionModal('dest'));

  // Swap Start & Destination
  el.btnSwapPoints.addEventListener('click', () => {
    const temp = state.startPoint;
    state.startPoint = state.destPoint;
    state.destPoint = temp;
    updateStartLabel();
    updateDestLabel();
    renderPins();
    if (state.activeRoute) {
      executeRoutePlanning();
    }
  });

  // Calculate Route button
  el.btnFindRoute.addEventListener('click', executeRoutePlanning);

  // Clear Route
  el.btnClearRoute.addEventListener('click', () => {
    state.activeRoute = null;
    renderRouteOnSvg(null);
    el.directionsContainer.style.display = 'none';
  });

  // Detail Card Actions
  const btnCloseCard = document.getElementById('btn-close-detail-card');
  if (btnCloseCard) {
    btnCloseCard.addEventListener('click', () => {
      el.circleDetailCard.style.display = 'none';
    });
  }

  el.btnDetailStar.addEventListener('click', () => {
    if (state.selectedCircle) {
      toggleWishlist(state.selectedCircle.code);
    }
  });

  el.btnSetAsDest.addEventListener('click', () => {
    if (state.selectedCircle) {
      selectDestination({
        type: 'booth',
        id: state.selectedCircle.code,
        code: state.selectedCircle.code,
        name: `${state.selectedCircle.code} - ${state.selectedCircle.name}`,
        x: state.selectedCircle.coords.x,
        y: state.selectedCircle.coords.y,
        circle: state.selectedCircle,
        coords: state.selectedCircle.coords
      });
      executeRoutePlanning();
    }
  });

  el.btnSetAsStart.addEventListener('click', () => {
    if (state.selectedCircle) {
      selectStartPoint({
        type: 'booth',
        id: state.selectedCircle.code,
        code: state.selectedCircle.code,
        name: `${state.selectedCircle.code} - ${state.selectedCircle.name}`,
        x: state.selectedCircle.coords.x,
        y: state.selectedCircle.coords.y
      });
      if (state.activeRoute) {
        executeRoutePlanning();
      }
    }
  });

  // Global search input
  el.globalSearchInput.addEventListener('focus', () => {
    openSelectionModal('dest');
  });

  // Modal search input
  el.modalSearchInput.addEventListener('input', (e) => {
    renderAutocompleteList(e.target.value);
  });

  el.btnCloseModal.addEventListener('click', closeSelectionModal);
  el.autocompleteModal.addEventListener('click', (e) => {
    if (e.target === el.autocompleteModal) closeSelectionModal();
  });

  // Preset Buttons in Modal
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      const lm = state.coordsData?.landmarks[presetKey];
      if (lm) {
        const item = {
          type: 'landmark',
          id: presetKey,
          name: lm.name,
          subtitle: lm.desc,
          badge: lm.hall === 'Lobby' ? 'LOBI' : `HALL ${lm.hall}`,
          x: lm.x,
          y: lm.y
        };
        if (state.currentModalTarget === 'start') {
          selectStartPoint(item);
        } else {
          selectDestination(item);
        }
        closeSelectionModal();
      }
    });
  });

  // Wishlist Modal
  el.btnOpenWishlist.addEventListener('click', openWishlistModal);
  el.btnCloseWishlist.addEventListener('click', () => el.wishlistModal.classList.remove('active'));
  el.wishlistModal.addEventListener('click', (e) => {
    if (e.target === el.wishlistModal) el.wishlistModal.classList.remove('active');
  });

  el.btnClearWishlist.addEventListener('click', () => {
    if (confirm('Yakin ingin mengosongkan seluruh wishlist?')) {
      state.wishlist.clear();
      saveWishlistToStorage();
      openWishlistModal();
    }
  });

  // Map Controls
  el.btnZoomIn.addEventListener('click', () => {
    zoomAtPoint(1.25, el.mapContainer.clientWidth / 2, el.mapContainer.clientHeight / 2);
  });

  el.btnZoomOut.addEventListener('click', () => {
    zoomAtPoint(0.8, el.mapContainer.clientWidth / 2, el.mapContainer.clientHeight / 2);
  });

  el.btnResetMap.addEventListener('click', resetMapView);

  el.btnLocateEntrance.addEventListener('click', () => {
    if (state.coordsData?.landmarks?.ENTRANCE_LOST_FOUND) {
      const lm = state.coordsData.landmarks.ENTRANCE_LOST_FOUND;
      panToCoordinate(lm.x, lm.y, 1.3);
    }
  });

  // Filter Chips
  el.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      el.filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.dataset.filter;
      openSelectionModal('dest');
      if (state.activeFilter === 'corporate') {
        el.modalSearchInput.value = 'corporate';
        renderAutocompleteList('corporate');
      } else if (state.activeFilter !== 'all') {
        renderFilteredList(state.activeFilter);
      } else {
        renderAutocompleteList('');
      }
    });
  });
}

// Start on DOM ready
document.addEventListener('DOMContentLoaded', init);


// -----------------------------------------------------------------------------
// Block & Fandom Explorer Engine
// -----------------------------------------------------------------------------
const CANONICAL_FANDOMS = [
  { name: "Original / OC", tags: ["original", "oc"] },
  { name: "Genshin Impact", tags: ["genshin"] },
  { name: "Honkai: Star Rail", tags: ["star rail", "hsr"] },
  { name: "Blue Archive", tags: ["blue archive", "ba"] },
  { name: "Vocaloid / Hatsune Miku", tags: ["vocaloid", "miku", "project sekai", "proseka"] },
  { name: "Love and Deepspace", tags: ["love and deepspace", "lads"] },
  { name: "Uma Musume", tags: ["uma musume", "umamusume"] },
  { name: "Alien Stage", tags: ["alien stage", "alnst"] },
  { name: "Zenless Zone Zero", tags: ["zenless", "zzz"] },
  { name: "Pokemon", tags: ["pokemon", "pokémon"] },
  { name: "Jujutsu Kaisen", tags: ["jujutsu", "jjk"] },
  { name: "VTuber (Indie & Others)", tags: ["vtuber", "virtual"] },
  { name: "Hololive", tags: ["hololive", "holo"] },
  { name: "Haikyuu!!", tags: ["haikyuu", "haikyu"] },
  { name: "Arknights", tags: ["arknights"] },
  { name: "Wuthering Waves", tags: ["wuthering", "wuwa"] },
  { name: "One Piece", tags: ["one piece"] },
  { name: "Nijisanji", tags: ["nijisanji", "niji"] },
  { name: "Dungeon Meshi", tags: ["dungeon meshi", "delicious in dungeon"] },
  { name: "Limbus Company / Project Moon", tags: ["limbus", "project moon"] },
  { name: "Fate / Type-Moon", tags: ["fate", "fgo", "type-moon"] },
  { name: "Identity V", tags: ["identity v", "idv"] },
  { name: "Honkai Impact 3rd", tags: ["honkai impact", "hi3"] },
  { name: "Corporate & Official", tags: ["corporate", "official"] }
];

function initBlockAndFandomUI() {
  setupTabs();
  setupDaySwitcher();
  setupFacilityStrip();
  renderBlockGrid();
  renderFandomList();

  const fandomSearch = document.getElementById("fandom-search-input");
  if (fandomSearch) {
    fandomSearch.addEventListener("input", (e) => {
      renderFandomList(e.target.value);
    });
  }

  const btnClearFandom = document.getElementById("btn-clear-fandom");
  if (btnClearFandom) {
    btnClearFandom.addEventListener("click", () => {
      state.selectedFandom = null;
      document.getElementById("fandom-active-banner").style.display = "none";
      clearHighlightMarkers();
    });
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".panel-tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      state.activeTab = target;

      document.getElementById("tab-route-content").style.display = target === "tab-route" ? "block" : "none";
      document.getElementById("tab-block-content").style.display = target === "tab-block" ? "block" : "none";
      document.getElementById("tab-fandom-content").style.display = target === "tab-fandom" ? "block" : "none";
      const rallyTab = document.getElementById("tab-rally-content");
      if (rallyTab) rallyTab.style.display = target === "tab-rally" ? "block" : "none";
    });
  });
}

function setupDaySwitcher() {
  const dayBtns = document.querySelectorAll(".day-btn");
  dayBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      dayBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeDay = btn.dataset.day;

      renderBlockGrid();
      renderFandomList();
      if (state.selectedBlock) selectBlock(state.selectedBlock);
      if (state.selectedFandom) selectFandom(state.selectedFandom);
    });
  });
}

function setupFacilityStrip() {
  const facBtns = document.querySelectorAll(".facility-btn");
  facBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.fac;
      let targetCoord = null;
      let targetName = "";

      if (type === "TOILET") {
        targetCoord = { x: 3450.0, y: 895.0 };
        targetName = "Toilet Utama (Hall 7-8)";
      } else if (type === "MUSHOLA") {
        targetCoord = state.coordsData?.landmarks?.MUSHOLA_LOBBY || { x: 480.0, y: 2840.0 };
        targetName = "Mushola (Lobi)";
      } else if (type === "FNB") {
        targetCoord = state.coordsData?.landmarks?.FNB_AREA || { x: 3500.0, y: 2850.0 };
        targetName = "Food & Beverage Area (Lobi)";
      } else if (type === "LOST_FOUND") {
        targetCoord = state.coordsData?.landmarks?.ENTRANCE_LOST_FOUND || { x: 6150.0, y: 1600.0 };
        targetName = "Luggage Deposit & Lost-Found (Hall 10)";
      } else if (type === "STAGE") {
        targetCoord = state.coordsData?.landmarks?.MAIN_STAGE || { x: 330.0, y: 2280.0 };
        targetName = "Main Stage (Hall 5)";
      }

      if (targetCoord) {
        selectDestination({
          type: "landmark",
          id: type,
          name: targetName,
          x: targetCoord.x,
          y: targetCoord.y
        });
        executeRoutePlanning();
      }
    });
  });
}

function filterCircleByDay(c) {
  if (state.activeDay === "all") return true;
  const day = (c.day || "").toLowerCase();
  if (state.activeDay === "Saturday") {
    return day.includes("both") || day.includes("sat") || day.includes("1");
  } else if (state.activeDay === "Sunday") {
    return day.includes("both") || day.includes("sun") || day.includes("2");
  }
  return true;
}

function renderBlockGrid() {
  const container = document.getElementById("block-grid-container");
  if (!container) return;

  const blocks = [
    "A","B","C","D","E","F",
    "G","H","I","J","K","L",
    "M","N","O","P","Q","R",
    "S","T","U","V","W","X",
    "Y","Z","AA","AB","AC","AD",
    "AE","AF","AG","AH","CORP","COM"
  ];

  const blockCounts = {};
  state.circles.forEach(c => {
    if (!filterCircleByDay(c)) return;
    const coords = state.coordsData?.booths[c.code];
    let b = coords?.block;
    if (!b) {
      const m = c.code.match(/^([A-Za-z]+)/);
      b = m ? m[1].toUpperCase() : "A";
    }
    blockCounts[b] = (blockCounts[b] || 0) + 1;
  });

  container.innerHTML = blocks.map(b => `
    <button class="block-card-btn ${state.selectedBlock === b ? "active" : ""}" data-block="${b}">
      <span class="block-card-letter" style="${b.length > 2 ? 'font-size: 11px;' : ''}">${b}</span>
      <span class="block-card-count">${blockCounts[b] || 0}</span>
    </button>
  `).join("");

  container.querySelectorAll(".block-card-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".block-card-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectBlock(btn.dataset.block);
    });
  });
}

function selectBlock(block) {
  state.selectedBlock = block;
  clearHighlightMarkers();

  const matchingCircles = state.circles.filter(c => {
    if (!filterCircleByDay(c)) return false;
    const coords = state.coordsData?.booths[c.code];
    if (coords && coords.block === block) return true;
    return c.code.toUpperCase().startsWith(block + "-");
  });

  const header = document.getElementById("block-selected-header");
  const title = document.getElementById("block-selected-title");
  const count = document.getElementById("block-selected-count");
  const list = document.getElementById("block-circles-list");

  header.style.display = "block";
  title.textContent = `Daftar Booth Blok ${block}`;
  count.textContent = `${matchingCircles.length} Booth`;

  list.innerHTML = matchingCircles.map(c => `
    <div class="fandom-card-btn" data-code="${c.code}">
      <div>
        <div class="fandom-name">${c.code} - ${c.name}</div>
        <div style="font-size: 11.5px; color: #94a3b8;">${c.fandom || c.other_fandom || "Circle Space"}</div>
      </div>
      <button class="btn-secondary btn-route-direct" data-code="${c.code}" style="padding: 4px 10px; font-size: 11px;">Rute</button>
    </div>
  `).join("");

  const coordsList = [];
  matchingCircles.forEach(c => {
    const coords = state.coordsData?.booths[c.code];
    if (coords) {
      coordsList.push(coords);
      createHighlightMarker(coords, c);
    }
  });

  if (coordsList.length > 0) {
    const avgX = coordsList.reduce((s, p) => s + p.x, 0) / coordsList.length;
    const avgY = coordsList.reduce((s, p) => s + p.y, 0) / coordsList.length;
    panToCoordinate(avgX, avgY, 1.4);
  }

  list.querySelectorAll(".btn-route-direct").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = b.dataset.code;
      const c = state.circles.find(item => item.code === code);
      const coords = state.coordsData?.booths[code];
      if (c && coords) {
        selectDestination({
          type: "booth",
          id: code,
          code,
          name: `${code} - ${c.name}`,
          x: coords.x,
          y: coords.y,
          circle: c,
          coords
        });
        showCircleDetails(c, coords);
        executeRoutePlanning();
      }
    });
  });

  list.querySelectorAll(".fandom-card-btn").forEach(card => {
    card.addEventListener("click", () => {
      const code = card.dataset.code;
      const c = state.circles.find(item => item.code === code);
      const coords = state.coordsData?.booths[code] || findBoothCoords(code);
      if (c && coords) {
        openCircleModal(c, coords);
      }
    });
  });
}

function renderFandomList(query = "") {
  const container = document.getElementById("fandom-list-container");
  if (!container) return;

  const q = query.toLowerCase().trim();
  const source = state.fandomIndex && state.fandomIndex.length > 0 ? state.fandomIndex : [];

  let matches = [];
  if (!q) {
    // Show top 60 fandoms by default
    matches = source.slice(0, 60);
  } else {
    // Search across all 2,900+ fandoms
    matches = source.filter(f => f.name.toLowerCase().includes(q)).slice(0, 80);
  }

  if (matches.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: #64748b; font-size: 13px;">Tidak ada fandom yang cocok dengan "${query}".</div>`;
    return;
  }

  container.innerHTML = matches.map(f => `
    <div class="fandom-card-btn ${state.selectedFandom === f.name ? "active" : ""}" data-fandom="${f.name}">
      <span class="fandom-name">${f.name}</span>
      <span class="fandom-badge-count">${f.count}</span>
    </div>
  `).join("");

  container.querySelectorAll(".fandom-card-btn").forEach(card => {
    card.addEventListener("click", () => {
      container.querySelectorAll(".fandom-card-btn").forEach(b => b.classList.remove("active"));
      card.classList.add("active");
      selectFandom(card.dataset.fandom);
    });
  });
}

function selectFandom(fandomName) {
  state.selectedFandom = fandomName;
  clearHighlightMarkers();

  const fMeta = state.fandomIndex ? state.fandomIndex.find(f => f.name === fandomName) : null;
  const allowedCodes = fMeta ? new Set(fMeta.codes) : new Set();

  const matchingCircles = state.circles.filter(c => {
    if (!filterCircleByDay(c)) return false;
    if (allowedCodes.has(c.code)) return true;
    const text = ((c.fandom || "") + " " + (c.other_fandom || "")).toLowerCase();
    return text.includes(fandomName.toLowerCase());
  });

  // Switch to Fandom Dropdown View
  document.getElementById("fandom-dir-view").style.display = "none";
  const dropdownView = document.getElementById("fandom-dropdown-view");
  dropdownView.style.display = "block";

  document.getElementById("fandom-dropdown-title").textContent = fandomName;
  document.getElementById("fandom-dropdown-count").textContent = `${matchingCircles.length} Booth`;

  // Render all booths selling this fandom
  function renderFandomBooths(filterQuery = "") {
    const container = document.getElementById("fandom-booths-list-container");
    const q = filterQuery.toLowerCase().trim();
    const filtered = matchingCircles.filter(c => {
      if (!q) return true;
      return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 12.5px;">Tidak ada booth yang cocok dengan "${filterQuery}"</div>`;
      return;
    }

    container.innerHTML = filtered.map(c => {
      const coords = state.coordsData?.booths[c.code] || findBoothCoords(c.code);
      const itemsList = c.items_offered || [];
      const hasGoods = c.goods || itemsList.includes("goods");
      const hasArtbook = c.artbook || itemsList.includes("artbook");
      const hasComic = c.comic || itemsList.includes("comic");
      const hasSocial = Boolean(c.tw || c.ig || (c.extra_socials && c.extra_socials.length > 0));

      return `
        <div class="fandom-card-btn" data-code="${c.code}" style="flex-direction: column; align-items: flex-start; gap: 6px;">
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-start; gap: 6px;">
            <div>
              <span class="circle-code-badge" style="font-size: 11px;">${c.code}</span>
              <div class="fandom-name" style="margin-top: 3px; font-size: 13.5px;">${c.name}</div>
            </div>
            <button class="btn-secondary btn-route-fandom-direct" data-code="${c.code}" style="padding: 4px 10px; font-size: 11px;">Rute</button>
          </div>

          <!-- Quick badges for items & socials -->
          <div style="display: flex; gap: 5px; flex-wrap: wrap;">
            ${c.day ? `<span class="tag-item highlight" style="font-size: 9.5px; padding: 2px 6px;">${c.day}</span>` : ""}
            ${hasGoods ? `<span class="tag-item" style="font-size: 9.5px; padding: 2px 6px;">✨ Goods</span>` : ""}
            ${hasArtbook ? `<span class="tag-item" style="font-size: 9.5px; padding: 2px 6px;">🎨 Artbook</span>` : ""}
            ${hasComic ? `<span class="tag-item" style="font-size: 9.5px; padding: 2px 6px;">📖 Komik</span>` : ""}
            ${c.sample_images && c.sample_images.length > 0 ? `<span class="tag-item" style="font-size: 9.5px; padding: 2px 6px; color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);">📸 ${c.sample_images.length} Foto</span>` : ""}
            ${hasSocial ? `<span class="tag-item" style="font-size: 9.5px; padding: 2px 6px; color: #34d399;">🌐 Sosmed</span>` : ""}
          </div>
        </div>
      `;
    }).join("");

    // Wire clicks to open universal modal!
    container.querySelectorAll(".fandom-card-btn").forEach(card => {
      card.addEventListener("click", () => {
        const code = card.dataset.code;
        const c = state.circles.find(item => item.code === code);
        const coords = state.coordsData?.booths[code] || findBoothCoords(code);
        if (c && coords) {
          openCircleModal(c, coords);
        }
      });
    });

    // Wire direct route buttons
    container.querySelectorAll(".btn-route-fandom-direct").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        const c = state.circles.find(item => item.code === code);
        const coords = state.coordsData?.booths[code] || findBoothCoords(code);
        if (c && coords) {
          selectDestination({
            type: "booth",
            id: code,
            code,
            name: `${code} - ${c.name}`,
            x: coords.x,
            y: coords.y,
            circle: c,
            coords
          });
          document.querySelector('[data-tab="tab-route"]').click();
          executeRoutePlanning();
        }
      });
    });
  }

  renderFandomBooths();

  // Filter input inside fandom dropdown
  const filterInput = document.getElementById("fandom-booth-filter-input");
  if (filterInput) {
    filterInput.value = "";
    filterInput.oninput = (e) => renderFandomBooths(e.target.value);
  }

  // Close / Reset Fandom Dropdown button
  const btnCloseDropdown = document.getElementById("btn-close-fandom-dropdown");
  if (btnCloseDropdown) {
    btnCloseDropdown.onclick = () => {
      state.selectedFandom = null;
      dropdownView.style.display = "none";
      document.getElementById("fandom-dir-view").style.display = "block";
      clearHighlightMarkers();
    };
  }

  // Plot glowing dots on Floormap
  const coordsList = [];
  matchingCircles.forEach(c => {
    const coords = state.coordsData?.booths[c.code] || findBoothCoords(c.code);
    if (coords) {
      coordsList.push(coords);
      createHighlightMarker(coords, c);
    }
  });

  if (coordsList.length > 0) {
    const avgX = coordsList.reduce((s, p) => s + p.x, 0) / coordsList.length;
    const avgY = coordsList.reduce((s, p) => s + p.y, 0) / coordsList.length;
    panToCoordinate(avgX, avgY, 0.95);
  }
}

function createHighlightMarker(coords, circle) {
  const pin = document.createElement("div");
  pin.className = "highlight-booth-dot";
  pin.style.left = `${(coords.x / MAP_WIDTH) * 100}%`;
  pin.style.top = `${(coords.y / MAP_HEIGHT) * 100}%`;
  pin.title = `${circle.code} - ${circle.name}`;

  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    openCircleModal(circle, coords);
  });

  el.pinsLayer.appendChild(pin);
  state.highlightMarkers.push(pin);
}

function clearHighlightMarkers() {
  state.highlightMarkers.forEach(m => m.remove());
  state.highlightMarkers = [];
}



function findBoothCoords(code) {
  if (!state.coordsData?.booths) return null;
  const bMap = state.coordsData.booths;
  if (bMap[code]) return bMap[code];

  const m = code.match(/^([A-Za-z]{1,2})-?(\d+)/);
  if (m) {
    const targetB = m[1].toUpperCase();
    const targetN = parseInt(m[2], 10);
    for (const [k, v] of Object.entries(bMap)) {
      if (v.block === targetB && v.number === targetN) return v;
      if (k.includes(targetB) && k.includes(`-${targetN}`)) return v;
    }
  }
  return null;
}

function initStampRallyUI() {
  renderRalliesList();

  const rallySearch = document.getElementById("rally-search-input");
  if (rallySearch) {
    rallySearch.addEventListener("input", (e) => {
      renderRalliesList(e.target.value);
    });
  }

  const btnBack = document.getElementById("btn-back-to-rallies");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      document.getElementById("rally-detail-view").style.display = "none";
      document.getElementById("rally-list-view").style.display = "block";
      state.selectedRally = null;
      clearHighlightMarkers();
      renderRouteOnSvg(null);
    });
  }
}

function renderRalliesList(query = "") {
  const container = document.getElementById("rally-list-container");
  if (!container) return;

  const q = query.toLowerCase().trim();
  const source = state.stampRallies || [];

  let matches = [];
  if (!q) {
    matches = source.slice(0, 60);
  } else {
    matches = source.filter(r => {
      const matchName = r.name.toLowerCase().includes(q);
      const matchFandom = (r.fandoms || []).some(f => f.toLowerCase().includes(q));
      return matchName || matchFandom;
    }).slice(0, 80);
  }

  if (matches.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: #64748b; font-size: 13px;">Tidak ada Stamp Rally yang cocok dengan "${query}".</div>`;
    return;
  }

  container.innerHTML = matches.map(r => `
    <div class="fandom-card-btn ${state.selectedRally === r.id ? "active" : ""}" data-rally-id="${r.id}" style="flex-direction: column; align-items: flex-start; gap: 4px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="fandom-name" style="font-size: 12.5px; line-height: 1.3;">${r.name}</span>
        <span class="fandom-badge-count" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">${r.total_booths} Booth</span>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
        ${(r.fandoms || []).map(f => `<span class="tag-item" style="font-size: 10px; padding: 2px 6px;">${f}</span>`).join("")}
        <span class="tag-item highlight" style="font-size: 10px; padding: 2px 6px;">${r.day}</span>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".fandom-card-btn").forEach(card => {
    card.addEventListener("click", () => {
      selectStampRally(card.dataset.rallyId);
    });
  });
}

function selectStampRally(rallyId) {
  state.selectedRally = rallyId;
  clearHighlightMarkers();

  const rally = (state.stampRallies || []).find(r => r.id === rallyId);
  if (!rally) return;

  document.getElementById("rally-list-view").style.display = "none";
  const detailView = document.getElementById("rally-detail-view");
  detailView.style.display = "block";

  const startSet = new Set(rally.start_booths || []);
  const rewardSet = new Set(rally.reward_booths || []);

  const rawCheckpoints = [];
  (rally.booths || []).forEach(b => {
    const coords = findBoothCoords(b.code);
    if (coords) {
      const isStart = startSet.has(b.code);
      const isReward = rewardSet.has(b.code);
      rawCheckpoints.push({
        code: b.code,
        name: b.name,
        coords: coords,
        isStart: isStart,
        isReward: isReward
      });
    }
  });

  rawCheckpoints.sort((a, b) => {
    if (a.isStart && !b.isStart) return -1;
    if (!a.isStart && b.isStart) return 1;
    if (a.isReward && !b.isReward) return 1;
    if (!a.isReward && b.isReward) return -1;
    return b.coords.x - a.coords.x;
  });

  const storageKey = `cf23_rally_${rally.id}`;
  let completedSet = new Set();
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) completedSet = new Set(JSON.parse(saved));
  } catch (e) {}

  const container = document.getElementById("rally-quest-container");
  container.innerHTML = `
    <div class="rally-quest-card">
      <div class="rally-quest-title">${rally.name}</div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        ${(rally.fandoms || []).map(f => `<span class="tag-item">${f}</span>`).join("")}
        <span class="tag-item highlight">${rally.day}</span>
        ${rally.link ? `<a href="${rally.link}" target="_blank" class="btn-secondary" style="padding: 2px 8px; font-size: 10.5px;">Lihat Info Resmi ↗</a>` : ""}
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 4px;">
          <span style="color: #94a3b8;">Kemajuan Stamp</span>
          <span id="rally-progress-text" style="font-weight: 700; color: #10b981;">${completedSet.size} / ${rawCheckpoints.length} (${Math.round((completedSet.size / (rawCheckpoints.length || 1)) * 100)}%)</span>
        </div>
        <div class="rally-progress-bar-bg">
          <div id="rally-progress-fill" class="rally-progress-bar-fill" style="width: ${Math.round((completedSet.size / (rawCheckpoints.length || 1)) * 100)}%;"></div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <button id="btn-draw-rally-tour" class="btn-primary" style="flex: 1; padding: 10px; font-size: 12.5px;">
          <i data-lucide="map" style="width: 15px; height: 15px;"></i>
          <span>Rute Tur Lengkap</span>
        </button>
        <button id="btn-clear-rally-tour" class="btn-secondary" style="padding: 10px; font-size: 12.5px;" title="Bersihkan Jalur">
          <i data-lucide="x" style="width: 15px; height: 15px;"></i>
        </button>
      </div>
    </div>

    <div style="font-size: 12px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px;">Daftar Checkpoint Stamp:</div>
    <div id="checkpoint-items-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow-y: auto;">
      ${rawCheckpoints.map((cp, idx) => {
        const isDone = completedSet.has(cp.code);
        let badgeType = "";
        let badgeLabel = `#${idx + 1}`;
        if (cp.isStart) {
          badgeType = "start";
          badgeLabel = "1";
        } else if (cp.isReward) {
          badgeType = "reward";
          badgeLabel = "🎁";
        }

        return `
          <div class="checkpoint-item ${isDone ? "completed" : ""}" data-code="${cp.code}">
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="checkbox" class="checkpoint-checkbox" data-code="${cp.code}" ${isDone ? "checked" : ""}>
              <div class="checkpoint-num-badge ${badgeType}">${badgeLabel}</div>
              <div>
                <div style="font-size: 12.5px; font-weight: 700; color: #fff;">${cp.code}</div>
                <div style="font-size: 11px; color: #94a3b8; max-width: 170px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cp.name}</div>
              </div>
            </div>
            <button class="btn-secondary btn-route-checkpoint" data-code="${cp.code}" style="padding: 4px 10px; font-size: 11px;">Rute</button>
          </div>
        `;
      }).join("")}
    </div>
  `;

  if (window.lucide) {
    lucide.createIcons({ root: container });
  }

  container.querySelectorAll(".checkpoint-checkbox").forEach(box => {
    box.addEventListener("change", (e) => {
      const code = e.target.dataset.code;
      if (e.target.checked) {
        completedSet.add(code);
      } else {
        completedSet.delete(code);
      }
      localStorage.setItem(storageKey, JSON.stringify(Array.from(completedSet)));

      const itemCard = e.target.closest(".checkpoint-item");
      if (itemCard) itemCard.classList.toggle("completed", e.target.checked);

      const pct = Math.round((completedSet.size / (rawCheckpoints.length || 1)) * 100);
      document.getElementById("rally-progress-text").textContent = `${completedSet.size} / ${rawCheckpoints.length} (${pct}%)`;
      document.getElementById("rally-progress-fill").style.width = `${pct}%`;
    });
  });

  container.querySelectorAll(".btn-route-checkpoint").forEach(btn => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.code;
      const cp = rawCheckpoints.find(item => item.code === code);
      if (cp) {
        selectDestination({
          type: "booth",
          id: code,
          code,
          name: `${code} - ${cp.name}`,
          x: cp.coords.x,
          y: cp.coords.y
        });
        executeRoutePlanning();
      }
    });
  });

  function drawRallyTour() {
    if (rawCheckpoints.length === 0) return;

    const fullPath = [];
    const tourPoints = [];

    if (state.startPoint) {
      tourPoints.push({ x: state.startPoint.x, y: state.startPoint.y });
    }

    rawCheckpoints.forEach(cp => {
      tourPoints.push({ x: cp.coords.x, y: cp.coords.y });
    });

    for (let i = 0; i < tourPoints.length - 1; i++) {
      const seg = calculateRoute(tourPoints[i], tourPoints[i+1]);
      if (seg) {
        if (fullPath.length > 0) {
          fullPath.push(...seg.slice(1));
        } else {
          fullPath.push(...seg);
        }
      }
    }

    renderRouteOnSvg(fullPath);

    const xs = rawCheckpoints.map(cp => cp.coords.x);
    const ys = rawCheckpoints.map(cp => cp.coords.y);
    const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
    panToCoordinate(avgX, avgY, 0.85);
  }

  document.getElementById("btn-draw-rally-tour").addEventListener("click", drawRallyTour);
  document.getElementById("btn-clear-rally-tour").addEventListener("click", () => {
    renderRouteOnSvg(null);
  });

  rawCheckpoints.forEach((cp, idx) => {
    createCheckpointPin(cp, idx + 1);
  });

  drawRallyTour();
}

function createCheckpointPin(cp, number) {
  const pin = document.createElement("div");
  pin.className = "checkpoint-map-pin";
  pin.style.left = `${(cp.coords.x / MAP_WIDTH) * 100}%`;
  pin.style.top = `${(cp.coords.y / MAP_HEIGHT) * 100}%`;

  let typeClass = "";
  let label = `${number}`;
  if (cp.isStart) {
    typeClass = "start";
    label = "1";
  } else if (cp.isReward) {
    typeClass = "reward";
    label = "🎁";
  }

  pin.innerHTML = `<div class="checkpoint-pin-circle ${typeClass}" title="${cp.code} - ${cp.name}">${label}</div>`;

  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    const circle = state.circles.find(c => c.code === cp.code);
    if (circle) {
      showCircleDetails(circle, cp.coords);
    }
  });

  el.pinsLayer.appendChild(pin);
  state.highlightMarkers.push(pin);
}


// -----------------------------------------------------------------------------
// Mobile Bottom Sheet Engine
// -----------------------------------------------------------------------------
function setMobileSheetState(sheetState) {
  if (!el.sidePanel) return;
  el.sidePanel.classList.remove('sheet-peek', 'sheet-half', 'sheet-full', 'collapsed');
  el.sidePanel.classList.add(`sheet-${sheetState}`);
  state.sheetState = sheetState;
  if (el.btnReopenPanel) {
    el.btnReopenPanel.style.display = (sheetState === 'peek' && window.innerWidth > 768) ? 'flex' : 'none';
  }
}

function initMobileSheetGestures() {
  const handle = document.getElementById('sheet-handle');
  if (!handle) return;

  state.sheetState = 'peek';

  // Tap handle to cycle states
  handle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.sheetState === 'peek') {
      setMobileSheetState('half');
    } else if (state.sheetState === 'half') {
      setMobileSheetState('full');
    } else {
      setMobileSheetState('peek');
    }
  });

  // Touch drag on handle
  let touchStartY = 0;
  let initialTranslate = 0;

  handle.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  handle.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const dy = touchEndY - touchStartY; // positive = dragged down, negative = dragged up

    if (dy < -40) {
      // Swiped UP
      if (state.sheetState === 'peek') setMobileSheetState('half');
      else if (state.sheetState === 'half') setMobileSheetState('full');
    } else if (dy > 40) {
      // Swiped DOWN
      if (state.sheetState === 'full') setMobileSheetState('half');
      else if (state.sheetState === 'half') setMobileSheetState('peek');
    }
  }, { passive: true });

  // Map click collapses sheet to peek on mobile
  el.mapContainer.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && state.sheetState !== 'peek') {
      if (!e.target.closest('.side-panel') && !e.target.closest('.top-nav')) {
        setMobileSheetState('peek');
      }
    }
  });

  // Smooth scroll-up expansion on mobile:
  // When user is in half mode and scrolls inside panel-content, automatically expand to full!
  const panelContent = document.querySelector('.panel-content');
  if (panelContent) {
    let lastScrollTop = 0;
    panelContent.addEventListener('scroll', () => {
      if (window.innerWidth <= 768) {
        if (state.sheetState === 'half' && panelContent.scrollTop > 30) {
          setMobileSheetState('full');
        } else if (state.sheetState === 'full' && panelContent.scrollTop === 0 && lastScrollTop === 0) {
          // at top of sheet
        }
        lastScrollTop = panelContent.scrollTop;
      }
    }, { passive: true });
  }
}


function openLightbox(imgUrl) {
  const modal = document.getElementById("image-lightbox-modal");
  const img = document.getElementById("lightbox-img");
  if (!modal || !img) return;
  img.src = imgUrl;
  modal.classList.add("active");
}

function closeLightbox() {
  const modal = document.getElementById("image-lightbox-modal");
  if (modal) modal.classList.remove("active");
}


// -----------------------------------------------------------------------------
// Universal Circle Detail Modal / Popup Engine
// -----------------------------------------------------------------------------
function openCircleModal(circle, boothCoords) {
  state.selectedCircle = { ...circle, coords: boothCoords };
  const modal = document.getElementById("circle-detail-modal");
  if (!modal) return;

  // Banner
  const banner = document.getElementById("modal-circle-banner");
  if (circle.cut) {
    banner.src = circle.cut;
    banner.style.display = "block";
  } else {
    banner.style.display = "none";
  }

  // Titles
  document.getElementById("modal-circle-code").textContent = circle.code;
  document.getElementById("modal-circle-name").textContent = circle.name;

  // Tags
  const tagsHtml = [];
  if (circle.day) tagsHtml.push(`<span class="tag-item highlight">${circle.day}</span>`);
  if (circle.rating && circle.rating !== "General") tagsHtml.push(`<span class="tag-item" style="color: #f87171;">${circle.rating}</span>`);
  if (boothCoords && boothCoords.hall) tagsHtml.push(`<span class="tag-item">Hall ${boothCoords.hall}</span>`);
  document.getElementById("modal-tags").innerHTML = tagsHtml.join("");

  // Fandom & Description
  document.getElementById("modal-fandom-text").textContent = [circle.fandom, circle.other_fandom].filter(Boolean).join(" • ") || "General / Original";
  const descEl = document.getElementById("modal-desc-text");
  if (circle.other_fandom && circle.other_fandom !== circle.fandom) {
    descEl.textContent = circle.other_fandom;
    descEl.style.display = "block";
  } else {
    descEl.style.display = "none";
  }

  // ALL Social Media Links & Profiles
  const socialsList = document.getElementById("modal-socials-list");
  const socBtns = [];

  if (circle.tw) {
    socBtns.push(`<a href="${circle.tw}" target="_blank" class="social-badge-btn tw">🐦 Twitter / X ↗</a>`);
  }
  if (circle.ig) {
    socBtns.push(`<a href="${circle.ig}" target="_blank" class="social-badge-btn ig">📸 Instagram ↗</a>`);
  }
  if (circle.yt && circle.yt !== "-") {
    socBtns.push(`<a href="${circle.yt}" target="_blank" class="social-badge-btn yt">▶️ YouTube ↗</a>`);
  }
  if (circle.fb && circle.fb !== "-") {
    socBtns.push(`<a href="${circle.fb}" target="_blank" class="social-badge-btn fb">🌐 Facebook ↗</a>`);
  }

  // Extra socials from enrich (Carrd, Twitch, Links, Website)
  if (circle.extra_socials && Array.isArray(circle.extra_socials)) {
    circle.extra_socials.forEach(s => {
      const pLower = (s.platform || "").toLowerCase();
      let icon = "🔗";
      let btnClass = "link";
      if (pLower.includes("instagram")) { icon = "📸"; btnClass = "ig"; }
      else if (pLower.includes("youtube")) { icon = "▶️"; btnClass = "yt"; }
      else if (pLower.includes("twitter") || pLower.includes("x")) { icon = "🐦"; btnClass = "tw"; }

      if (!socBtns.some(b => b.includes(s.url))) {
        socBtns.push(`<a href="${s.url}" target="_blank" class="social-badge-btn ${btnClass}">${icon} ${s.platform} ↗</a>`);
      }
    });
  }

  // Pre-Order and Marketplace Links
  const linksContainer = document.getElementById("modal-links-container");
  const poLinks = document.getElementById("modal-po-links");
  const linkList = circle.catalogue_links || [];
  if (linkList.length > 0 || circle.market) {
    linksContainer.style.display = "block";
    const poBtns = [];
    linkList.forEach(l => {
      poBtns.push(`<a href="${l.url}" target="_blank" class="social-badge-btn po">📝 ${l.label} ↗</a>`);
    });
    if (circle.market && !linkList.some(l => l.url === circle.market)) {
      poBtns.push(`<a href="${circle.market}" target="_blank" class="social-badge-btn link">🛍️ Marketplace / Katalog Online ↗</a>`);
    }
    poLinks.innerHTML = poBtns.join("");
  } else {
    linksContainer.style.display = "none";
  }

  socialsList.innerHTML = socBtns.join("") || '<span style="font-size: 11.5px; color: #64748b;">Tidak ada akun medsos publik terdaftar</span>';

  // Merchandise Items Offered Badges
  const itemsContainer = document.getElementById("modal-items-container");
  const itemsTags = document.getElementById("modal-items-tags");
  const itemBadges = [];
  const ITEM_LABELS = {
    "artbook": "🎨 Artbook / Ilustrasi",
    "goods": "✨ Merchandise / Goods (Ganci, Standee, Stiker)",
    "comic": "📖 Komik / Doujinshi",
    "novel": "📚 Light Novel / Fiksimini",
    "game": "🎮 Video Game / TCG",
    "music": "🎵 Musik / CD Album",
    "handmade-crafts": "🧵 Handmade Crafts / Aksesoris",
    "photobook-cosplay": "🎭 Cosplay Photobook / Cheki",
    "commission": "✏️ Open Commission"
  };

  if (circle.items_offered && Array.isArray(circle.items_offered)) {
    circle.items_offered.forEach(item => {
      const label = ITEM_LABELS[item] || item.toUpperCase();
      itemBadges.push(`<span class="tag-item highlight">${label}</span>`);
    });
  } else {
    if (circle.goods) itemBadges.push('<span class="tag-item highlight">✨ Merchandise / Goods</span>');
    if (circle.artbook) itemBadges.push('<span class="tag-item highlight">🎨 Artbook</span>');
    if (circle.comic) itemBadges.push('<span class="tag-item highlight">📖 Komik</span>');
    if (circle.craft) itemBadges.push('<span class="tag-item highlight">🧵 Handmade Crafts</span>');
    if (circle.novel) itemBadges.push('<span class="tag-item highlight">📚 Novel</span>');
    if (circle.game) itemBadges.push('<span class="tag-item highlight">🎮 Game / TCG</span>');
    if (circle.music) itemBadges.push('<span class="tag-item highlight">🎵 Musik</span>');
    if (circle.cosplay) itemBadges.push('<span class="tag-item highlight">🎭 Cosplay</span>');
    if (circle.commission) itemBadges.push('<span class="tag-item highlight">✏️ Commission</span>');
  }

  if (itemBadges.length > 0) {
    itemsContainer.style.display = "block";
    itemsTags.innerHTML = itemBadges.join("");
  } else {
    itemsContainer.style.display = "none";
  }

  // Sample Photos Gallery
  const galleryContainer = document.getElementById("modal-gallery-container");
  const galleryStrip = document.getElementById("modal-gallery-strip");
  const sampleImages = circle.sample_images || [];

  if (sampleImages.length > 0) {
    galleryContainer.style.display = "block";
    galleryStrip.innerHTML = sampleImages.map(imgUrl => `
      <div class="gallery-thumb-item" data-full-url="${imgUrl}">
        <img class="gallery-thumb-img" src="${imgUrl}" alt="Sample Item" loading="lazy" onerror="this.parentElement.style.display='none'">
      </div>
    `).join("");

    galleryStrip.querySelectorAll(".gallery-thumb-item").forEach(item => {
      item.addEventListener("click", () => {
        openLightbox(item.dataset.fullUrl);
      });
    });
  } else {
    galleryContainer.style.display = "none";
  }

  // Social Media Announcement Quotes
  const postsContainer = document.getElementById("modal-posts-container");
  const postsList = document.getElementById("modal-posts-list");
  const postList = circle.catalogue_posts || [];
  if (postList.length > 0) {
    postsContainer.style.display = "block";
    postsList.innerHTML = postList.map(p => {
      const cleanText = p.text ? p.text.replace(/\n/g, '<br>') : '';
      return `
        <div class="detail-post-card">
          <div>${cleanText}</div>
          ${p.url ? `<a href="${p.url}" target="_blank" class="detail-post-link">Buka Postingan Asli ↗</a>` : ''}
        </div>
      `;
    }).join("");
  } else {
    postsContainer.style.display = "none";
  }

  // Star status
  const starBtn = document.getElementById("modal-btn-star");
  const isStarred = state.wishlist.has(circle.code);
  starBtn.innerHTML = `<i data-lucide="star" style="width: 16px; height: 16px; color: #fbbf24; fill: ${isStarred ? '#fbbf24' : 'none'};"></i>`;

  // Pan to booth on map
  if (boothCoords) {
    panToCoordinate(boothCoords.x, boothCoords.y, 1.4);
  }

  // Show modal
  modal.classList.add("active");
  const scrollContainer = modal.querySelector(".circle-modal-scroll");
  if (scrollContainer) scrollContainer.scrollTop = 0;

  if (window.lucide) {
    lucide.createIcons({ root: modal });
  }
}

function closeCircleModal() {
  const modal = document.getElementById("circle-detail-modal");
  if (modal) modal.classList.remove("active");
}

function initUniversalModalEvents() {
  const modal = document.getElementById("circle-detail-modal");
  if (!modal) return;

  const btnClose = document.getElementById("modal-btn-close");
  if (btnClose) btnClose.addEventListener("click", closeCircleModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeCircleModal();
  });

  // Route Button in Modal
  const btnRoute = document.getElementById("modal-btn-route");
  if (btnRoute) {
    btnRoute.addEventListener("click", () => {
      if (state.selectedCircle && state.selectedCircle.coords) {
        selectDestination({
          type: "booth",
          id: state.selectedCircle.code,
          code: state.selectedCircle.code,
          name: `${state.selectedCircle.code} - ${state.selectedCircle.name}`,
          x: state.selectedCircle.coords.x,
          y: state.selectedCircle.coords.y,
          circle: state.selectedCircle,
          coords: state.selectedCircle.coords
        });
        closeCircleModal();
        // Switch to route tab & execute route
        document.querySelector('[data-tab="tab-route"]').click();
        executeRoutePlanning();
      }
    });
  }

  // Position Button in Modal
  const btnStart = document.getElementById("modal-btn-start");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      if (state.selectedCircle && state.selectedCircle.coords) {
        selectStartPoint({
          type: "booth",
          id: state.selectedCircle.code,
          code: state.selectedCircle.code,
          name: `${state.selectedCircle.code} - ${state.selectedCircle.name}`,
          x: state.selectedCircle.coords.x,
          y: state.selectedCircle.coords.y
        });
        closeCircleModal();
      }
    });
  }

  // Star Wishlist Button in Modal
  const btnStar = document.getElementById("modal-btn-star");
  if (btnStar) {
    btnStar.addEventListener("click", () => {
      if (state.selectedCircle) {
        toggleWishlist(state.selectedCircle.code);
        const isStarred = state.wishlist.has(state.selectedCircle.code);
        btnStar.innerHTML = `<i data-lucide="star" style="width: 16px; height: 16px; color: #fbbf24; fill: ${isStarred ? '#fbbf24' : 'none'};"></i>`;
        if (window.lucide) lucide.createIcons({ root: btnStar });
      }
    });
  }
}


function initHallJumpBar() {
  const btns = document.querySelectorAll(".hall-jump-btn");
  if (!btns || btns.length === 0) return;

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const hall = btn.dataset.hall;
      if (hall === "all") {
        resetMapTransform();
      } else if (hall === "5-6") {
        panToCoordinate(1100, 1600, 0.95);
      } else if (hall === "7") {
        panToCoordinate(2740, 1600, 1.25);
      } else if (hall === "8") {
        panToCoordinate(3690, 1600, 1.25);
      } else if (hall === "9") {
        panToCoordinate(4600, 1600, 1.25);
      } else if (hall === "10") {
        panToCoordinate(5780, 1600, 1.15);
      }
    });
  });
}


function updateWishlistBadge() {
  const badge = document.getElementById("wishlist-badge");
  if (!badge) return;
  const count = state.wishlist ? state.wishlist.size : 0;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}
