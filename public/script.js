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
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[PWA] beforeinstallprompt captured successfully');
});

window.addEventListener('appinstalled', () => {
    console.log('[PWA] Maple Apartments WebApp installed successfully');
    deferredInstallPrompt = null;
    showDownloadToast('🎉 Maple Apartments WebApp installed successfully!');
});

window.downloadWebAppDirect = function() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // 1. If native PWA browser install prompt is available (Chrome, Edge, Samsung Internet), trigger it
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('[PWA] User accepted installation prompt');
                showDownloadToast('🎉 Maple Apartments WebApp installing to Home Screen!');
            }
            deferredInstallPrompt = null;
        }).catch((err) => {
            console.error('[PWA] Install prompt error:', err);
        });
        return;
    }

    // 2. On Mobile, guide the resident clearly instead of downloading invalid .url files
    if (isMobile) {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIOS) {
            alert('To Install Maple WebApp on iPhone/iPad:\n1. Tap the Share button (square with arrow)\n2. Tap "Add to Home Screen"');
        } else {
            alert('To Install Maple WebApp on Android:\n1. Tap the 3 dots (⋮) in the top-right corner of Chrome\n2. Select "Install app" or "Add to Home screen"');
        }
        return;
    }

    // 3. On Desktop only: Provide desktop launcher shortcut
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
