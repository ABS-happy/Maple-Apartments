document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const resetForm = document.getElementById('reset-form');
    const usernameInput = document.getElementById('reset-username');
    const mobileNumberInput = document.getElementById('reset-mobilenumber');
    const passwordInput = document.getElementById('reset-password-input');
    
    const togglePasswordBtn = document.getElementById('toggleResetPassword');
    const toggleIcon = document.getElementById('toggleResetIcon');
    const errorMessage = document.getElementById('reset-error-message');
    const errorText = document.getElementById('reset-error-text');
    const submitBtn = document.getElementById('resetBtn');

    const inputs = [usernameInput, mobileNumberInput, passwordInput];

    // Password Rules Elements
    const rules = {
        upper: document.getElementById('rule-upper'),
        lower: document.getElementById('rule-lower'),
        number: document.getElementById('rule-number'),
        special: document.getElementById('rule-special'),
        length: document.getElementById('rule-length')
    };

    let isPasswordValid = false;

    // Live Password Rules Validation
    passwordInput.addEventListener('input', (e) => {
        const val = e.target.value;
        
        const hasUpper = /[A-Z]/.test(val);
        const hasLower = /[a-z]/.test(val);
        const hasNumber = /[0-9]/.test(val);
        const hasSpecial = /[@#$!]/.test(val);
        const hasLength = val.length >= 12 && val.length <= 14;

        toggleRule(rules.upper, hasUpper);
        toggleRule(rules.lower, hasLower);
        toggleRule(rules.number, hasNumber);
        toggleRule(rules.special, hasSpecial);
        toggleRule(rules.length, hasLength);

        isPasswordValid = hasUpper && hasLower && hasNumber && hasSpecial && hasLength;
    });

    function toggleRule(element, isValid) {
        if (isValid) {
            element.classList.remove('rule-invalid');
            element.classList.add('rule-valid');
        } else {
            element.classList.remove('rule-valid');
            element.classList.add('rule-invalid');
        }
    }

    // Password Visibility Toggle Logic
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);

            if (type === 'password') {
                toggleIcon.classList.remove('fa-eye-slash');
                toggleIcon.classList.add('fa-eye');
            } else {
                toggleIcon.classList.remove('fa-eye');
                toggleIcon.classList.add('fa-eye-slash');
            }
        });
    }

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

    // Form submission
    if (resetForm) {
        resetForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Reset previous errors
            hideError();
            inputs.forEach(input => {
                if (input) input.classList.remove('invalid');
            });

            // Fetch values
            const username = usernameInput.value.trim();
            const mobileNumber = mobileNumberInput.value.trim();
            const newPassword = passwordInput.value;

            // Basic Validation
            if (!username) {
                usernameInput.classList.add('invalid');
                showError('Please enter your User ID.');
                usernameInput.focus();
                return;
            }
            if (!mobileNumber) {
                mobileNumberInput.classList.add('invalid');
                showError('Please enter your Mobile Number.');
                mobileNumberInput.focus();
                return;
            }
            if (!isPasswordValid) {
                passwordInput.classList.add('invalid');
                showError('Password does not meet the specified rules.');
                passwordInput.focus();
                return;
            }

            // Backend Reset Request
            submitBtn.classList.add('loading');
            const btnSpan = submitBtn.querySelector('span');
            const originalText = btnSpan.textContent;
            btnSpan.textContent = 'Updating...';

            fetch('/api/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    username, 
                    mobileNumber, 
                    newPassword 
                })
            })
            .then(response => response.json().then(data => ({ status: response.status, data })))
            .then(({ status, data }) => {
                submitBtn.classList.remove('loading');
                btnSpan.textContent = originalText;

                if (status === 200) {
                    // Success
                    resetForm.reset();
                    sessionStorage.setItem('password_reset_success', 'true');
                    window.location.href = 'index.html';
                } else if (data.error) {
                    showError(data.error);
                } else {
                    showError('Unexpected response from server.');
                }
            })
            .catch(err => {
                submitBtn.classList.remove('loading');
                btnSpan.textContent = originalText;
                showError('Reset failed. Make sure the backend is running.');
                console.error('Reset error:', err);
            });
        });
    }

    function showError(message) {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');

        errorMessage.style.animation = 'none';
        errorMessage.offsetHeight; 
        errorMessage.style.animation = null;
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }
});
