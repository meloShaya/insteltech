// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
	anchor.addEventListener("click", function (e) {
		e.preventDefault();
		const targetId = this.getAttribute("href");
		const targetElement = document.querySelector(targetId);

		if (targetElement) {
			targetElement.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		}
	});
});

// Ensure current year is updated in the footer
document.addEventListener("DOMContentLoaded", (event) => {
	const currentYearSpan = document.getElementById("current-year");
	if (currentYearSpan) {
		currentYearSpan.textContent = new Date().getFullYear();
	}

	// Mobile menu toggle
	const mobileMenuButton = document.getElementById("mobile-menu-button");
	const mobileMenu = document.getElementById("mobile-menu");

	if (mobileMenuButton && mobileMenu) {
		mobileMenuButton.addEventListener("click", () => {
			mobileMenu.classList.toggle("hidden");
		});
	}

	// Scroll progress indicator
	const scrollProgress = document.querySelector(".scroll-progress");
	if (scrollProgress) {
		window.addEventListener("scroll", () => {
			const scrollTop =
				document.documentElement.scrollTop || document.body.scrollTop;
			const scrollHeight =
				document.documentElement.scrollHeight -
				document.documentElement.clientHeight;
			const scrolled = (scrollTop / scrollHeight) * 100;
			scrollProgress.style.width = scrolled + "%";
		});
	}

	// Back to top button
	const backToTopButton = document.getElementById("back-to-top");
	if (backToTopButton) {
		window.addEventListener("scroll", () => {
			if (
				document.body.scrollTop > 100 ||
				document.documentElement.scrollTop > 100
			) {
				backToTopButton.style.display = "block";
				backToTopButton.style.opacity = "1";
			} else {
				backToTopButton.style.display = "none";
				backToTopButton.style.opacity = "0";
			}
		});

		backToTopButton.addEventListener("click", () => {
			window.scrollTo({ top: 0, behavior: "smooth" });
		});
	}

	// Contact Form Submission with Formspree
	const contactForm = document.getElementById("contact-form");
	const formStatus = document.getElementById("form-status");

	if (contactForm && formStatus) {
		contactForm.addEventListener("submit", async function (e) {
			e.preventDefault();
			const submitButton = contactForm.querySelector(
				"button[type='submit']"
			);
			const originalButtonText = submitButton.innerHTML;

			submitButton.disabled = true;
			submitButton.innerHTML =
				'<i class="fas fa-spinner fa-spin mr-2"></i>Sending...';
			formStatus.innerHTML = ""; // Clear previous status

			const formData = new FormData(contactForm);

			try {
				const response = await fetch(contactForm.action, {
					method: "POST",
					body: formData,
					headers: {
						Accept: "application/json",
					},
				});

				if (response.ok) {
					formStatus.innerHTML =
						"<p class='text-green-600 font-semibold'>Message sent successfully! Thank you.</p>";
					contactForm.reset();
				} else {
					const data = await response.json();
					if (Object.hasOwn(data, "errors")) {
						formStatus.innerHTML = data["errors"]
							.map((error) => error["message"])
							.join(", ");
					} else {
						formStatus.innerHTML =
							"<p class='text-red-600 font-semibold'>Oops! There was a problem submitting your form. Please try again.</p>";
					}
				}
			} catch (error) {
				formStatus.innerHTML =
					"<p class='text-red-600 font-semibold'>Oops! There was a problem submitting your form. Check your network connection.</p>";
			}

			submitButton.disabled = false;
			submitButton.innerHTML = originalButtonText;
		});
	}

	// Consultation Form Submission with Formspree
	const consultationForm = document.getElementById("consultation-form");
	const consultationFormStatus = document.getElementById(
		"consultation-form-status"
	);

	if (consultationForm && consultationFormStatus) {
		consultationForm.addEventListener("submit", async function (e) {
			e.preventDefault();
			const submitButton = consultationForm.querySelector(
				'button[type="submit"]'
			);
			const originalButtonText = submitButton.innerHTML;

			submitButton.disabled = true;
			submitButton.innerHTML =
				'<i class="fas fa-spinner fa-spin mr-2"></i>Scheduling...';
			consultationFormStatus.innerHTML = ""; // Clear previous status

			const formData = new FormData(consultationForm);

			try {
				const response = await fetch(consultationForm.action, {
					method: "POST",
					body: formData,
					headers: {
						Accept: "application/json",
					},
				});

				if (response.ok) {
					consultationFormStatus.innerHTML =
						'<p class="text-green-600 font-semibold">Consultation request sent! We will be in touch shortly.</p>';
					consultationForm.reset();
				} else {
					const data = await response.json();
					if (Object.hasOwn(data, "errors")) {
						consultationFormStatus.innerHTML = data["errors"]
							.map((error) => error["message"])
							.join(", ");
					} else {
						consultationFormStatus.innerHTML =
							'<p class="text-red-600 font-semibold">Oops! There was a problem submitting your request. Please try again.</p>';
					}
				}
			} catch (error) {
				consultationFormStatus.innerHTML =
					'<p class="text-red-600 font-semibold">Oops! There was a problem submitting your request. Check your network connection.</p>';
			}

			submitButton.disabled = false;
			submitButton.innerHTML = originalButtonText;
		});
	}
});
