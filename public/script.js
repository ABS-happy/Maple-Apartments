document.addEventListener('DOMContentLoaded', () => {
    // Check for success messages
    const loginSuccessMsg = document.getElementById('login-success-message');
    if (loginSuccessMsg) {
        if (sessionStorage.getItem('registration_success')) {
            loginSuccessMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="margin-right: 0.5rem;"></i>Registration successfully done! Please login.';
            loginSuccessMsg.classList.remove('hidden');
            sessionStorage.removeItem('registration_success');
        } else if (sessionStorage.getItem('password_reset_success')) {
            loginSuccessMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="margin-right: 0.5rem;"></i>Password successfully changed! Please login with your new password.';
            loginSuccessMsg.classList.remove('hidden');
            sessionStorage.removeItem('password_reset_success');
        }
    }

    // DOM Elements
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const toggleIcon = document.getElementById('toggleIcon');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const submitBtn = document.getElementById('loginBtn');

    const inputs = [usernameInput, passwordInput];

    // Password Visibility Toggle Logic
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);

        // Toggle FontAwesome classes for the eye icon
        if (type === 'password') {
            toggleIcon.classList.remove('fa-eye-slash');
            toggleIcon.classList.add('fa-eye');
        } else {
            toggleIcon.classList.remove('fa-eye');
            toggleIcon.classList.add('fa-eye-slash');
        }
    });

    // Remove error highlights when user types
    inputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                input.classList.remove('invalid');
                if (!errorMessage.classList.contains('hidden')) {
                    hideError();
                }
            });
        }
    });

    // Form validation and submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Prevent page reload

        // Reset previous errors
        hideError();
        inputs.forEach(input => input.classList.remove('invalid'));

        // Fetch values
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        // 1. Validation Logic
        let isValid = true;
        let authError = '';
        let targetField = null;

        if (!username) {
            isValid = false;
            authError = 'Please enter your User ID.';
            targetField = usernameInput;
        } else if (!password) {
            isValid = false;
            authError = 'Please enter your password.';
            targetField = passwordInput;
        }

        // 2. Handle Validation Failure
        if (!isValid) {
            targetField.classList.add('invalid');
            showError(authError);
            targetField.focus();
            return;
        }

        // 3. Actual Backend Login
        submitBtn.classList.add('loading');
        const btnSpan = submitBtn.querySelector('span');
        const originalText = btnSpan.textContent;
        btnSpan.textContent = 'Verifying...';

        fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
            submitBtn.classList.remove('loading');
            btnSpan.textContent = originalText;

            if (data.error) {
                usernameInput.classList.add('invalid');
                passwordInput.classList.add('invalid');
                showError(data.error);
                usernameInput.focus();
            } else if (data.user) {
                // Success
                if (data.token) sessionStorage.setItem('maple_token', data.token);
                sessionStorage.setItem('maple_user', JSON.stringify(data.user));
                if (data.user.role === 'Admin') {
                    window.location.href = 'admin-dashboard.html';
                } else {
                    window.location.href = 'user-dashboard.html';
                }
            } else {
                showError('Unexpected response from server.');
            }
        })
        .catch(err => {
            submitBtn.classList.remove('loading');
            btnSpan.textContent = originalText;
            showError('Server connection failed. Make sure the backend is running.');
            console.error('Login error:', err);
        });
    });

    // Helper functions for displaying errors
    function showError(message) {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');

        // Trigger CSS shake animation by resetting the element
        errorMessage.style.animation = 'none';
        errorMessage.offsetHeight; /* trigger reflow */
        errorMessage.style.animation = null;
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }
});


// ==========================================
// WebApp Direct Download & PWA Installer
// ==========================================
window.deferredInstallPrompt = window.deferredInstallPrompt || null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    console.log('[PWA] beforeinstallprompt captured successfully');
    const dlBtn = document.getElementById('downloadAppBtn');
    if (dlBtn) {
        dlBtn.classList.add('ready-to-install');
    }
});

window.addEventListener('appinstalled', () => {
    console.log('[PWA] Maple Apartments WebApp installed successfully');
    window.deferredInstallPrompt = null;
    showDownloadToast('🎉 Maple Apartments WebApp installed successfully!');
});

window.downloadDesktopShortcutFallback = function() {
    const origin = window.location.origin;
    const urlContent = `[InternetShortcut]\r\nURL=${origin}/\r\nIconIndex=0\r\nIconFile=${origin}/favicon.svg\r\n`;
    const blob = new Blob([urlContent], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Maple Apartments.url';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showDownloadToast('📥 Maple Apartments Desktop launcher downloaded!');
};

window.closePwaInstallModal = function() {
    const modal = document.getElementById('pwaInstallModalOverlay');
    if (modal) modal.remove();
};

window.openPwaInstallModal = function() {
    window.closePwaInstallModal();

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);

    let guideHtml = '';

    if (isIOS) {
        guideHtml = `
            <div class="instructions-card" style="margin-bottom: 1.25rem;">
                <h5 style="color: #ea580c; font-size: 0.95rem; font-weight: 700; margin-bottom: 0.75rem;">
                    <i class="fa-brands fa-apple"></i> Install on iPhone / iPad (Safari)
                </h5>
                <ol style="padding-left: 1.2rem; line-height: 1.8; color: #374151; font-size: 0.9rem;">
                    <li>Tap the <strong>Share</strong> button <i class="fa-solid fa-arrow-up-from-bracket" style="color:#0284c7;"></i> at the bottom of Safari.</li>
                    <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                    <li>Tap <strong>"Add"</strong> in the top-right corner.</li>
                </ol>
            </div>
        `;
    } else if (isAndroid) {
        guideHtml = `
            <div class="instructions-card" style="margin-bottom: 1.25rem;">
                <h5 style="color: #ea580c; font-size: 0.95rem; font-weight: 700; margin-bottom: 0.75rem;">
                    <i class="fa-brands fa-android" style="color: #10b981;"></i> Install on Android (Chrome / Samsung)
                </h5>
                <ol style="padding-left: 1.2rem; line-height: 1.8; color: #374151; font-size: 0.9rem;">
                    <li>Tap the <strong>three dots (⋮)</strong> in Chrome's top-right corner.</li>
                    <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                    <li>Tap <strong>"Install"</strong> to add Maple Apartments to your Home screen!</li>
                </ol>
            </div>
        `;
    } else {
        guideHtml = `
            <div class="instructions-card" style="margin-bottom: 1.25rem;">
                <h5 style="color: #ea580c; font-size: 0.95rem; font-weight: 700; margin-bottom: 0.75rem;">
                    <i class="fa-solid fa-desktop" style="color: #6366f1;"></i> Install on Computer (Chrome / Edge)
                </h5>
                <ol style="padding-left: 1.2rem; line-height: 1.8; color: #374151; font-size: 0.9rem;">
                    <li>Click the <strong>Install icon (⊕)</strong> on the right side of your browser address bar.</li>
                    <li>Click <strong>"Install"</strong> to launch Maple Apartments as a standalone window.</li>
                </ol>
            </div>
            <button class="pwa-secondary-btn" style="width: 100%; margin-bottom: 0.75rem;" onclick="window.downloadDesktopShortcutFallback()">
                <i class="fa-solid fa-download"></i> Download Windows Shortcut (.url)
            </button>
        `;
    }

    const modal = document.createElement('div');
    modal.id = 'pwaInstallModalOverlay';
    modal.className = 'pwa-modal-overlay';
    modal.innerHTML = `
        <div class="pwa-modal-card">
            <button class="pwa-modal-close" onclick="window.closePwaInstallModal()">&times;</button>
            <div class="pwa-modal-header">
                <img src="/icon-192.png" alt="Maple Leaf Icon" style="width: 68px; height: 68px; border-radius: 16px; margin: 0 auto 0.75rem; display: block; box-shadow: 0 4px 14px rgba(249,115,22,0.35);">
                <h3>Install Maple Apartments</h3>
                <p>Add the official app to your Home screen for quick 1-tap access and instant dues receipts.</p>
            </div>
            ${guideHtml}
            <button class="pwa-primary-btn" style="width: 100%;" onclick="window.closePwaInstallModal()">
                <i class="fa-solid fa-check"></i> Got It
            </button>
        </div>
    `;
    document.body.appendChild(modal);
};

window.downloadWebAppDirect = function() {
    // 1. Check if already installed & running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
        showDownloadToast('✅ Maple Apartments is already installed on your device!');
        return;
    }

    // 2. If native prompt is captured and ready, trigger it immediately
    if (window.deferredInstallPrompt) {
        window.deferredInstallPrompt.prompt();
        window.deferredInstallPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('[PWA] User accepted installation prompt');
                showDownloadToast('🎉 Maple Apartments WebApp installing to Home Screen!');
            }
            window.deferredInstallPrompt = null;
        }).catch((err) => {
            console.error('[PWA] Install prompt error:', err);
            window.openPwaInstallModal();
        });
        return;
    }

    // 3. Otherwise, show the clean visual step-by-step installation guide modal
    window.openPwaInstallModal();
};

window.triggerAppDownload = window.downloadWebAppDirect;
window.downloadDesktopShortcut = window.downloadWebAppDirect;

function showDownloadToast(message) {
    let toast = document.getElementById('pwaToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'pwaToast';
        toast.className = 'pwa-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window._pwaToastTimer);
    window._pwaToastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 4500);
}

// ==========================================
// Google OAuth Sign-in Handler
// ==========================================
window.continueWithGoogle = async function() {
    const googleBtn = document.getElementById('googleLoginBtn');
    if (googleBtn) {
        googleBtn.disabled = true;
        googleBtn.style.opacity = '0.7';
    }

    try {
        // If an email or flat is already entered in User ID, use it for seamless Google identification
        const enteredId = (document.getElementById('username')?.value || '').trim();
        
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                preferredIdentity: enteredId || null
            })
        });

        const data = await res.json();
        if (data.success && data.user) {
            if (data.token) sessionStorage.setItem('maple_token', data.token);
            sessionStorage.setItem('maple_user', JSON.stringify(data.user));
            showDownloadToast('Google Authentication successful! Redirecting...');
            setTimeout(() => {
                window.location.href = data.redirectUrl || (data.user.role === 'Admin' ? 'admin-dashboard.html' : 'user-dashboard.html');
            }, 600);
        } else {
            alert(data.error || 'Google sign-in could not be completed.');
            if (googleBtn) {
                googleBtn.disabled = false;
                googleBtn.style.opacity = '1';
            }
        }
    } catch (err) {
        console.error('Google login error:', err);
        alert('Server connection failed during Google sign-in.');
        if (googleBtn) {
            googleBtn.disabled = false;
            googleBtn.style.opacity = '1';
        }
    }
};
