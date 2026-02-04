(function() {
  'use strict';

  const CONTACT_FUNCTION_URL = 'https://nueebvyiswezishlzuku.supabase.co/functions/v1/contact';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZWVidnlpc3dlemlzaGx6dWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjM5MTksImV4cCI6MjA4MTYzOTkxOX0.IKOeMO8RDgR8KlG_RpnTKVtbh2prJhbAyKIt1R89j4M';

  function getTicketCodeFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('code');
  }

  function init() {
    const ticketCode = getTicketCodeFromURL();
    
    if (!ticketCode) {
      console.error('No ticket code found in URL');
      return;
    }

    console.log('Ticket code:', ticketCode);

    // Display ticket code
    const codeDisplay = document.getElementById('ticket-code') ||
                       document.querySelector('[data-ticket-code]') ||
                       document.querySelector('.ticket-code');
    
    if (codeDisplay) {
      codeDisplay.textContent = ticketCode;
    }

    // Copy button
    const copyButton = document.getElementById('copy-button') ||
                      document.querySelector('[data-copy-button]') ||
                      document.querySelector('.copy-button');
    
    if (copyButton) {
      copyButton.addEventListener('click', async function() {
        try {
          await navigator.clipboard.writeText(ticketCode);
          const originalText = copyButton.textContent;
          copyButton.textContent = 'Copied!';
          setTimeout(() => {
            copyButton.textContent = originalText;
          }, 2000);
        } catch (error) {
          const textArea = document.createElement('textarea');
          textArea.value = ticketCode;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          alert('Code copied to clipboard!');
        }
      });
    }

    // Contact form (optional)
    const contactForm = document.getElementById('contact-form') ||
                       document.querySelector('[data-contact-form]') ||
                       document.querySelector('form.contact-form');
    
    if (contactForm) {
      contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        e.stopPropagation();

        const emailInput = contactForm.querySelector('input[type="email"]') ||
                          contactForm.querySelector('input[name="email"]');
        const instagramInput = contactForm.querySelector('input[name="instagram"]') ||
                              contactForm.querySelector('input[placeholder*="instagram" i]');

        const email = emailInput ? emailInput.value.trim() : '';
        const instagram = instagramInput ? instagramInput.value.trim() : '';

        if (!email && !instagram) {
          alert('Please provide an email or Instagram handle.');
          return;
        }

        const submitButton = contactForm.querySelector('button[type="submit"]') ||
                            contactForm.querySelector('input[type="submit"]');
        
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Saving...';
        }

        try {
          const response = await fetch(CONTACT_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              code: ticketCode,
              email: email || undefined,
              instagram: instagram || undefined,
            }),
          });

          const data = await response.json();

          if (!response.ok || !data.ok) {
            alert(data.error || 'Failed to save contact information.');
            return;
          }

          alert('Contact information saved!');
          if (emailInput) emailInput.value = '';
          if (instagramInput) instagramInput.value = '';

        } catch (error) {
          console.error('Error saving contact:', error);
          alert('Failed to save contact information. Please try again.');
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Save';
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
