/* globals $ */

const photoboothSetup = (function () {
    'use strict';

    const api = {};
    let setupCompleted = false;

    // Check if setup is already completed
    api.isSetupCompleted = function () {
        return localStorage.getItem('photoboothSetupCompleted') === 'true';
    };

    // Mark setup as completed
    api.markSetupCompleted = function () {
        localStorage.setItem('photoboothSetupCompleted', 'true');
        setupCompleted = true;
    };

    // Show setup modal
    api.showSetupModal = function () {
        console.log('Showing setup modal');
        $('#setupModal').addClass('active').fadeIn(300);
    };

    // Hide setup modal
    api.hideSetupModal = function () {
        console.log('Hiding setup modal');
        $('#setupModal').fadeOut(300, function() {
            $(this).removeClass('active');
        });
    };

    // Show message in modal
    api.showMessage = function (message, type) {
        const $message = $('#setupMessage');
        $message.removeClass('success error loading').addClass(type);
        $message.html(message);
    };

    // Clear message
    api.clearMessage = function () {
        $('#setupMessage').removeClass('success error loading').html('');
    };

    // Trigger autofocus capture
    api.triggerAutofocus = function () {
        const $button = $('#setupAutofocusBtn');
        const originalButtonText = $button.html();
        
        // Disable button and show loading state
        $button.prop('disabled', true);
        $button.html('<span class="setup-modal__spinner"></span> Fokussiere Kamera...');
        api.showMessage('Bitte warten, Kamera wird fokussiert...', 'loading');

        // Create temporary filename for autofocus test
        const timestamp = Date.now();
        const filename = `setup_autofocus_${timestamp}.jpg`;

        // Call the camera API to capture with autofocus
        $.ajax({
            url: 'api/capture.php',
            method: 'POST',
            data: {
                style: 'photo',
                filename: filename,
                // Add any autofocus-specific parameters here
                setup: true
            },
            timeout: 30000 // 30 seconds timeout
        })
            .done(function (result) {
                console.log('Autofocus capture result:', result);
                
                if (result.success) {
                    api.showMessage('✓ Kamera erfolgreich fokussiert! Setup abgeschlossen.', 'success');
                    
                    // Close modal after 2 seconds
                    setTimeout(function () {
                        api.hideSetupModal();
                        // Optionally delete the test image
                        api.deleteSetupImage(result.file);
                    }, 2000);
                } else {
                    api.showMessage('⚠ Fehler beim Fokussieren. Bitte erneut versuchen.', 'error');
                    $button.prop('disabled', false);
                    $button.html(originalButtonText);
                }
            })
            .fail(function (xhr, status, error) {
                console.error('Autofocus capture failed:', error);
                api.showMessage('✗ Fehler: Verbindung zur Kamera fehlgeschlagen.', 'error');
                $button.prop('disabled', false);
                $button.html(originalButtonText);
            });
    };

    // Delete setup test image
    api.deleteSetupImage = function (filename) {
        if (!filename) return;
        
        $.ajax({
            url: 'api/deletePhoto.php',
            method: 'POST',
            data: { file: filename }
        });
    };

    // Initialize setup modal
    api.init = function () {
        console.log('Initializing photobooth setup...');
        
        // Always show modal on every application start
        console.log('Showing setup modal on page load...');
        
        // Show modal on page load
        $(document).ready(function () {
            console.log('DOM ready, attempting to show modal');
            const $modal = $('#setupModal');
            console.log('Modal element found:', $modal.length > 0);
            
            // Show modal immediately
            setTimeout(function() {
                api.showSetupModal();
            }, 100);
        });

        // Bind button click event
        $(document).on('click', '#setupAutofocusBtn', function () {
            console.log('Autofocus button clicked');
            api.triggerAutofocus();
        });
    };

    return api;
})();

// Auto-initialize on script load
console.log('Loading setup-modal.js');
photoboothSetup.init();
