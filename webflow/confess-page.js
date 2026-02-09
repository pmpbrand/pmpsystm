// Cloudflare Turnstile Script
// NOTE: include this separately in Webflow <head>

(function() {
  'use strict';

  const EDGE_FUNCTION_URL = 'https://nueebvyiswezishlzuku.supabase.co/functions/v1/confess';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZWVidnlpc3dlemlzaGx6dWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjM5MTksImV4cCI6MjA4MTYzOTkxOX0.IKOeMO8RDgR8KlG_RpnTKVtbh2prJhbAyKIt1R89j4M';
  const TURNSTILE_SITE_KEY = '0x4AAAAAACM4eF914zsRvui3';
  const DEBUG = window.PMP_DEBUG === true;

  function debugLog(...args) {
    if (DEBUG) {
      console.log(...args);
    }
  }

  debugLog('PMP V1 Confession form script loaded');

  let turnstileToken = ''; // Store token when widget completes
  let turnstileWidgetId = null;
  let isSubmitting = false; // Prevent multiple submissions

  async function generateFingerprintHash() {
    const fingerprint = [
      navigator.userAgent || '',
      navigator.language || '',
      new Date().getTimezoneOffset().toString(),
      (window.screen?.width || 0).toString(),
      (window.screen?.height || 0).toString(),
    ].join('|');

    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function init() {
    debugLog('Initializing PMP V1 confession form handler...');

    const submitButtons = [];
    const setSubmitEnabled = (enabled) => {
      submitButtons.forEach((btn) => {
        btn.disabled = !enabled;
        btn.setAttribute('aria-disabled', String(!enabled));
      });
    };

    const form = document.querySelector('form[data-name="Confession"]') ||
                 document.querySelector('form#wf-form-Confession') ||
                 document.querySelector('form[data-name*="confess" i]') ||
                 document.querySelector('form.w-form') ||
                 document.querySelector('form');

    if (!form) {
      setTimeout(init, 500);
      return;
    }

    debugLog('Form found:', form);

    let confessionInput = form.querySelector('textarea[name="confession_text"]') ||
                         form.querySelector('input[name="confession_text"]') ||
                         form.querySelector('textarea') ||
                         form.querySelector('input[type="text"]');

    if (!confessionInput) {
      setTimeout(init, 1000);
      return;
    }

    debugLog('Confession input found:', confessionInput);

    form.removeAttribute('action');
    form.setAttribute('method', 'post');
    form.setAttribute('onsubmit', 'return false;');

    // Remove Webflow's Turnstile data attribute
    form.removeAttribute('data-turnstile-sitekey');

    // Find or create our Turnstile container
    let ourTurnstileContainer = document.getElementById('pmp-turnstile-widget');
    
    if (!ourTurnstileContainer) {
      ourTurnstileContainer = document.createElement('div');
      ourTurnstileContainer.id = 'pmp-turnstile-widget';
      ourTurnstileContainer.setAttribute('aria-hidden', 'true');
      ourTurnstileContainer.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 300px; height: 65px; opacity: 0; pointer-events: none;';
      
      const submitButton = form.querySelector('input[type="submit"], button[type="submit"]');
      if (submitButton && submitButton.parentNode) {
        submitButton.parentNode.insertBefore(ourTurnstileContainer, submitButton);
      } else {
        form.appendChild(ourTurnstileContainer);
      }
    }

    // Render our Turnstile widget with callback
    function renderOurTurnstile() {
      if (window.turnstile && !turnstileWidgetId) {
        try {
          ourTurnstileContainer.innerHTML = '';
          
          turnstileWidgetId = window.turnstile.render(ourTurnstileContainer, {
            sitekey: TURNSTILE_SITE_KEY,
            theme: 'dark',
            size: 'normal',
            callback: function(token) {
              turnstileToken = token;
              setSubmitEnabled(true);
              debugLog('Turnstile token generated');
            },
            'error-callback': function() {
              turnstileToken = '';
              setSubmitEnabled(false);
              console.error('Turnstile error callback');
            },
            'expired-callback': function() {
              turnstileToken = '';
              setSubmitEnabled(false);
              debugLog('Turnstile token expired');
            },
          });
          debugLog('Turnstile widget rendered', turnstileWidgetId);
        } catch (error) {
          console.error('Error rendering Turnstile:', error);
          setSubmitEnabled(false);
          showError('Verification failed to load. Please refresh and try again.');
        }
      }
    }

    if (window.turnstile) {
      renderOurTurnstile();
    } else {
      const checkTurnstile = setInterval(() => {
        if (window.turnstile) {
          clearInterval(checkTurnstile);
          renderOurTurnstile();
        }
      }, 200);
      setTimeout(() => clearInterval(checkTurnstile), 5000);
    }

    const submitHandler = async function(e) {
      if (isSubmitting) {
        debugLog('Already submitting, ignoring...');
        return false;
      }

      debugLog('Form submit intercepted!');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const confessionText = confessionInput.value.trim();
      debugLog('Confession text length:', confessionText.length);

      if (!confessionText || confessionText.length < 120) {
        showError('Confession must be at least 120 characters long.');
        return false;
      }

      // Get Turnstile token - check stored token first, then hidden input
      let token = turnstileToken;
      
      if (!token) {
        const tokenInput = ourTurnstileContainer.querySelector('input[name="cf-turnstile-response"]');
        if (tokenInput && tokenInput.value) {
          token = tokenInput.value;
          debugLog('Turnstile token recovered from hidden input');
        }
      }

      if (!token) {
        setSubmitEnabled(false);
        showError('Verification is still loading. Please wait a moment and try again.');
        return false;
      }

      debugLog('Turnstile token attached', token.substring(0, 20) + '...');

      isSubmitting = true;
      const fpHash = await generateFingerprintHash();
      debugLog('Fingerprint hash generated');

      showLoading();

      try {
        debugLog('Sending request to:', EDGE_FUNCTION_URL);
        const response = await fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            confessionText: confessionText,
            turnstileToken: token,
            fpHash: fpHash,
          }),
        });

        debugLog('Edge Function response status:', response.status);
        const data = await response.json();
        debugLog('Edge Function response:', data);

        if (!response.ok) {
          const errorMessage = data.error || 'Confession not accepted.';
          showError(errorMessage);
          isSubmitting = false;
          return false;
        }

        if (data.code) {
          window.location.href = `/success?code=${encodeURIComponent(data.code)}`;
        } else {
          showError('No ticket code received.');
          isSubmitting = false;
        }
        return false;

      } catch (error) {
        console.error('Error submitting confession:', error);
        showError('Failed to submit confession. Please try again.');
        isSubmitting = false;
        return false;
      }
    };

    form.addEventListener('submit', submitHandler, true);
    form.onsubmit = function(e) {
      e.preventDefault();
      submitHandler(e);
      return false;
    };

    // Intercept submit button clicks - but only once
    const submitButtonNodes = form.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])');
    submitButtonNodes.forEach(btn => {
      // Remove any existing listeners first
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      submitButtons.push(newBtn);
      
      newBtn.addEventListener('click', function(e) {
        if (e.target.type === 'submit' || e.target.tagName === 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
          if (!isSubmitting) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }
      }, true);
    });

    setSubmitEnabled(false);
    debugLog('Form handler attached successfully');
  }

  function showLoading() {
    const form = document.querySelector('form');
    if (form) {
      form.style.display = 'none';
    }
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'confession-loading';
    loadingDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 18px;
      z-index: 9999;
    `;
    loadingDiv.textContent = 'Processing your confession...';
    document.body.appendChild(loadingDiv);
  }

  function showError(message) {
    const loading = document.getElementById('confession-loading');
    if (loading) {
      loading.remove();
    }
    const form = document.querySelector('form');
    if (form) {
      form.style.display = '';
    }
    let errorDiv = document.getElementById('confession-error');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.id = 'confession-error';
      errorDiv.style.cssText = `
        padding: 16px;
        margin: 16px 0;
        background: #fee;
        border: 1px solid #fcc;
        color: #c33;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
      `;
      const form = document.querySelector('form');
      if (form) {
        form.insertBefore(errorDiv, form.firstChild);
      }
    }
    errorDiv.textContent = message;
    setTimeout(() => {
      if (errorDiv && errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 5000);
  }

  function startInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(init, 1000);
      });
    } else {
      setTimeout(init, 1000);
    }
  }

  if (window.turnstile) {
    startInit();
  } else {
    window.addEventListener('load', function() {
      setTimeout(startInit, 1000);
    });
  }
})();
