<!-- PDF Libraries - Load First -->
<script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>

<script>
// Wait for libraries to load
(function() {
  'use strict';

  const CONTACT_FUNCTION_URL = 'https://nueebvyiswezishlzuku.supabase.co/functions/v1/contact';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZWVidnlpc3dlemlzaGx6dWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjM5MTksImV4cCI6MjA4MTYzOTkxOX0.IKOeMO8RDgR8KlG_RpnTKVtbh2prJhbAyKIt1R89j4M';

  // PDF Generation Function
  async function generateTicketPDF(ticketCode) {
    // Wait for libraries to be available
    let attempts = 0;
    while ((!window.PDFLib || !window.QRCode) && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.PDFLib) {
      throw new Error('PDF library not loaded');
    }
    if (!window.QRCode) {
      throw new Error('QRCode library not loaded');
    }

    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
    
    // Wallet size: 3.375" x 2.125" (in points: 243 x 153)
    const pageWidth = 243;
    const pageHeight = 153;
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const { width, height } = page.getSize();
    
    // Load fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Black background
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(0, 0, 0),
    });
    
    // Brand text
    page.drawText('PARDONNE MOI PÈRE', {
      x: width / 2,
      y: height - 25,
      size: 8,
      font: helveticaFont,
      color: rgb(1, 1, 1),
    });
    
    // Ticket code (centered)
    const codeWidth = helveticaBoldFont.widthOfTextAtSize(ticketCode, 20);
    page.drawText(ticketCode, {
      x: (width - codeWidth) / 2,
      y: height / 2 + 15,
      size: 20,
      font: helveticaBoldFont,
      color: rgb(1, 1, 1),
    });
    
    // URL text
    const urlText = 'pmp.art/unlock';
    const urlWidth = helveticaFont.widthOfTextAtSize(urlText, 7);
    page.drawText(urlText, {
      x: (width - urlWidth) / 2,
      y: 30,
      size: 7,
      font: helveticaFont,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    // Generate QR code
    const unlockUrl = 'https://pmp.art/unlock';
    const qrDataUrl = await new Promise((resolve, reject) => {
      window.QRCode.toDataURL(unlockUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      }, (err, url) => {
        if (err) reject(err);
        else resolve(url);
      });
    });
    
    // Convert data URL to image
    const qrImage = await pdfDoc.embedPng(qrDataUrl);
    
    // Draw QR code (bottom right)
    const qrSize = 40;
    page.drawImage(qrImage, {
      x: width - qrSize - 10,
      y: 10,
      width: qrSize,
      height: qrSize,
    });
    
    return await pdfDoc.save();
  }

  async function downloadTicketPDF(ticketCode) {
    try {
      const pdfBytes = await generateTicketPDF(ticketCode);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ticketCode}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF: ' + error.message);
    }
  }

  // Get ticket code from URL parameter
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

    // Copy button handler
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
          console.error('Failed to copy:', error);
          // Fallback
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

    // Download PDF button handler
    const downloadButton = document.getElementById('download-pdf-button') ||
                          document.querySelector('[data-download-pdf]') ||
                          document.querySelector('.download-pdf');
    
    if (downloadButton) {
      downloadButton.addEventListener('click', async function() {
        downloadButton.disabled = true;
        const originalText = downloadButton.textContent;
        downloadButton.textContent = 'Generating...';
        
        try {
          await downloadTicketPDF(ticketCode);
        } catch (error) {
          console.error('Error downloading PDF:', error);
          alert('Failed to generate PDF. Please try again.');
        } finally {
          downloadButton.disabled = false;
          downloadButton.textContent = originalText;
        }
      });
    }

    // Contact form handler (optional)
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
        const instagram = instagramInput ? instagramInput.value.trim().replace(/^@/, '') : '';

        if (!email && !instagram) {
          showContactError('Please provide an email or Instagram handle.');
          return;
        }

        const submitButton = contactForm.querySelector('button[type="submit"]') ||
                            contactForm.querySelector('input[type="submit"]');
        
        if (submitButton) {
          submitButton.disabled = true;
          const originalText = submitButton.textContent;
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
            const errorMessage = data.error || 'Failed to save contact information.';
            showContactError(errorMessage);
            return;
          }

          // Success
          showContactSuccess('Contact information saved!');
          if (emailInput) emailInput.value = '';
          if (instagramInput) instagramInput.value = '';

        } catch (error) {
          console.error('Error saving contact:', error);
          showContactError('Failed to save contact information. Please try again.');
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalText || 'Save';
          }
        }
      });
    }
  }

  function showContactError(message) {
    let errorDiv = document.getElementById('contact-error');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.id = 'contact-error';
      errorDiv.style.cssText = `
        padding: 12px;
        margin: 12px 0;
        background: #fee;
        border: 1px solid #fcc;
        color: #c33;
        border-radius: 4px;
        font-size: 14px;
      `;
      
      const contactForm = document.getElementById('contact-form') ||
                          document.querySelector('form.contact-form');
      if (contactForm) {
        contactForm.insertBefore(errorDiv, contactForm.firstChild);
      }
    }
    errorDiv.textContent = message;
    setTimeout(() => {
      if (errorDiv && errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 5000);
  }

  function showContactSuccess(message) {
    let successDiv = document.getElementById('contact-success');
    if (!successDiv) {
      successDiv = document.createElement('div');
      successDiv.id = 'contact-success';
      successDiv.style.cssText = `
        padding: 12px;
        margin: 12px 0;
        background: #efe;
        border: 1px solid #cfc;
        color: #3c3;
        border-radius: 4px;
        font-size: 14px;
      `;
      
      const contactForm = document.getElementById('contact-form') ||
                          document.querySelector('form.contact-form');
      if (contactForm) {
        contactForm.insertBefore(successDiv, contactForm.firstChild);
      }
    }
    successDiv.textContent = message;
    setTimeout(() => {
      if (successDiv && successDiv.parentNode) {
        successDiv.remove();
      }
    }, 3000);
  }

  // Initialize when DOM is ready and libraries are loaded
  function startInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(init, 500);
      });
    } else {
      setTimeout(init, 500);
    }
  }

  // Wait for libraries to load
  if (window.PDFLib && window.QRCode) {
    startInit();
  } else {
    window.addEventListener('load', function() {
      setTimeout(startInit, 1000);
    });
  }
})();
</script>

