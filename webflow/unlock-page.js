/**
 * PMP V1 Unlock Page Handler
 * 
 * Allows users to enter ticket code and check if they're a winner.
 * 
 * Instructions:
 * 1. Add this script to your /unlock page
 * 2. Page should have:
 *    - Input field for ticket code (id="ticket-code-input" or class="ticket-code-input")
 *    - Submit button (id="unlock-button" or class="unlock-button")
 *    - Message display area (id="unlock-message" or class="unlock-message")
 *    - Optional RSVP/contact form (shown on success)
 */

(function() {
  'use strict';

  const UNLOCK_FUNCTION_URL = 'https://nueebvyiswezishlzuku.supabase.co/functions/v1/unlock';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZWVidnlpc3dlemlzaGx6dWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjM5MTksImV4cCI6MjA4MTYzOTkxOX0.IKOeMO8RDgR8KlG_RpnTKVtbh2prJhbAyKIt1R89j4M';
  
  // Get current lottery ID from page data or environment
  const CURRENT_LOTTERY_ID = window.CURRENT_LOTTERY_ID || null;

  function init() {
    const codeInput = document.getElementById('ticket-code-input') ||
                     document.querySelector('input[name="code"]') ||
                     document.querySelector('input.ticket-code-input') ||
                     document.querySelector('input[type="text"]');
    
    const unlockButton = document.getElementById('unlock-button') ||
                        document.querySelector('button[type="submit"]') ||
                        document.querySelector('button.unlock-button');
    
    const messageDisplay = document.getElementById('unlock-message') ||
                          document.querySelector('.unlock-message') ||
                          document.querySelector('[data-unlock-message]');

    if (!codeInput || !unlockButton) {
      console.error('Unlock form elements not found');
      return;
    }

    // Handle form submission
    const submitHandler = async function(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      const ticketCode = codeInput.value.trim().toUpperCase();

      if (!ticketCode) {
        showMessage('Please enter a ticket code.', 'error');
        return;
      }

      // Validate format (PMP-XXXX-XXXX)
      const codePattern = /^PMP-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
      if (!codePattern.test(ticketCode)) {
        showMessage('Invalid ticket code format. Expected: PMP-XXXX-XXXX', 'error');
        return;
      }

      unlockButton.disabled = true;
      unlockButton.textContent = 'Checking...';

      try {
        const response = await fetch(UNLOCK_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            code: ticketCode,
            lotteryId: CURRENT_LOTTERY_ID,
          }),
        });

        const data = await response.json();

        if (data.ok) {
          showMessage(`ACCESS GRANTED\n\n${data.message}\nLottery: ${data.lotteryName || 'Unknown'}`, 'success');
          showRSVPForm(ticketCode);
        } else {
          showMessage(data.message || 'The archive remains silent.', 'error');
        }

      } catch (error) {
        console.error('Error checking unlock:', error);
        showMessage('Failed to check ticket. Please try again.', 'error');
      } finally {
        unlockButton.disabled = false;
        unlockButton.textContent = 'Unlock';
      }
    };

    // Attach handlers
    unlockButton.addEventListener('click', submitHandler);
    
    const form = codeInput.closest('form');
    if (form) {
      form.addEventListener('submit', submitHandler);
    }

    // Allow Enter key to submit
    codeInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        submitHandler(e);
      }
    });
  }

  function showMessage(message, type) {
    const messageDisplay = document.getElementById('unlock-message') ||
                          document.querySelector('.unlock-message') ||
                          document.querySelector('[data-unlock-message]');

    if (!messageDisplay) {
      // Create message display if it doesn't exist
      const msgDiv = document.createElement('div');
      msgDiv.id = 'unlock-message';
      msgDiv.className = 'unlock-message';
      msgDiv.style.cssText = `
        padding: 20px;
        margin: 20px 0;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 16px;
        text-align: center;
        white-space: pre-line;
      `;
      
      const form = document.querySelector('form') || document.body;
      form.appendChild(msgDiv);
      msgDiv.textContent = message;
      msgDiv.style.background = type === 'success' ? '#efe' : '#fee';
      msgDiv.style.border = `1px solid ${type === 'success' ? '#cfc' : '#fcc'}`;
      msgDiv.style.color = type === 'success' ? '#3c3' : '#c33';
      return;
    }

    messageDisplay.textContent = message;
    messageDisplay.style.background = type === 'success' ? '#efe' : '#fee';
    messageDisplay.style.border = `1px solid ${type === 'success' ? '#cfc' : '#fcc'}`;
    messageDisplay.style.color = type === 'success' ? '#3c3' : '#c33';
    messageDisplay.style.display = 'block';
  }

  function showRSVPForm(ticketCode) {
    // Check if RSVP form already exists
    if (document.getElementById('rsvp-form')) {
      return;
    }

    const rsvpForm = document.createElement('form');
    rsvpForm.id = 'rsvp-form';
    rsvpForm.style.cssText = `
      margin-top: 30px;
      padding: 20px;
      background: #f9f9f9;
      border-radius: 4px;
    `;

    rsvpForm.innerHTML = `
      <h3 style="margin-top: 0;">RSVP / Contact</h3>
      <p>Please provide your contact information to receive updates.</p>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px;">Email (optional)</label>
        <input type="email" name="email" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px;">Instagram (optional)</label>
        <input type="text" name="instagram" placeholder="@username" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
      </div>
      <button type="submit" style="padding: 10px 20px; background: #000; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
        Submit
      </button>
    `;

    rsvpForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const email = rsvpForm.querySelector('input[name="email"]').value.trim();
      const instagram = rsvpForm.querySelector('input[name="instagram"]').value.trim().replace(/^@/, '');
      
      if (!email && !instagram) {
        alert('Please provide at least one contact method.');
        return;
      }

      const submitButton = rsvpForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';

      try {
        const response = await fetch('https://nueebvyiswezishlzuku.supabase.co/functions/v1/contact', {
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

        if (data.ok) {
          submitButton.textContent = 'Saved!';
          submitButton.style.background = '#3c3';
          setTimeout(() => {
            rsvpForm.remove();
          }, 2000);
        } else {
          alert(data.error || 'Failed to save contact information.');
          submitButton.disabled = false;
          submitButton.textContent = 'Submit';
        }
      } catch (error) {
        console.error('Error saving contact:', error);
        alert('Failed to save contact information.');
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
      }
    });

    const messageDisplay = document.getElementById('unlock-message') ||
                          document.querySelector('.unlock-message');
    if (messageDisplay && messageDisplay.parentNode) {
      messageDisplay.parentNode.appendChild(rsvpForm);
    } else {
      document.body.appendChild(rsvpForm);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

