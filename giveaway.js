var SUPABASE_URL = window.VITE_SUPABASE_URL || '';
var SUPABASE_KEY = window.VITE_SUPABASE_ANON_KEY || '';
var GIVEAWAY_END_DATE = null;
var whatsappJoined = false;
var entryScore = 0;

function initializeGiveaway() {
    fetchEndDate();
    captureUTMParameters();
    loadReferralCode();
}

function fetchEndDate() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        GIVEAWAY_END_DATE = new Date('2026-02-17T00:00:00Z');
        startCountdown();
        return;
    }

    fetch(SUPABASE_URL + '/rest/v1/giveaway_config?select=end_date&id=eq.1', {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY
        }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data && data.length > 0 && data[0].end_date) {
            GIVEAWAY_END_DATE = new Date(data[0].end_date);
        } else {
            GIVEAWAY_END_DATE = new Date('2026-02-17T00:00:00Z');
        }
        startCountdown();
    })
    .catch(function() {
        GIVEAWAY_END_DATE = new Date('2026-02-17T00:00:00Z');
        startCountdown();
    });
}

function startCountdown() {
    function update() {
        if (!GIVEAWAY_END_DATE) return;
        var now = new Date().getTime();
        var distance = GIVEAWAY_END_DATE.getTime() - now;

        if (distance < 0) {
            document.getElementById('days').textContent = '00';
            document.getElementById('hours').textContent = '00';
            document.getElementById('minutes').textContent = '00';
            document.getElementById('seconds').textContent = '00';
            return;
        }

        var d = Math.floor(distance / (1000 * 60 * 60 * 24));
        var h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        var s = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('days').textContent = String(d).padStart(2, '0');
        document.getElementById('hours').textContent = String(h).padStart(2, '0');
        document.getElementById('minutes').textContent = String(m).padStart(2, '0');
        document.getElementById('seconds').textContent = String(s).padStart(2, '0');
    }

    update();
    setInterval(update, 1000);
}

function captureUTMParameters() {
    var urlParams = new URLSearchParams(window.location.search);
    var utmData = {
        source: urlParams.get('utm_source') || '',
        medium: urlParams.get('utm_medium') || '',
        campaign: urlParams.get('utm_campaign') || ''
    };
    sessionStorage.setItem('giveaway_utm', JSON.stringify(utmData));
}

function loadReferralCode() {
    var urlParams = new URLSearchParams(window.location.search);
    var referralCode = urlParams.get('ref');
    if (referralCode) {
        sessionStorage.setItem('referred_by_code', referralCode);
        validateReferralCode(referralCode);
    }
}

function validateReferralCode(code) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    fetch(SUPABASE_URL + '/rest/v1/giveaway_entries?referral_code=eq.' + code + '&select=name', {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY
        }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data && data.length > 0) {
            showReferralBanner(data[0].name);
        }
    })
    .catch(function() {});
}

function showReferralBanner(name) {
    var banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:16px;right:16px;background:#10b981;color:white;padding:12px 16px;border-radius:12px;box-shadow:0 8px 24px rgba(16,185,129,0.4);z-index:1000;max-width:280px;font-size:13px;animation:slideIn 0.4s ease;';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><i class="fas fa-gift"></i><span>Referred by <strong>' + name + '</strong>. If you win, they win too!</span></div>';
    document.body.appendChild(banner);
    setTimeout(function() {
        banner.style.animation = 'slideOut 0.4s ease';
        setTimeout(function() { banner.remove(); }, 400);
    }, 6000);
}

function nextStep(step) {
    var currentStep = document.querySelector('.form-step.active');
    if (!validateStep(currentStep)) return;

    currentStep.classList.remove('active');
    document.querySelector('.form-step[data-step="' + step + '"]').classList.add('active');

    document.querySelectorAll('.progress-step').forEach(function(el) { el.classList.remove('active'); });
    document.querySelector('.progress-step[data-step="' + step + '"]').classList.add('active');

    var formEl = document.getElementById('entry-form');
    if (formEl) {
        window.scrollTo({ top: formEl.offsetTop - 20, behavior: 'smooth' });
    }
}

function prevStep(step) {
    document.querySelector('.form-step.active').classList.remove('active');
    document.querySelector('.form-step[data-step="' + step + '"]').classList.add('active');

    document.querySelectorAll('.progress-step').forEach(function(el) { el.classList.remove('active'); });
    document.querySelector('.progress-step[data-step="' + step + '"]').classList.add('active');

    var formEl = document.getElementById('entry-form');
    if (formEl) {
        window.scrollTo({ top: formEl.offsetTop - 20, behavior: 'smooth' });
    }
}

function validateStep(stepElement) {
    var inputs = stepElement.querySelectorAll('input[required], select[required], textarea[required]');
    var isValid = true;

    inputs.forEach(function(input) {
        if (!input.value.trim()) {
            isValid = false;
            input.style.borderColor = '#ef4444';
            setTimeout(function() { input.style.borderColor = ''; }, 3000);
        } else if (input.tagName === 'TEXTAREA') {
            var minLength = input.getAttribute('minlength');
            if (minLength && input.value.length < parseInt(minLength)) {
                isValid = false;
                input.style.borderColor = '#ef4444';
                showNotification('Please write at least ' + minLength + ' characters', 'error');
                setTimeout(function() { input.style.borderColor = ''; }, 3000);
            }
        } else if (input.type === 'email') {
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(input.value)) {
                isValid = false;
                input.style.borderColor = '#ef4444';
                showNotification('Please enter a valid email address', 'error');
                setTimeout(function() { input.style.borderColor = ''; }, 3000);
            }
        }
    });

    if (!isValid) {
        showNotification('Please fill in all required fields correctly', 'error');
    }

    return isValid;
}

function joinWhatsApp() {
    window.open('https://whatsapp.com/channel/0029VbCFBFT9WtBzFDMACY26', '_blank');
    whatsappJoined = true;
    entryScore += 10;

    var btn = document.getElementById('whatsappJoinBtn');
    if (btn) {
        btn.textContent = 'Joined!';
        btn.style.background = '#059669';
        btn.disabled = true;
    }

    var errorEl = document.getElementById('whatsapp-error');
    if (errorEl) errorEl.classList.add('hidden');

    showNotification('+10 points added!', 'success');
}

function generateReferralCode(email) {
    var namePart = email.split('@')[0].substring(0, 5).toUpperCase();
    var randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return 'AI-GIVEAWAY-' + namePart + '-' + randomPart;
}

document.getElementById('giveawayForm').addEventListener('submit', function(e) {
    e.preventDefault();

    if (!whatsappJoined) {
        var errorEl = document.getElementById('whatsapp-error');
        if (errorEl) errorEl.classList.remove('hidden');
        showNotification('Please join the WhatsApp channel first', 'error');
        return;
    }

    var submitBtn = document.getElementById('submitBtn');
    var originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;

    var formData = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        whatsapp_number: document.getElementById('whatsapp').value.trim(),
        business_name: document.getElementById('businessName').value.trim(),
        business_type: document.getElementById('businessType').value,
        annual_revenue: document.getElementById('revenue').value,
        employee_count: document.getElementById('employees').value,
        current_challenges: document.getElementById('challenges').value.trim(),
        why_should_they_win: document.getElementById('whyWin').value.trim(),
        biggest_business_goal: document.getElementById('businessGoal').value.trim(),
        timeline_urgency: document.getElementById('urgency').value.trim(),
        referral_code: generateReferralCode(document.getElementById('email').value),
        entry_score: entryScore,
        qualifying_actions_completed: { whatsapp_joined: whatsappJoined },
        joined_whatsapp_channel: whatsappJoined,
        email_verified: false,
        shared_facebook: false,
        shared_linkedin: false,
        agree_marketing: document.getElementById('agreeMarketing').checked
    };

    var utmData = JSON.parse(sessionStorage.getItem('giveaway_utm') || '{}');
    formData.utm_source = utmData.source;
    formData.utm_medium = utmData.medium;
    formData.utm_campaign = utmData.campaign;

    var referredByCode = sessionStorage.getItem('referred_by_code');
    if (referredByCode) {
        formData.referred_by_code = referredByCode;
    }

    getIPAddress().then(function(ip) {
        formData.ip_address = ip;
        return fetch(SUPABASE_URL + '/functions/v1/submit-giveaway-entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_KEY
            },
            body: JSON.stringify(formData)
        });
    })
    .then(function(response) {
        return response.json().then(function(result) {
            if (response.ok) {
                sessionStorage.setItem('giveaway_entry', JSON.stringify({
                    referralCode: formData.referral_code,
                    email: formData.email,
                    name: formData.name,
                    score: entryScore
                }));
                window.location.href = 'giveaway-confirmation.html';
            } else {
                throw new Error(result.error || 'Submission failed');
            }
        });
    })
    .catch(function(error) {
        showNotification(error.message || 'Something went wrong. Please try again.', 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
});

function getIPAddress() {
    return fetch('https://api.ipify.org?format=json')
        .then(function(res) { return res.json(); })
        .then(function(data) { return data.ip; })
        .catch(function() { return 'unknown'; });
}

function showNotification(message, type) {
    type = type || 'info';
    var bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
    var notification = document.createElement('div');
    notification.style.cssText = 'position:fixed;top:16px;right:16px;background:' + bgColor + ';color:white;padding:12px 20px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:10000;max-width:320px;font-size:13px;font-weight:600;animation:slideIn 0.4s ease;';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(function() {
        notification.style.animation = 'slideOut 0.4s ease';
        setTimeout(function() { notification.remove(); }, 400);
    }, 3500);
}

function showRules() {
    var modal = document.getElementById('rulesModal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function showPrivacy() {
    var modal = document.getElementById('privacyModal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    modal.style.display = 'none';
    modal.classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', initializeGiveaway);