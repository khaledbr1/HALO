// card_renderer.js - Google AI Overview Floating Card Renderer & Anchoring

(function() {
  const aiCard = document.getElementById('aiCard');
  const loadingPlaceholder = document.getElementById('loadingPlaceholder');
  const cardContent = document.getElementById('cardContent');
  const closeBtn = document.getElementById('closeBtn');

  // Left Column Elements
  const summaryText = document.getElementById('summaryText');
  const inlineSources = document.getElementById('inlineSources');
  const keyFeaturesContainer = document.getElementById('keyFeaturesContainer');
  const keyFeaturesList = document.getElementById('keyFeaturesList');
  const extendedDrawer = document.getElementById('extendedDrawer');
  const extendedContent = document.getElementById('extendedContent');
  const showMoreBtn = document.getElementById('showMoreBtn');
  const showMoreLabel = document.getElementById('showMoreLabel');
  const modelBadge = document.getElementById('modelBadge');

  // Right Column Elements
  const sourceCardsStack = document.getElementById('sourceCardsStack');
  const sourceCount = document.getElementById('sourceCount');

  // Bottom Bar Elements
  const followUpForm = document.getElementById('followUpForm');
  const followUpInput = document.getElementById('followUpInput');
  const copyBtn = document.getElementById('copyBtn');
  const translateBtn = document.getElementById('translateBtn');
  const rescanBtn = document.getElementById('rescanBtn');

  let currentAnalysisData = null;
  let activeBounds = null;
  let isDrawerExpanded = false;

  // Simple Markdown inline formatter for bold, code, and links
  function formatMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold: **text** or __text__
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code style="background:#282A2E;padding:2px 5px;border-radius:4px;font-size:12px;color:#8AB4F8;">$1</code>');

    return html;
  }

  // Anchoring & Coordinate Math
  function positionCard(bounds) {
    activeBounds = bounds;
    const cardWidth = 660; // Base fixed width of floating card
    const margin = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const x1 = bounds.minX;
    const y1 = bounds.minY;
    const x2 = bounds.maxX;

    // Anchor at x = x2 + 16px, y = y1
    let targetX = x2 + margin;
    let targetY = y1;

    // If card extends past right viewport edge, flip to left of selection
    if (targetX + cardWidth > viewportWidth - margin) {
      targetX = x1 - cardWidth - margin;
    }

    // If flipped card still overflows left viewport edge, clamp inside screen
    if (targetX < margin) {
      // Place where there's maximum room or clamp to margin
      if (x1 > viewportWidth - x2) {
        targetX = Math.max(margin, x1 - cardWidth - margin);
      } else {
        targetX = margin;
      }
    }

    // Measure or estimate height and clamp vertically
    const estimatedHeight = aiCard.offsetHeight || 420;
    if (targetY + estimatedHeight > viewportHeight - margin) {
      targetY = viewportHeight - estimatedHeight - margin;
    }
    targetY = Math.max(margin, targetY);

    // Apply smooth anchored positioning
    aiCard.style.left = `${Math.round(targetX)}px`;
    aiCard.style.top = `${Math.round(targetY)}px`;
  }

  // Anchor and show Loading Shimmer state immediately
  function anchorAndShowLoading(bounds) {
    activeBounds = bounds;
    aiCard.classList.remove('hidden');
    loadingPlaceholder.classList.remove('hidden');
    cardContent.classList.add('hidden');
    
    // Reset state
    isDrawerExpanded = false;
    extendedDrawer.classList.add('collapsed');
    extendedDrawer.classList.remove('expanded');
    showMoreBtn.classList.remove('open');
    showMoreLabel.textContent = 'Show more';
    followUpInput.value = '';

    positionCard(bounds);
  }

  // Render populated response data
  function renderAnalysisData(data) {
    loadingPlaceholder.classList.add('hidden');
    cardContent.classList.remove('hidden');

    // If this is a translation update
    if (data.translated_text) {
      const label = translateBtn.querySelector('.btn-label');
      label.textContent = 'Translated';
      summaryText.innerHTML = formatMarkdown(data.translated_text);
      if (currentAnalysisData) {
        currentAnalysisData.translated = data.translated_text;
      }
      return;
    }

    currentAnalysisData = data;

    // Reset translate button label
    const transLabel = translateBtn.querySelector('.btn-label');
    if (transLabel) transLabel.textContent = 'Translate';

    // Update model / engine badge
    if (data.model) {
      if (data.engine === 'groq') {
        modelBadge.textContent = `Groq • ${data.model.replace(' (Groq LPU)', '').replace(' (Groq)', '')}`;
      } else if (data.engine === 'google-genai') {
        modelBadge.textContent = `${data.model} Grounded`;
      } else {
        modelBadge.textContent = 'Local Fallback';
      }
    }

    // 1. Left Column: Summary
    summaryText.innerHTML = formatMarkdown(data.summary || 'Visual search complete.');

    // 2. Left Column: Inline Source Badges (First 3 sources)
    inlineSources.innerHTML = '';
    const sources = data.sources || [];
    const inlineList = sources.slice(0, 3);

    inlineList.forEach((src) => {
      const pill = document.createElement('a');
      pill.className = 'source-pill';
      pill.href = '#';
      pill.title = src.title;

      const faviconImg = document.createElement('img');
      faviconImg.className = 'source-pill-favicon';
      faviconImg.src = src.favicon || 'https://www.google.com/s2/favicons?domain=google.com&sz=32';
      faviconImg.alt = '';
      faviconImg.onerror = () => { faviconImg.style.display = 'none'; };

      const domainSpan = document.createElement('span');
      domainSpan.className = 'source-pill-domain';
      domainSpan.textContent = src.domain || 'source';

      pill.appendChild(faviconImg);
      pill.appendChild(domainSpan);

      pill.addEventListener('click', (e) => {
        e.preventDefault();
        if (src.url) window.haloAPI.openExternal(src.url);
      });

      inlineSources.appendChild(pill);
    });

    // 3. Left Column: Key Features / Insights Bullets
    keyFeaturesList.innerHTML = '';
    const features = data.key_features || [];
    if (features.length > 0) {
      keyFeaturesContainer.style.display = 'flex';
      features.forEach((feat) => {
        const li = document.createElement('li');
        li.innerHTML = formatMarkdown(feat);
        keyFeaturesList.appendChild(li);
      });
    } else {
      keyFeaturesContainer.style.display = 'none';
    }

    // 4. Left Column: Extended Details Drawer
    const extendedText = data.extended_details || '';
    if (extendedText.trim()) {
      showMoreBtn.style.display = 'inline-flex';
      extendedContent.innerHTML = formatMarkdown(extendedText);
    } else {
      showMoreBtn.style.display = 'none';
    }

    // 5. Right Column: Source Cards Stack (220px width)
    sourceCardsStack.innerHTML = '';
    sourceCount.textContent = sources.length.toString();

    if (sources.length === 0) {
      const emptyNotice = document.createElement('div');
      emptyNotice.style.fontSize = '12px';
      emptyNotice.style.color = '#80868B';
      emptyNotice.style.padding = '10px 0';
      emptyNotice.textContent = 'No external web links returned.';
      sourceCardsStack.appendChild(emptyNotice);
    } else {
      sources.slice(0, 4).forEach((src) => {
        const card = document.createElement('div');
        card.className = 'web-card';

        const topRow = document.createElement('div');
        topRow.className = 'card-top-row';

        const fav = document.createElement('img');
        fav.className = 'card-favicon';
        fav.src = src.favicon || 'https://www.google.com/s2/favicons?domain=google.com&sz=32';
        fav.alt = '';
        fav.onerror = () => { fav.style.display = 'none'; };

        const dom = document.createElement('span');
        dom.className = 'card-domain';
        dom.textContent = src.domain || 'web source';

        topRow.appendChild(fav);
        topRow.appendChild(dom);

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = src.title || src.domain || 'Source Reference';

        const snippet = document.createElement('div');
        snippet.className = 'card-snippet';
        snippet.textContent = src.snippet || 'Grounded Google Search result';

        card.appendChild(topRow);
        card.appendChild(title);
        card.appendChild(snippet);

        card.addEventListener('click', () => {
          if (src.url) window.haloAPI.openExternal(src.url);
        });

        sourceCardsStack.appendChild(card);
      });
    }

    // Re-adjust card position if vertical height grew
    if (activeBounds) {
      requestAnimationFrame(() => positionCard(activeBounds));
    }
  }

  // Hide the AI Overview Card
  function hide() {
    aiCard.classList.add('hidden');
    currentAnalysisData = null;
    activeBounds = null;
  }

  // Setup Event Listeners
  closeBtn.addEventListener('click', () => {
    window.haloAPI.hideOverlay();
    if (window.canvasManager) window.canvasManager.resetAll();
  });

  // "Show more ∨" Drawer Toggle
  showMoreBtn.addEventListener('click', () => {
    isDrawerExpanded = !isDrawerExpanded;
    if (isDrawerExpanded) {
      extendedDrawer.classList.remove('collapsed');
      extendedDrawer.classList.add('expanded');
      showMoreBtn.classList.add('open');
      showMoreLabel.textContent = 'Show less';
    } else {
      extendedDrawer.classList.add('collapsed');
      extendedDrawer.classList.remove('expanded');
      showMoreBtn.classList.remove('open');
      showMoreLabel.textContent = 'Show more';
    }
    if (activeBounds) {
      positionCard(activeBounds);
    }
  });

  // Follow-up Input Submission
  followUpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = followUpInput.value.trim();
    if (!query) return;

    const previousSummary = currentAnalysisData ? currentAnalysisData.raw_markdown || currentAnalysisData.summary : '';

    // Show loading shimmer
    if (activeBounds) {
      anchorAndShowLoading(activeBounds);
    }

    window.haloAPI.askFollowUp({
      context_summary: previousSummary,
      question: query
    });

    followUpInput.value = '';
  });

  // Action Pill: Copy
  copyBtn.addEventListener('click', () => {
    if (!currentAnalysisData) return;
    const textToCopy = currentAnalysisData.raw_markdown || 
      `${currentAnalysisData.summary}\n\n` + 
      (currentAnalysisData.key_features || []).map(f => `• ${f}`).join('\n') + 
      `\n\n${currentAnalysisData.extended_details || ''}`;

    window.haloAPI.copyToClipboard(textToCopy);

    const label = copyBtn.querySelector('.btn-label');
    const originalText = label.textContent;
    label.textContent = 'Copied!';
    copyBtn.style.color = '#8AB4F8';
    setTimeout(() => {
      label.textContent = originalText;
      copyBtn.style.color = '';
    }, 1800);
  });

  // Action Pill: Translate
  translateBtn.addEventListener('click', () => {
    if (!currentAnalysisData) return;
    const textToTranslate = currentAnalysisData.summary;
    const label = translateBtn.querySelector('.btn-label');
    label.textContent = 'Translating...';

    window.haloAPI.translateText({
      text: textToTranslate,
      target_lang: 'es' // or alternate language
    });
  });

  // Action Pill: Rescan
  rescanBtn.addEventListener('click', () => {
    hide();
    if (window.canvasManager) {
      window.canvasManager.resetAll();
    }
  });

  // Listen for analysis results from Main process
  window.haloAPI.onAnalysisResult((data) => {
    renderAnalysisData(data);
  });

  // Listen for analysis errors
  window.haloAPI.onAnalysisError((err) => {
    loadingPlaceholder.classList.add('hidden');
    cardContent.classList.remove('hidden');
    summaryText.innerHTML = `<strong>Search Error:</strong> ${formatMarkdown(err.message || 'Failed to analyze selection.')}`;
    keyFeaturesContainer.style.display = 'none';
    showMoreBtn.style.display = 'none';
    sourceCardsStack.innerHTML = '<div style="font-size:12px;color:#EA4335;">Unable to retrieve search sources.</div>';
  });

  // Expose API
  window.cardRenderer = {
    anchorAndShowLoading,
    renderAnalysisData,
    positionCard,
    hide
  };
})();
