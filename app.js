/**
 * Comifuro 23 Interactive Floormap & Navigation Engine
 * Built for ICE BSD Halls 5-10
 */

// State Management
const state = {
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
    el.sidePanel.classList.add("collapsed");
    if (el.btnReopenPanel) el.btnReopenPanel.style.display = "flex";
  } else {
    el.sidePanel.classList.remove("collapsed");
    if (el.btnReopenPanel) el.btnReopenPanel.style.display = "none";
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
  initStampRallyUI();
  setupEventListeners();
  setupMapInteraction();
  
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
  
  // Scale to fit nicely
  const fitScale = Math.min(cWidth / 2400, cHeight / 1137) * 1.1;
  state.scale = Math.max(fitScale, 0.45);
  
  // Center around Hall 10 Entrance (x ~ 88%, y ~ 52%)
  const sidebarOffset = (window.innerWidth > 768 && !el.sidePanel.classList.contains("collapsed")) ? 190 : 0;
  state.panX = (cWidth / 2 + sidebarOffset) - (el.floormapImg.clientWidth * 0.88) * state.scale;
  state.panY = cHeight / 2 - (el.floormapImg.clientHeight * 0.52) * state.scale;
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
  el.detailCode.textContent = circle.code;
  el.detailName.textContent = circle.name;
  el.detailFandom.textContent = [circle.fandom, circle.other_fandom].filter(Boolean).join(' • ') || 'General / Original';
  
  if (circle.cut) {
    el.detailBanner.src = circle.cut;
    el.detailBanner.style.display = 'block';
  } else {
    el.detailBanner.style.display = 'none';
  }
  
  // Render tags
  const tagsHtml = [];
  if (circle.day) tagsHtml.push(`<span class="tag-item highlight">${circle.day}</span>`);
  if (circle.comic) tagsHtml.push('<span class="tag-item">📖 Komik</span>');
  if (circle.artbook) tagsHtml.push('<span class="tag-item">🎨 Artbook</span>');
  if (circle.goods) tagsHtml.push('<span class="tag-item">✨ Goods</span>');
  if (circle.craft) tagsHtml.push('<span class="tag-item">🧵 Craft</span>');
  if (circle.novel) tagsHtml.push('<span class="tag-item">📚 Novel</span>');
  if (circle.music) tagsHtml.push('<span class="tag-item">🎵 Music</span>');
  if (circle.cosplay) tagsHtml.push('<span class="tag-item">🎭 Cosplay</span>');
  if (boothCoords && boothCoords.hall) tagsHtml.push(`<span class="tag-item">Hall ${boothCoords.hall}</span>`);
  el.detailTags.innerHTML = tagsHtml.join('');

  // Socials
  const socHtml = [];
  if (circle.tw) socHtml.push(`<a href="${circle.tw}" target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;">Twitter/X</a>`);
  if (circle.ig) socHtml.push(`<a href="${circle.ig}" target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;">Instagram</a>`);
  if (circle.market) socHtml.push(`<a href="${circle.market}" target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;">Catalog Link</a>`);
  el.detailSocials.innerHTML = socHtml.join('');

  // Star status
  updateDetailStarButton();
  
  // Pan to booth
  if (boothCoords) {
    panToCoordinate(boothCoords.x, boothCoords.y, 1.4);
  }

  // Open sidebar if collapsed
  setSidebarCollapsed(false);
}

// -----------------------------------------------------------------------------
// Route Pathfinding & Turn-by-Turn Guidance
// -----------------------------------------------------------------------------
function calculateRoute(start, dest) {
  if (!start || !dest) return null;

  const x1 = start.x;
  const y1 = start.y;
  const x2 = dest.x;
  const y2 = dest.y;

  // Major horizontal walking corridors (Ground Truth measured from floormap.png)
  const CORRIDOR_NORTH = 830.0;     // Back corridor behind booths
  const CORRIDOR_MID = 1585.0;      // Cross aisle walkway in middle
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
        score = 20;
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
  } else {
    state.wishlist.add(code);
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
      const coords = state.coordsData?.booths[code];
      if (c && coords) {
        showCircleDetails(c, coords);
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

  const banner = document.getElementById("fandom-active-banner");
  const bannerText = document.getElementById("fandom-active-text");
  banner.style.display = "flex";
  bannerText.textContent = `${fandomName} (${matchingCircles.length} booth disorot)`;

  // Plot highlights
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
    showCircleDetails(circle, coords);
  });

  el.pinsLayer.appendChild(pin);
  state.highlightMarkers.push(pin);
}

function clearHighlightMarkers() {
  state.highlightMarkers.forEach(m => m.remove());
  state.highlightMarkers = [];
}


function initStampRallyUI() {
  renderRalliesList();

  const rallySearch = document.getElementById("rally-search-input");
  if (rallySearch) {
    rallySearch.addEventListener("input", (e) => {
      renderRalliesList(e.target.value);
    });
  }

  const btnClearRally = document.getElementById("btn-clear-rally");
  if (btnClearRally) {
    btnClearRally.addEventListener("click", () => {
      state.selectedRally = null;
      document.getElementById("rally-active-banner").style.display = "none";
      clearHighlightMarkers();
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
    matches = source.slice(0, 50);
  } else {
    matches = source.filter(r => {
      const matchName = r.name.toLowerCase().includes(q);
      const matchFandom = (r.fandoms || []).some(f => f.toLowerCase().includes(q));
      return matchName || matchFandom;
    }).slice(0, 60);
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
      container.querySelectorAll(".fandom-card-btn").forEach(b => b.classList.remove("active"));
      card.classList.add("active");
      selectStampRally(card.dataset.rallyId);
    });
  });
}

function selectStampRally(rallyId) {
  state.selectedRally = rallyId;
  clearHighlightMarkers();

  const rally = (state.stampRallies || []).find(r => r.id === rallyId);
  if (!rally) return;

  const banner = document.getElementById("rally-active-banner");
  const bannerText = document.getElementById("rally-active-text");
  banner.style.display = "flex";
  bannerText.textContent = `${rally.name} (${rally.total_booths} booth disorot)`;

  const coordsList = [];
  (rally.booths || []).forEach(b => {
    const coords = state.coordsData?.booths[b.code];
    if (coords) {
      coordsList.push(coords);
      createHighlightMarker(coords, { code: b.code, name: b.name });
    }
  });

  if (coordsList.length > 0) {
    const avgX = coordsList.reduce((s, p) => s + p.x, 0) / coordsList.length;
    const avgY = coordsList.reduce((s, p) => s + p.y, 0) / coordsList.length;
    panToCoordinate(avgX, avgY, 0.95);
  }
}
