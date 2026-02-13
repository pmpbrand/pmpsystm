// Voices page handler (ticket-gated confession world)

(function() {
  'use strict';

  const EDGE_FUNCTION_URL = 'https://nueebvyiswezishlzuku.supabase.co/functions/v1/confessions-browse';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZWVidnlpc3dlemlzaGx6dWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjM5MTksImV4cCI6MjA4MTYzOTkxOX0.IKOeMO8RDgR8KlG_RpnTKVtbh2prJhbAyKIt1R89j4M';
  const DEBUG = window.PMP_DEBUG === true;
  const PAGE_SIZE = 60;

  function debugLog(...args) {
    if (DEBUG) {
      console.log(...args);
    }
  }

  function normalizeCode(code) {
    return (code || '').trim().toUpperCase();
  }

  function getElement(selectors, root = document) {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function createErrorBox(container) {
    const errorBox = document.createElement('div');
    errorBox.setAttribute('data-voices-error', '');
    errorBox.style.cssText = 'margin-top: 12px; padding: 10px 12px; background: #fee; border: 1px solid #fcc; color: #c33; border-radius: 4px; font-size: 14px; display: none;';
    container.appendChild(errorBox);
    return errorBox;
  }

  function init() {
    const templateBlock = document.querySelector('.confession_block_template');
    if (!templateBlock) {
      console.error('Voices template block not found');
      setTimeout(init, 500);
      return;
    }

    const worldContainer = templateBlock.parentElement;
    if (!worldContainer) {
      console.error('Voices world container not found');
      return;
    }

    const viewport = getElement(['[data-voices-viewport]', '.voices-world-viewport'], document) || worldContainer.parentElement || worldContainer;

    const gateForm = getElement([
      '[data-voices-gate]',
      'form[data-name="Voices Gate"]',
      'form#voices-gate',
      'form.voices-gate',
      'form'
    ]);

    const ticketInput = getElement([
      '#voices-ticket-input',
      'input[name="code"]',
      '.voices-ticket-input',
      'input[type="text"]'
    ], gateForm || document);

    const submitButtons = [];
    const submitButtonNodes = gateForm
      ? gateForm.querySelectorAll('#voices-ticket-submit, button[type="submit"], .voices-ticket-submit, button:not([type])')
      : document.querySelectorAll('#voices-ticket-submit, button[type="submit"], .voices-ticket-submit, button:not([type])');

    const loadingEl = getElement([
      '[data-voices-loading]',
      '#voices-loading',
      '.voices-loading'
    ], document);

    let errorBox = getElement(['[data-voices-error]'], gateForm || document);
    if (!errorBox && gateForm) {
      errorBox = createErrorBox(gateForm);
    }

    let ticketCode = '';
    let isValidating = false;
    let offset = 0;
    let isFetching = false;
    let canLoadMore = true;
    let pendingAutoLoad = false;
    const confessionMap = new Map();

    const { cellWidth, cellHeight, jitterX, jitterY } = measureBlock(templateBlock);
    const nextSpiral = createSpiral();
    templateBlock.style.display = 'none';

    setupWorldStyles(viewport, worldContainer);
    setupPanning(viewport, worldContainer, () => {
      maybeLoadMore();
    });

    if (loadingEl) {
      loadingEl.style.display = 'none';
    }

    const handleSubmit = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      validateAndLoad();
    };

    if (gateForm) {
      gateForm.removeAttribute('action');
      gateForm.setAttribute('method', 'post');
      gateForm.setAttribute('onsubmit', 'return false;');
      gateForm.addEventListener('submit', handleSubmit, true);
      gateForm.onsubmit = function(e) {
        e.preventDefault();
        handleSubmit(e);
        return false;
      };
    }

    submitButtonNodes.forEach((btn) => {
      const newBtn = btn.cloneNode(true);
      if (btn.parentNode) {
        btn.parentNode.replaceChild(newBtn, btn);
      }
      submitButtons.push(newBtn);
      newBtn.addEventListener('click', function(e) {
        if (e.target.type === 'submit' || e.target.tagName === 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
          if (gateForm && !isValidating) {
            gateForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          } else if (!gateForm) {
            handleSubmit(e);
          }
        }
      }, true);
    });

    async function validateAndLoad() {
      if (isValidating) return;
      if (!ticketInput) {
        showGateError('Ticket input not found.');
        return;
      }
      const code = normalizeCode(ticketInput.value);
      if (!code) {
        showGateError('Please enter your ticket code.');
        return;
      }

      setGateBusy(true);
      isValidating = true;
      try {
        const ok = await validateTicket(code);
        if (!ok) {
          showGateError('Invalid ticket code.');
          setGateBusy(false);
          isValidating = false;
          return;
        }
        ticketCode = code;
        hideGate();
        await loadNextPage();
      } catch (err) {
        console.error('Ticket validation failed:', err);
        showGateError('Unable to validate ticket. Please try again.');
      } finally {
        setGateBusy(false);
        isValidating = false;
      }
    }

    function showGateError(message) {
      if (!errorBox) return;
      errorBox.textContent = message;
      errorBox.style.display = 'block';
    }

    function hideGate() {
      if (gateForm) {
        gateForm.style.display = 'none';
      }
      if (loadingEl) {
        loadingEl.style.display = 'block';
      }
    }

    function setGateBusy(isBusy) {
      submitButtons.forEach((btn) => {
        btn.disabled = isBusy;
        btn.setAttribute('aria-disabled', String(isBusy));
      });
      if (ticketInput) {
        ticketInput.disabled = isBusy;
      }
    }

    async function validateTicket(code) {
      debugLog('Validating ticket', code);
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'validate_ticket', code })
      });
      const data = await response.json();
      debugLog('Ticket validation response', data);
      return response.ok && data.ok === true;
    }

    async function loadNextPage() {
      if (isFetching || !canLoadMore) return;
      isFetching = true;
      if (loadingEl) loadingEl.style.display = 'block';

      try {
        const url = new URL(EDGE_FUNCTION_URL);
        url.searchParams.set('code', ticketCode);
        url.searchParams.set('limit', String(PAGE_SIZE));
        url.searchParams.set('offset', String(offset));

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          }
        });

        const data = await response.json();
        debugLog('Confession fetch response', data);

        if (!response.ok || !data.ok) {
          showGateError(data.error || 'Failed to load confessions.');
          canLoadMore = false;
          return;
        }

        const confessions = data.confessions || [];
        if (confessions.length < PAGE_SIZE) {
          canLoadMore = false;
          pendingAutoLoad = false;
        } else {
          pendingAutoLoad = true;
        }

        confessions.forEach((confession) => {
          if (confessionMap.has(confession.id)) {
            return;
          }
          const block = buildConfessionBlock(confession);
          confessionMap.set(confession.id, block);
        });

        offset += confessions.length;
      } catch (err) {
        console.error('Failed to load confessions:', err);
        showGateError('Failed to load confessions. Please refresh.');
      } finally {
        isFetching = false;
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }

    function maybeLoadMore() {
      if (isFetching || !canLoadMore || !pendingAutoLoad) return;
      pendingAutoLoad = false;
      loadNextPage();
    }

    function buildConfessionBlock(confession) {
      const clone = templateBlock.cloneNode(true);
      clone.style.display = '';
      clone.style.position = 'absolute';
      clone.style.left = '0';
      clone.style.top = '0';
      clone.style.transform = 'translate(0px, 0px)';

      const quote = clone.querySelector('.confession_quote');
      if (quote) {
        quote.textContent = confession.text || '';
      }

      const voteButton = clone.querySelector('.--confession_vote_button');
      const voteCount = clone.querySelector('.--confession_vote_count');

      if (voteCount) {
        voteCount.textContent = String(confession.vote_count || 0);
      }

      if (voteButton) {
        if (confession.voted_by_me) {
          voteButton.textContent = 'Voted';
          voteButton.disabled = true;
        }
        voteButton.addEventListener('click', async (e) => {
          e.preventDefault();
          if (voteButton.disabled) return;
          voteButton.disabled = true;
          const success = await submitVote(confession.id);
          if (success) {
            voteButton.textContent = 'Voted';
            if (voteCount) {
              voteCount.textContent = String((confession.vote_count || 0) + 1);
            }
          } else {
            voteButton.disabled = false;
          }
        });
      }

      const position = nextSpiral();
      const x = position.x * cellWidth + randomRange(-jitterX, jitterX);
      const y = position.y * cellHeight + randomRange(-jitterY, jitterY);
      clone.style.transform = `translate(${x}px, ${y}px)`;

      worldContainer.appendChild(clone);
      return clone;
    }

    async function submitVote(confessionId) {
      try {
        const response = await fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ action: 'vote', code: ticketCode, confessionId })
        });

        const data = await response.json();
        debugLog('Vote response', data);
        return response.ok && data.ok === true;
      } catch (err) {
        console.error('Vote failed:', err);
        return false;
      }
    }
  }

  function measureBlock(templateBlock) {
    const rect = templateBlock.getBoundingClientRect();
    const computed = window.getComputedStyle(templateBlock);
    const marginX = parseFloat(computed.marginLeft || '0') + parseFloat(computed.marginRight || '0');
    const marginY = parseFloat(computed.marginTop || '0') + parseFloat(computed.marginBottom || '0');

    const blockWidth = rect.width || 400;
    const blockHeight = rect.height || 400;

    return {
      cellWidth: blockWidth + marginX,
      cellHeight: blockHeight + marginY,
      jitterX: (blockWidth + marginX) * 0.2,
      jitterY: (blockHeight + marginY) * 0.2,
    };
  }

  function setupWorldStyles(viewport, worldContainer) {
    viewport.style.overflow = 'hidden';
    viewport.style.position = viewport.style.position || 'relative';
    viewport.style.touchAction = 'none';
    viewport.style.cursor = 'grab';

    worldContainer.style.position = 'relative';
    worldContainer.style.width = '100%';
    worldContainer.style.height = '100%';
    worldContainer.style.transform = 'translate3d(0px, 0px, 0px)';
  }

  function setupPanning(viewport, worldContainer, onPan) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;

    const updateTransform = () => {
      worldContainer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
      if (onPan) onPan();
    };

    viewport.addEventListener('mousedown', (e) => {
      isDragging = true;
      viewport.style.cursor = 'grabbing';
      startX = e.clientX - offsetX;
      startY = e.clientY - offsetY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      offsetX = e.clientX - startX;
      offsetY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      viewport.style.cursor = 'grab';
    });

    viewport.addEventListener('touchstart', (e) => {
      if (!e.touches[0]) return;
      isDragging = true;
      viewport.style.cursor = 'grabbing';
      startX = e.touches[0].clientX - offsetX;
      startY = e.touches[0].clientY - offsetY;
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (!isDragging || !e.touches[0]) return;
      offsetX = e.touches[0].clientX - startX;
      offsetY = e.touches[0].clientY - startY;
      updateTransform();
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
      viewport.style.cursor = 'grab';
    });

    viewport.addEventListener('wheel', (e) => {
      offsetX -= e.deltaX;
      offsetY -= e.deltaY;
      updateTransform();
      e.preventDefault();
    }, { passive: false });
  }

  function createSpiral() {
    let x = 0;
    let y = 0;
    let dx = 1;
    let dy = 0;
    let segmentLength = 1;
    let segmentPassed = 0;
    let segmentTurns = 0;

    return function next() {
      const pos = { x, y };
      x += dx;
      y += dy;
      segmentPassed += 1;

      if (segmentPassed === segmentLength) {
        segmentPassed = 0;
        const temp = dx;
        dx = -dy;
        dy = temp;
        segmentTurns += 1;
        if (segmentTurns % 2 === 0) {
          segmentLength += 1;
        }
      }

      return pos;
    };
  }

  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
