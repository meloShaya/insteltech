const SUPABASE_URL = 'https://dygnqbkkeziwaqwffszb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z25xYmtrZXppd2Fxd2Zmc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MjIyMTAsImV4cCI6MjA4NDI5ODIxMH0.taKn2OKOj_32HZRS7S_A3mxGr1ReGl9vysBN5J6YKS8';

async function submitLead(leadData) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(leadData)
    });

    if (!response.ok) {
        throw new Error('Failed to submit lead');
    }

    return true;
}

async function sendLeadNotification(leadData) {
    try {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-lead`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(leadData)
        });
    } catch (error) {
        console.error('Notification error:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const currentYearEl = document.getElementById('current-year');
    if (currentYearEl) {
        currentYearEl.textContent = new Date().getFullYear();
    }

    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
            const icon = mobileMenuButton.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars');
                icon.classList.toggle('fa-times');
            }
        });

        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                mobileMenu.classList.add('hidden');
                const icon = mobileMenuButton.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            });
        });
    }

    document.addEventListener('click', function(e) {
        if (mobileMenu && mobileMenuButton &&
            !mobileMenu.contains(e.target) &&
            !mobileMenuButton.contains(e.target)) {
            mobileMenu.classList.add('hidden');
            const icon = mobileMenuButton.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const target = document.querySelector(targetId);

            if (target) {
                const navHeight = document.querySelector('nav').offsetHeight;
                const targetPosition = target.offsetTop - navHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    const leadForm = document.getElementById('lead-form');
    const formSuccess = document.getElementById('form-success');

    if (leadForm) {
        leadForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const submitBtn = leadForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';

            const formData = new FormData(leadForm);
            const leadData = {
                name: formData.get('name'),
                email: formData.get('email'),
                phone: formData.get('phone') || '',
                business_name: formData.get('business_name') || '',
                business_type: formData.get('business_type'),
                employee_count: formData.get('employee_count'),
                annual_revenue: formData.get('annual_revenue'),
                ownership_type: formData.get('ownership_type'),
                source: 'website',
                lead_magnet: 'free-whatsapp-chatbot',
                interest: 'AI WhatsApp Chatbot'
            };

            try {
                await submitLead(leadData);
                sendLeadNotification(leadData);

                leadForm.classList.add('hidden');
                formSuccess.classList.remove('hidden');

                if (typeof gtag === 'function') {
                    gtag('event', 'lead_capture', {
                        'event_category': 'Lead',
                        'event_label': 'Free WhatsApp Chatbot'
                    });
                }
            } catch (error) {
                console.error('Error submitting lead:', error);
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;

                alert('There was an error submitting your request. Please try again or contact us directly.');
            }
        });
    }

    const contactForm = document.getElementById('contact-form');
    const contactSuccess = document.getElementById('contact-success');

    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading-spinner"></span>Sending...';

            const formData = new FormData(contactForm);
            const leadData = {
                name: formData.get('name'),
                email: formData.get('email'),
                phone: formData.get('phone') || '',
                interest: formData.get('interest'),
                source: 'contact-form',
                lead_magnet: formData.get('message') || ''
            };

            try {
                await submitLead(leadData);
                sendLeadNotification(leadData);

                contactForm.classList.add('hidden');
                contactSuccess.classList.remove('hidden');
            } catch (error) {
                console.error('Error submitting contact:', error);
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;

                alert('There was an error sending your message. Please try again or contact us directly.');
            }
        });
    }

    const backToTop = document.getElementById('back-to-top');

    if (backToTop) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 500) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        });

        backToTop.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.scroll-reveal').forEach(el => {
        observer.observe(el);
    });

    const aiAgentCards = document.querySelectorAll('.ai-agent-card');
    aiAgentCards.forEach(card => {
        card.addEventListener('click', function() {
            const leadMagnetSection = document.getElementById('lead-magnet');
            if (leadMagnetSection) {
                const navHeight = document.querySelector('nav').offsetHeight;
                window.scrollTo({
                    top: leadMagnetSection.offsetTop - navHeight,
                    behavior: 'smooth'
                });
            }
        });
    });

    const nav = document.querySelector('nav');
    let lastScroll = 0;

    window.addEventListener('scroll', function() {
        const currentScroll = window.scrollY;

        if (currentScroll > 100) {
            nav.classList.add('shadow-md');
        } else {
            nav.classList.remove('shadow-md');
        }

        lastScroll = currentScroll;
    });
});
