const GIVEAWAY_END_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

let entryScore = 0;
let qualifyingActions = {
    whatsapp_joined: false,
    email_verified: false,
    facebook_shared: false,
    linkedin_shared: false,
    friends_tagged: false,
    webinar_registered: false
};

function initializeGiveaway() {
    startCountdown();
    setAnnouncementDate();
    captureUTMParameters();
    loadReferralCode();
}

function startCountdown() {
    function updateCountdown() {
        const now = new Date().getTime();
        const distance = GIVEAWAY_END_DATE - now;

        if (distance < 0) {
            document.getElementById('countdown').innerHTML = '<div class="countdown-item"><span class="countdown-text">GIVEAWAY ENDED</span></div>';
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('days').textContent = String(days).padStart(2, '0');
        document.getElementById('hours').textContent = String(hours).padStart(2, '0');
        document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
        document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function setAnnouncementDate() {
    const announcementDate = new Date(GIVEAWAY_END_DATE.getTime() + 2 * 24 * 60 * 60 * 1000);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const dateString = announcementDate.toLocaleDateString('en-US', options);
    document.getElementById('announcementDate').textContent = dateString;
}

function captureUTMParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmData = {
        source: urlParams.get('utm_source') || '',
        medium: urlParams.get('utm_medium') || '',
        campaign: urlParams.get('utm_campaign') || ''
    };
    sessionStorage.setItem('giveaway_utm', JSON.stringify(utmData));
}

function loadReferralCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get('ref');
    if (referralCode) {
        sessionStorage.setItem('referred_by_code', referralCode);
        validateReferralCode(referralCode);
    }
}

async function validateReferralCode(code) {
    try {
        const supabaseUrl = window.VITE_SUPABASE_URL || 'https://dygnqbkkeziwaqwffszb.supabase.co';
        const supabaseKey = window.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z25xYmtrZXppd2Fxd2Zmc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MjIyMTAsImV4cCI6MjA4NDI5ODIxMH0.taKn2OKOj_32HZRS7S_A3mxGr1ReGl9vysBN5J6YKS8';

        const response = await fetch(
            `${supabaseUrl}/rest/v1/giveaway_entries?referral_code=eq.${code}&select=email,name`,
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            }
        );

        if (response.ok) {
            const data = await response.json();
            if (data.length > 0) {
                showReferralBanner(data[0].name);
            }
        }
    } catch (error) {
        console.error('Error validating referral code:', error);
    }
}

function showReferralBanner(referrerName) {
    const banner = document.createElement('div');
    banner.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 20px;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4);
        z-index: 1000;
        max-width: 300px;
        animation: slideIn 0.5s ease;
    `;
    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <i class="fas fa-gift" style="font-size: 24px;"></i>
            <strong>Referral Bonus!</strong>
        </div>
        <p style="margin: 0; font-size: 14px;">
            You were referred by <strong>${referrerName}</strong>.
            If you win, they win too!
        </p>
        <button onclick="this.parentElement.remove()" style="
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
        ">&times;</button>
    `;
    document.body.appendChild(banner);

    setTimeout(() => {
        banner.style.animation = 'slideOut 0.5s ease';
        setTimeout(() => banner.remove(), 500);
    }, 8000);
}

function nextStep(step) {
    const currentStep = document.querySelector('.form-step.active');

    if (!validateStep(currentStep)) {
        return;
    }

    currentStep.classList.remove('active');
    document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');

    document.querySelectorAll('.progress-step').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelector(`.progress-step[data-step="${step}"]`).classList.add('active');

    window.scrollTo({ top: document.getElementById('entry-form').offsetTop - 100, behavior: 'smooth' });
}

function prevStep(step) {
    document.querySelector('.form-step.active').classList.remove('active');
    document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');

    document.querySelectorAll('.progress-step').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelector(`.progress-step[data-step="${step}"]`).classList.add('active');

    window.scrollTo({ top: document.getElementById('entry-form').offsetTop - 100, behavior: 'smooth' });
}

function validateStep(stepElement) {
    const inputs = stepElement.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;

    inputs.forEach(input => {
        if (!input.value.trim()) {
            isValid = false;
            input.style.borderColor = '#ef4444';

            setTimeout(() => {
                input.style.borderColor = '';
            }, 3000);
        } else if (input.tagName === 'TEXTAREA') {
            const minLength = input.getAttribute('minlength');
            if (minLength && input.value.length < parseInt(minLength)) {
                isValid = false;
                input.style.borderColor = '#ef4444';
                showNotification(`Please write at least ${minLength} characters`, 'error');

                setTimeout(() => {
                    input.style.borderColor = '';
                }, 3000);
            }
        } else if (input.type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(input.value)) {
                isValid = false;
                input.style.borderColor = '#ef4444';
                showNotification('Please enter a valid email address', 'error');

                setTimeout(() => {
                    input.style.borderColor = '';
                }, 3000);
            }
        }
    });

    if (!isValid) {
        showNotification('Please fill in all required fields correctly', 'error');
    }

    return isValid;
}

function updateScore() {
    entryScore = 0;

    if (qualifyingActions.whatsapp_joined) entryScore += 10;
    if (qualifyingActions.email_verified) entryScore += 5;
    if (qualifyingActions.facebook_shared) entryScore += 20;
    if (qualifyingActions.linkedin_shared) entryScore += 20;
    if (qualifyingActions.friends_tagged) entryScore += 15;
    if (qualifyingActions.webinar_registered) entryScore += 25;

    document.getElementById('currentScore').textContent = entryScore;
}

function joinWhatsApp() {
    const whatsappChannelUrl = 'https://whatsapp.com/channel/0029VaN33awJP2199E93QS3q';
    window.open(whatsappChannelUrl, '_blank');

    qualifyingActions.whatsapp_joined = true;
    updateScore();

    const button = event.target;
    button.textContent = 'Joined!';
    button.style.background = '#10b981';
    button.disabled = true;

    showNotification('Great! +10 points added to your score', 'success');
}

function shareOnFacebook() {
    const url = encodeURIComponent(window.location.origin + '/giveaway.html');
    const text = encodeURIComponent('I just entered to win a $2,500 AI Business Assistant! Join me for a chance to win. If you win, I win too!');

    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank', 'width=600,height=400');

    qualifyingActions.facebook_shared = true;
    updateScore();

    const button = event.target;
    button.textContent = 'Shared!';
    button.style.background = '#10b981';
    button.disabled = true;

    showNotification('Awesome! +20 points added to your score', 'success');
}

function shareOnLinkedIn() {
    const url = encodeURIComponent(window.location.origin + '/giveaway.html');
    const title = encodeURIComponent('Win a $2,500 AI Business Assistant');
    const summary = encodeURIComponent('Enter for a chance to win an AI assistant that works 24/7, closes sales, and manages your calendar!');

    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'width=600,height=400');

    qualifyingActions.linkedin_shared = true;
    updateScore();

    const button = event.target;
    button.textContent = 'Shared!';
    button.style.background = '#10b981';
    button.disabled = true;

    showNotification('Excellent! +20 points added to your score', 'success');
}

function generateReferralCode(email) {
    const prefix = 'AI-GIVEAWAY';
    const namePart = email.split('@')[0].substring(0, 5).toUpperCase();
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${namePart}-${randomPart}`;
}

document.getElementById('giveawayForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;

    const formData = {
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
        qualifying_actions_completed: qualifyingActions,
        joined_whatsapp_channel: qualifyingActions.whatsapp_joined,
        email_verified: qualifyingActions.email_verified,
        shared_facebook: qualifyingActions.facebook_shared,
        shared_linkedin: qualifyingActions.linkedin_shared,
        agree_marketing: document.getElementById('agreeMarketing').checked,
        ip_address: await getIPAddress()
    };

    const utmData = JSON.parse(sessionStorage.getItem('giveaway_utm') || '{}');
    formData.utm_source = utmData.source;
    formData.utm_medium = utmData.medium;
    formData.utm_campaign = utmData.campaign;

    const referredByCode = sessionStorage.getItem('referred_by_code');
    if (referredByCode) {
        formData.referred_by_code = referredByCode;
    }

    try {
        const supabaseUrl = window.VITE_SUPABASE_URL || 'https://dygnqbkkeziwaqwffszb.supabase.co';
        const supabaseKey = window.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z25xYmtrZXppd2Fxd2Zmc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MjIyMTAsImV4cCI6MjA4NDI5ODIxMH0.taKn2OKOj_32HZRS7S_A3mxGr1ReGl9vysBN5J6YKS8';

        const response = await fetch(`${supabaseUrl}/functions/v1/submit-giveaway-entry`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

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
    } catch (error) {
        console.error('Error submitting entry:', error);
        showNotification(error.message || 'Something went wrong. Please try again.', 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

async function getIPAddress() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        return 'unknown';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 20px 30px;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        max-width: 400px;
        font-weight: 600;
        animation: slideIn 0.5s ease;
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.5s ease';
        setTimeout(() => notification.remove(), 500);
    }, 4000);
}

function showRules() {
    document.getElementById('rulesModal').style.display = 'block';
}

function showPrivacy() {
    document.getElementById('privacyModal').style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

window.addEventListener('DOMContentLoaded', initializeGiveaway);