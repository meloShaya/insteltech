document.addEventListener('DOMContentLoaded', function() {
    const SUPABASE_URL = window.VITE_SUPABASE_URL || '';
    const SUPABASE_KEY = window.VITE_SUPABASE_ANON_KEY || '';

    var yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    var mobileMenuBtn = document.getElementById('mobile-menu-button');
    var mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
            var icon = mobileMenuBtn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars');
                icon.classList.toggle('fa-times');
            }
        });
        mobileMenu.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                mobileMenu.classList.add('hidden');
                var icon = mobileMenuBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            });
        });
        document.addEventListener('click', function(e) {
            if (!mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                mobileMenu.classList.add('hidden');
                var icon = mobileMenuBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            var href = anchor.getAttribute('href');
            if (href === '#') return;
            var target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                var navHeight = 80;
                var y = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        });
    });

    var categoryFilters = document.getElementById('category-filters');
    var productsList = document.getElementById('products-list');
    var extraProductsList = document.getElementById('extra-products-list');
    if (categoryFilters && productsList) {
        var pills = categoryFilters.querySelectorAll('.category-pill');
        var allProductCards = Array.prototype.slice.call(productsList.querySelectorAll('.product-card'));
        if (extraProductsList) {
            allProductCards = allProductCards.concat(Array.prototype.slice.call(extraProductsList.querySelectorAll('.product-card')));
        }

        pills.forEach(function(pill) {
            pill.addEventListener('click', function() {
                pills.forEach(function(p) { p.classList.remove('active'); });
                pill.classList.add('active');
                var category = pill.dataset.category;

                allProductCards.forEach(function(product) {
                    if (category === 'all') {
                        product.style.display = '';
                        product.style.opacity = '0';
                        product.style.transform = 'translateY(10px)';
                        requestAnimationFrame(function() {
                            product.style.transition = 'all 0.3s ease';
                            product.style.opacity = '1';
                            product.style.transform = 'translateY(0)';
                        });
                    } else {
                        var cats = product.dataset.categories || '';
                        if (cats.indexOf(category) !== -1) {
                            product.style.display = '';
                            product.style.opacity = '0';
                            product.style.transform = 'translateY(10px)';
                            requestAnimationFrame(function() {
                                product.style.transition = 'all 0.3s ease';
                                product.style.opacity = '1';
                                product.style.transform = 'translateY(0)';
                            });
                        } else {
                            product.style.display = 'none';
                        }
                    }
                });
            });
        });
    }

    async function submitLead(formData) {
        if (!SUPABASE_URL || !SUPABASE_KEY) return;
        await fetch(SUPABASE_URL + '/rest/v1/leads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(formData)
        });
    }

    async function sendNotification(formData) {
        if (!SUPABASE_URL || !SUPABASE_KEY) return;
        try {
            await fetch(SUPABASE_URL + '/functions/v1/notify-lead', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + SUPABASE_KEY
                },
                body: JSON.stringify(formData)
            });
        } catch (_) {}
    }

    var leadForm = document.getElementById('lead-form-el');
    var formSuccess = document.getElementById('form-success');
    if (leadForm) {
        leadForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var submitBtn = leadForm.querySelector('button[type="submit"]');
            var originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading-spinner"></span> Submitting...';

            var fd = new FormData(leadForm);
            var data = {
                name: fd.get('name'),
                email: fd.get('email'),
                phone: fd.get('phone') || '',
                business_name: fd.get('business_name') || '',
                business_type: fd.get('business_type'),
                employee_count: fd.get('employee_count'),
                annual_revenue: fd.get('annual_revenue'),
                ownership_type: fd.get('ownership_type'),
                source: 'homepage-sidebar',
                lead_magnet: 'free-whatsapp-chatbot',
                interest: 'AI WhatsApp Chatbot'
            };

            try {
                await submitLead(data);
                sendNotification(data);
                leadForm.classList.add('hidden');
                if (formSuccess) formSuccess.classList.remove('hidden');
                if (typeof gtag === 'function') {
                    gtag('event', 'lead_capture', {
                        'event_category': 'Lead',
                        'event_label': 'Free WhatsApp Chatbot'
                    });
                }
            } catch (_) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    var contactForm = document.getElementById('contact-form-el');
    var contactSuccess = document.getElementById('contact-form-success');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var submitBtn = contactForm.querySelector('button[type="submit"]');
            var originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading-spinner"></span> Sending...';

            var fd = new FormData(contactForm);
            var data = {
                name: fd.get('name'),
                email: fd.get('email'),
                phone: fd.get('phone') || '',
                business_name: fd.get('business_name') || '',
                business_type: fd.get('business_type') || '',
                employee_count: fd.get('employee_count') || '',
                annual_revenue: fd.get('annual_revenue') || '',
                ownership_type: fd.get('ownership_type') || '',
                source: 'contact-page',
                interest: fd.get('interest') || '',
                lead_magnet: fd.get('message') || ''
            };

            try {
                await submitLead(data);
                sendNotification(data);
                contactForm.classList.add('hidden');
                if (contactSuccess) contactSuccess.classList.remove('hidden');
            } catch (_) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    var backToTop = document.getElementById('back-to-top');
    if (backToTop) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 400) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        });
        backToTop.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    var revealEls = document.querySelectorAll('.scroll-reveal');
    if (revealEls.length > 0) {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
        revealEls.forEach(function(el) { observer.observe(el); });
    }

    document.querySelectorAll('.faq-item-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var answer = btn.nextElementSibling;
            var icon = btn.querySelector('.faq-icon');
            var isOpen = answer.classList.contains('open');

            document.querySelectorAll('.faq-answer').forEach(function(a) { a.classList.remove('open'); });
            document.querySelectorAll('.faq-icon').forEach(function(i) {
                i.classList.remove('fa-chevron-up');
                i.classList.add('fa-chevron-down');
            });

            if (!isOpen) {
                answer.classList.add('open');
                if (icon) {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up');
                }
            }
        });
    });

    var viewAllToggle = document.getElementById('view-all-toggle');
    var extraProducts = document.getElementById('extra-products-list');
    var viewAllIcon = document.getElementById('view-all-icon');
    if (viewAllToggle && extraProducts) {
        var isExpanded = false;
        viewAllToggle.addEventListener('click', function() {
            isExpanded = !isExpanded;
            if (isExpanded) {
                extraProducts.classList.remove('hidden');
                extraProducts.querySelectorAll('.product-card').forEach(function(card, i) {
                    card.style.opacity = '0';
                    card.style.transform = 'translateY(10px)';
                    setTimeout(function() {
                        card.style.transition = 'all 0.3s ease';
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    }, i * 50);
                });
                viewAllToggle.innerHTML = '<i class="fas fa-chevron-up text-sm"></i> Show Less';
            } else {
                extraProducts.classList.add('hidden');
                viewAllToggle.innerHTML = '<i class="fas fa-chevron-down text-sm"></i> View All Solutions';
            }
        });
    }

    var nav = document.querySelector('nav');
    if (nav) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 100) {
                nav.classList.add('shadow-md');
            } else {
                nav.classList.remove('shadow-md');
            }
        });
    }
});
