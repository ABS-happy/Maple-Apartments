document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const registerForm = document.getElementById('register-form');
    const usernameInput = document.getElementById('reg-username');
    const ownerNameInput = document.getElementById('reg-ownername');
    const flatNumberInput = document.getElementById('reg-flatnumber');
    const mobileNumberInput = document.getElementById('reg-mobilenumber');
    const emailInput = document.getElementById('reg-email');
    const passwordInput = document.getElementById('reg-password');
    
    const togglePasswordBtn = document.getElementById('toggleRegPassword');
    const toggleIcon = document.getElementById('toggleRegIcon');
    const errorMessage = document.getElementById('register-error-message');
    const errorText = document.getElementById('register-error-text');
    const submitBtn = document.getElementById('registerBtn');

    const inputs = [usernameInput, ownerNameInput, flatNumberInput, mobileNumberInput, emailInput, passwordInput];

    // Password Visibility Toggle Logic
    if (togglePasswordBtn) {
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

    // Form validation and submission
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevent page reload

            // Reset previous errors
            hideError();
            inputs.forEach(input => {
                if (input) input.classList.remove('invalid');
            });

            // Fetch values
            const username = usernameInput.value.trim();
            const ownerName = ownerNameInput.value.trim();
            const flatNumber = flatNumberInput.value.trim();
            const mobileNumber = mobileNumberInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            // 1. Validation Logic
            let isValid = true;
            let authError = '';
            let targetField = null;

            if (!username) {
                isValid = false;
                authError = 'Please enter a User ID.';
                targetField = usernameInput;
            } else if (!ownerName) {
                isValid = false;
                authError = 'Please enter the Owner Name.';
                targetField = ownerNameInput;
            } else if (!flatNumber) {
                isValid = false;
                authError = 'Please enter the Flat Number.';
                targetField = flatNumberInput;
            } else if (!mobileNumber) {
                isValid = false;
                authError = 'Please enter exactly 10-digit Mobile Number.';
                targetField = mobileNumberInput;
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

            // 3. Actual Backend Registration
            submitBtn.classList.add('loading');
            const btnSpan = submitBtn.querySelector('span');
            const originalText = btnSpan.textContent;
            btnSpan.textContent = 'Registering...';

            fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    username, 
                    ownerName, 
                    flatNumber, 
                    mobileNumber, 
                    password, 
                    email
                })
            })
            .then(response => response.json().then(data => ({ status: response.status, data })))
            .then(({ status, data }) => {
                submitBtn.classList.remove('loading');
                btnSpan.textContent = originalText;

                if (status === 201 || data.message === 'User registered successfully') {
                    // Success
                    registerForm.reset();
                    sessionStorage.setItem('registration_success', 'true');
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
                showError('Registration failed. Make sure the backend is running.');
                console.error('Registration error:', err);
            });
        });
    }

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
