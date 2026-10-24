// canvas.js - Glowing Neon Lasso & Cropping Mechanics for Halo

(function () {
  const bgCanvas = document.getElementById('bgCanvas');
  const bgCtx = bgCanvas.getContext('2d');
  const lassoCanvas = document.getElementById('lassoCanvas');
  const lassoCtx = lassoCanvas.getContext('2d');
  const hintBanner = document.getElementById('hintBanner');
  const aiCard = document.getElementById('aiCard');

  let rawScreenImage = null;
  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight;

  let isDrawing = false;
  let points = [];
  let currentSelectionBounds = null;
  let hasActiveCard = false;

  // Initialize canvas resolutions (1:1 with CSS pixels to ensure zero cursor offset)
  function resizeCanvases() {
    screenWidth = window.innerWidth;
    screenHeight = window.innerHeight;

    bgCanvas.width = screenWidth;
    bgCanvas.height = screenHeight;
    bgCanvas.style.width = `${screenWidth}px`;
    bgCanvas.style.height = `${screenHeight}px`;

    lassoCanvas.width = screenWidth;
    lassoCanvas.height = screenHeight;
    lassoCanvas.style.width = `${screenWidth}px`;
    lassoCanvas.style.height = `${screenHeight}px`;

    renderBackgroundImage();
  }

  // Draw frozen screenshot background with subtle Google AI dark scrim
  function renderBackgroundImage() {
    bgCtx.clearRect(0, 0, screenWidth, screenHeight);

    if (rawScreenImage && rawScreenImage.naturalWidth > 0) {
      bgCtx.drawImage(rawScreenImage, 0, 0, screenWidth, screenHeight);
    }

    // Google AI Mode scrim to dim desktop and elevate glowing lasso
    bgCtx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    bgCtx.fillRect(0, 0, screenWidth, screenHeight);
  }

  // Setup lasso drawing styles: Google cyan-to-purple gradient with shadowBlur: 15
  function createLassoGradient(p1, p2) {
    const x1 = p1 ? p1.x : 0;
    const y1 = p1 ? p1.y : 0;
    let x2 = p2 ? p2.x : screenWidth;
    let y2 = p2 ? p2.y : screenHeight;

    // Safeguard: Ensure gradient has non-zero vector
    if (Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5) {
      x2 = x1 + 60;
      y2 = y1 + 60;
    }

    const grad = lassoCtx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, '#4285F4');    // Google Blue
    grad.addColorStop(0.35, '#8AB4F8'); // Google Cyan
    grad.addColorStop(0.7, '#C084FC');  // Vivid Purple
    grad.addColorStop(1, '#EC4899');    // Magenta / Violet
    return grad;
  }

  // Render the Google Circle-to-Search glowing rounded square / rectangle
  function renderSquircleSelection(pts, isClosed = false) {
    if (!pts || pts.length < 2) return;

    lassoCtx.clearRect(0, 0, screenWidth, screenHeight);

    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y));

    const width = maxX - minX;
    const height = maxY - minY;

    if (width < 3 && height < 3) return;

    // Smooth rounded square corner radius (adapts dynamically between 12px and 24px)
    const radius = Math.max(12, Math.min(24, Math.min(width, height) / 3));

    const gradient = createLassoGradient({ x: minX, y: minY }, { x: maxX, y: maxY });

    // 1. Interior Translucent Highlight Wash
    lassoCtx.save();
    lassoCtx.beginPath();
    lassoCtx.roundRect(minX, minY, width, height, radius);
    lassoCtx.fillStyle = 'rgba(138, 180, 248, 0.12)';
    lassoCtx.fill();
    lassoCtx.restore();

    // 2. PASS 1: Outer Neon Aura (Google Cyan/Purple with shadowBlur 16)
    lassoCtx.save();
    lassoCtx.beginPath();
    lassoCtx.roundRect(minX, minY, width, height, radius);
    lassoCtx.strokeStyle = gradient;
    lassoCtx.lineWidth = 4;
    lassoCtx.shadowColor = 'rgba(138, 180, 248, 0.95)';
    lassoCtx.shadowBlur = 16;
    lassoCtx.stroke();
    lassoCtx.restore();

    // 3. PASS 2: Crisp Inner Core Glow
    lassoCtx.save();
    lassoCtx.beginPath();
    lassoCtx.roundRect(minX, minY, width, height, radius);
    lassoCtx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    lassoCtx.lineWidth = 1.8;
    lassoCtx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    lassoCtx.shadowBlur = 4;
    lassoCtx.stroke();
    lassoCtx.restore();

    // 4. Subtle Google Corner Accent Dots
    const dotRadius = 3.5;
    const corners = [
      { x: minX + radius * 0.45, y: minY + radius * 0.45 },
      { x: maxX - radius * 0.45, y: minY + radius * 0.45 },
      { x: minX + radius * 0.45, y: maxY - radius * 0.45 },
      { x: maxX - radius * 0.45, y: maxY - radius * 0.45 }
    ];

    lassoCtx.save();
    corners.forEach(c => {
      lassoCtx.beginPath();
      lassoCtx.arc(c.x, c.y, dotRadius, 0, Math.PI * 2);
      lassoCtx.fillStyle = '#FFFFFF';
      lassoCtx.shadowColor = '#8AB4F8';
      lassoCtx.shadowBlur = 8;
      lassoCtx.fill();
    });
    lassoCtx.restore();
  }

  // Clear drawing and reset lasso points
  function clearLasso() {
    lassoCtx.clearRect(0, 0, screenWidth, screenHeight);
    points = [];
    isDrawing = false;
    currentSelectionBounds = null;
  }

  // Extract cropped PNG data URL from selection
  function getCroppedBase64(bounds) {
    const pad = 10;
    const x = Math.max(0, Math.floor(bounds.minX - pad));
    const y = Math.max(0, Math.floor(bounds.minY - pad));
    const w = Math.min(screenWidth - x, Math.ceil(bounds.maxX - bounds.minX + pad * 2));
    const h = Math.min(screenHeight - y, Math.ceil(bounds.maxY - bounds.minY + pad * 2));

    if (w < 8 || h < 8) return null;

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext('2d');

    if (rawScreenImage && rawScreenImage.naturalWidth > 0) {
      const scaleX = rawScreenImage.naturalWidth / screenWidth;
      const scaleY = rawScreenImage.naturalHeight / screenHeight;
      offCtx.drawImage(
        rawScreenImage,
        x * scaleX,
        y * scaleY,
        w * scaleX,
        h * scaleY,
        0,
        0,
        w,
        h
      );
    } else {
      // Direct fallback crop from bgCanvas
      offCtx.drawImage(bgCanvas, x, y, w, h, 0, 0, w, h);
    }

    return offscreen.toDataURL('image/png');
  }

  // Draw initial glowing beacon dot on pointerdown
  function renderLassoDot(x, y) {
    lassoCtx.save();
    lassoCtx.beginPath();
    lassoCtx.arc(x, y, 5, 0, Math.PI * 2);
    lassoCtx.fillStyle = '#8AB4F8';
    lassoCtx.shadowColor = 'rgba(138, 180, 248, 1)';
    lassoCtx.shadowBlur = 15;
    lassoCtx.fill();
    lassoCtx.restore();
  }

  // Pointerdown: Start drawing lasso
  function onPointerDown(e) {
    if (e.button !== 0) return; // Left button only

    // If click is inside AI card, don't draw lasso
    if (!aiCard.classList.contains('hidden')) {
      const cardRect = aiCard.getBoundingClientRect();
      if (e.clientX >= cardRect.left && e.clientX <= cardRect.right &&
        e.clientY >= cardRect.top && e.clientY <= cardRect.bottom) {
        return;
      }
    }

    // If card was already active and user clicks outside, dismiss overlay
    if (hasActiveCard) {
      window.haloAPI.hideOverlay();
      resetAll();
      return;
    }

    e.preventDefault();
    lassoCtx.clearRect(0, 0, screenWidth, screenHeight);
    isDrawing = true;
    points = [{ x: e.clientX, y: e.clientY }];
    hintBanner.classList.add('fade-out');

    // Draw immediate glowing feedback dot
    renderLassoDot(e.clientX, e.clientY);
  }

  // Pointermove: Append points and draw glowing rounded square
  function onPointerMove(e) {
    if (!isDrawing) return;
    e.preventDefault();

    points.push({ x: e.clientX, y: e.clientY });
    renderSquircleSelection(points, false);
  }

  // Pointerup: Finish circle selection
  function onPointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    e.preventDefault();

    if (points.length < 2) {
      clearLasso();
      return;
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;

    if (width < 10 && height < 10) {
      // Accidental tiny click
      clearLasso();
      window.haloAPI.hideOverlay();
      return;
    }

    // Visually lock the glowing rounded square
    renderSquircleSelection(points, true);

    currentSelectionBounds = { minX, minY, maxX, maxY, width, height };
    hasActiveCard = true;

    // Show loading shimmer card anchored right next to circled region
    if (window.cardRenderer) {
      window.cardRenderer.anchorAndShowLoading(currentSelectionBounds);
    }

    // Crop image and dispatch to Python sidecar
    const imageBase64 = getCroppedBase64(currentSelectionBounds);
    if (imageBase64) {
      window.haloAPI.analyzeCrop({
        image_base64: imageBase64,
        imageBase64: imageBase64,
        bounds: currentSelectionBounds
      });
    }
  }

  function resetAll() {
    clearLasso();
    hasActiveCard = false;
    hintBanner.classList.remove('fade-out');
    if (window.cardRenderer) {
      window.cardRenderer.hide();
    }
  }

  // Handle incoming screen capture from main process
  window.haloAPI.onScreenCaptured((captureData) => {
    resetAll();
    resizeCanvases();

    if (captureData && captureData.dataUrl) {
      const img = new Image();
      img.onload = () => {
        rawScreenImage = img;
        renderBackgroundImage();
      };
      img.src = captureData.dataUrl;
    }
  });

  // Global keyboard shortcuts (Escape to dismiss)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.haloAPI.hideOverlay();
      resetAll();
    }
  });

  // Window resize handler
  window.addEventListener('resize', resizeCanvases);

  // Pointer and mouse event listeners on window
  window.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: false });
  window.addEventListener('pointercancel', onPointerUp, { passive: false });

  // Expose reset for card actions (e.g. Rescan button)
  window.canvasManager = {
    resetAll,
    getSelectionBounds: () => currentSelectionBounds,
    getCroppedBase64: () => currentSelectionBounds ? getCroppedBase64(currentSelectionBounds) : null
  };

  // Initial canvas setup
  resizeCanvases();
})();
