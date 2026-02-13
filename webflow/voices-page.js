// Voices page handler (modular grid confession world)

(function() {
  'use strict';

  const EDGE_FUNCTION_URL = 'https://nueebvyiswezishlzuku.supabase.co/functions/v1/confessions-browse';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZWVidnlpc3dlemlzaGx6dWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjM5MTksImV4cCI6MjA4MTYzOTkxOX0.IKOeMO8RDgR8KlG_RpnTKVtbh2prJhbAyKIt1R89j4M';
  const DEBUG = window.PMP_DEBUG === true;
  const PAGE_SIZE = 200;
  const BIG_EVERY = 8;

  function debugLog(...args) {
    if (DEBUG) {
      console.log(...args);
    }
  }

  function init() {
    const viewport = document.querySelector('[data-voices-viewport]') || document.body;
    const smallTemplate = document.querySelector('.confession_block_template');
    const bigTemplate = document.querySelector('.confession_block_big_template');

    if (!smallTemplate) {
      console.error('Voices template block not found');
      setTimeout(init, 500);
      return;
    }

    const worldContainer = smallTemplate.parentElement;
    if (!worldContainer) {
      console.error('Voices world container not found');
      return;
    }

    const gateForm = document.querySelector('#voices-gate') || document.querySelector('form');
    const ticketInput = gateForm ? gateForm.querySelector('#voices-ticket-input, input[name="code"], input[type="text"]') : null;
    const submitButtons = gateForm
      ? gateForm.querySelectorAll('#voices-ticket-submit, button[type="submit"], button:not([type])')
      : [];

    const loadingEl = document.querySelector('[data-voices-loading]') || document.getElementById('voices-loading');
    const voteStatusEl = document.getElementById('voices-vote-status');
    let errorBox = document.querySelector('[data-voices-error]');

    if (!errorBox && gateForm) {
      errorBox = createErrorBox(gateForm);
    }

    const cellWidth = 300;
    const cellHeight = 300;
    const columns = Math.max(1, Math.floor((viewport.clientWidth || window.innerWidth || cellWidth) / cellWidth));

    const occupancy = new Set();
    let cursorCol = 0;
    let cursorRow = 0;
    let itemIndex = 0;
    let hasVoted = false;

    smallTemplate.style.display = 'none';
    if (bigTemplate) {
      bigTemplate.style.display = 'none';
    }

    setupWorldStyles(viewport, worldContainer);
    const panState = setupPanning(viewport, worldContainer);

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

    submitButtons.forEach((btn) => {
      const newBtn = btn.cloneNode(true);
      if (btn.parentNode) {
        btn.parentNode.replaceChild(newBtn, btn);
      }
      newBtn.addEventListener('click', function(e) {
        if (e.target.type === 'submit' || e.target.tagName === 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
          if (gateForm) {
            gateForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          } else {
            handleSubmit(e);
          }
        }
      }, true);
    });

    async function validateAndLoad() {
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
      try {
        const ok = await validateTicket(code);
        if (!ok) {
          showGateError('Invalid ticket code.');
          setGateBusy(false);
          return;
        }
        if (gateForm) {
          gateForm.style.display = 'none';
        }
        if (loadingEl) {
          loadingEl.style.display = 'block';
        }
        await loadAllConfessions(code);
        updateVoteStatus();
        centerWorld(panState, viewport, worldContainer);
      } catch (err) {
        console.error('Ticket validation failed:', err);
        showGateError('Unable to validate ticket. Please try again.');
      } finally {
        setGateBusy(false);
        if (loadingEl) {
          loadingEl.style.display = 'none';
        }
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

    function showGateError(message) {
      if (!errorBox) return;
      errorBox.textContent = message;
      errorBox.style.display = 'block';
    }

    function updateVoteStatus() {
      if (!voteStatusEl) return;
      voteStatusEl.textContent = hasVoted ? 'Vote used' : '1 vote left';
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

    async function loadAllConfessions(code) {
      let offset = 0;
      let fetched = 0;
      do {
        const batch = await fetchConfessions(code, offset);
        fetched = batch.length;
        batch.forEach((confession) => {
          buildConfessionBlock(confession, code);
        });
        offset += fetched;
      } while (fetched === PAGE_SIZE);
    }

    async function fetchConfessions(code, offset) {
      const url = new URL(EDGE_FUNCTION_URL);
      url.searchParams.set('code', code);
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
        throw new Error(data.error || 'Failed to load confessions');
      }

      return data.confessions || [];
    }

    function buildConfessionBlock(confession, code) {
      let useBig = Boolean(bigTemplate) && (itemIndex + 1) % BIG_EVERY === 0;
      if (useBig && (columns < 2 || !canFitAtCursor(2))) {
        useBig = false;
      }

      const span = useBig ? 2 : 1;
      const template = useBig ? bigTemplate : smallTemplate;
      const clone = template.cloneNode(true);

      clone.style.display = '';
      clone.style.position = 'absolute';
      clone.style.left = '0';
      clone.style.top = '0';
      clone.style.transform = 'translate(0px, 0px)';

      const quoteSelector = useBig ? '.confession_quote_big' : '.confession_quote';
      const quote = clone.querySelector(quoteSelector);
      if (quote) {
        quote.textContent = confession.text || '';
      }

      const voteButton = clone.querySelector('.confession_vote_button');
      const voteCount = clone.querySelector('.confession_vote_count');

      if (voteCount) {
        voteCount.textContent = String(confession.vote_count || 0);
      }

      if (voteButton) {
        if (confession.voted_by_me) {
          voteButton.textContent = 'Voted';
          voteButton.disabled = true;
          if (!hasVoted) {
            hasVoted = true;
            updateVoteStatus();
          }
        }
        voteButton.addEventListener('click', async (e) => {
          e.preventDefault();
          if (voteButton.disabled) return;
          voteButton.disabled = true;
          const success = await submitVote(code, confession.id);
          if (success) {
            voteButton.textContent = 'Voted';
            if (voteCount) {
              voteCount.textContent = String((confession.vote_count || 0) + 1);
            }
            if (!hasVoted) {
              hasVoted = true;
              updateVoteStatus();
            }
          } else {
            voteButton.disabled = false;
          }
        });
      }

      const placement = nextPlacement(span);
      const x = placement.col * cellWidth;
      const y = placement.row * cellHeight;
      clone.style.transform = `translate(${x}px, ${y}px)`;

      updateWorldSize(placement.row + span, columns, cellWidth, cellHeight, worldContainer);

      worldContainer.appendChild(clone);
      itemIndex += 1;
    }

    async function submitVote(code, confessionId) {
      try {
        const response = await fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ action: 'vote', code, confessionId })
        });

        const data = await response.json();
        debugLog('Vote response', data);
        return response.ok && data.ok === true;
      } catch (err) {
        console.error('Vote failed:', err);
        return false;
      }
    }

    function nextPlacement(span) {
      while (true) {
        if (cursorCol >= columns) {
          cursorCol = 0;
          cursorRow += 1;
        }

        if (span > 1 && cursorCol + span > columns) {
          cursorCol = 0;
          cursorRow += 1;
          continue;
        }

        if (!isOccupied(cursorCol, cursorRow, span)) {
          const placement = { col: cursorCol, row: cursorRow };
          markOccupied(cursorCol, cursorRow, span);
          cursorCol += span;
          return placement;
        }

        cursorCol += 1;
      }
    }

    function canFitAtCursor(span) {
      if (span > 1 && cursorCol + span > columns) {
        return false;
      }
      return !isOccupied(cursorCol, cursorRow, span);
    }

    function isOccupied(col, row, span) {
      for (let r = row; r < row + span; r += 1) {
        for (let c = col; c < col + span; c += 1) {
          if (occupancy.has(`${c},${r}`)) {
            return true;
          }
        }
      }
      return false;
    }

    function markOccupied(col, row, span) {
      for (let r = row; r < row + span; r += 1) {
        for (let c = col; c < col + span; c += 1) {
          occupancy.add(`${c},${r}`);
        }
      }
    }
  }

  function updateWorldSize(rows, columns, cellWidth, cellHeight, worldContainer) {
    const nextWidth = Math.max(worldContainer.offsetWidth, columns * cellWidth);
    const nextHeight = Math.max(worldContainer.offsetHeight, rows * cellHeight);
    worldContainer.style.width = `${nextWidth}px`;
    worldContainer.style.height = `${nextHeight}px`;
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

  function setupPanning(viewport, worldContainer) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;

    const updateTransform = () => {
      worldContainer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
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

    return {
      setOffset(x, y) {
        offsetX = x;
        offsetY = y;
        updateTransform();
      },
    };
  }

  function centerWorld(panState, viewport, worldContainer) {
    const worldWidth = worldContainer.offsetWidth || viewport.clientWidth || 0;
    const worldHeight = worldContainer.offsetHeight || viewport.clientHeight || 0;
    const offsetX = (viewport.clientWidth - worldWidth) / 2;
    const offsetY = (viewport.clientHeight - worldHeight) / 2;
    panState.setOffset(offsetX, offsetY);
  }

  function normalizeCode(code) {
    return (code || '').trim().toUpperCase();
  }

  function createErrorBox(container) {
    const errorBox = document.createElement('div');
    errorBox.setAttribute('data-voices-error', '');
    errorBox.style.cssText = 'margin-top: 12px; padding: 10px 12px; background: #fee; border: 1px solid #fcc; color: #c33; border-radius: 4px; font-size: 14px; display: none;';
    container.appendChild(errorBox);
    return errorBox;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
