// Mobile Menu Toggle
const mobileMenuButton = document.getElementById("mobile-menu-button");
const mobileMenu = document.getElementById("mobile-menu");

if (mobileMenuButton && mobileMenu) {
	mobileMenuButton.addEventListener("click", () => {
		mobileMenu.classList.toggle("hidden");
	});
}

// Close mobile menu when clicking outside
document.addEventListener("click", (e) => {
	if (
		!mobileMenuButton.contains(e.target) &&
		!mobileMenu.contains(e.target)
	) {
		mobileMenu.classList.add("hidden");
	}
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
	anchor.addEventListener("click", function (e) {
		e.preventDefault();
		const target = document.querySelector(this.getAttribute("href"));
		if (target) {
			target.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
			// Close mobile menu if open
			if (mobileMenu && !mobileMenu.classList.contains("hidden")) {
				mobileMenu.classList.add("hidden");
			}
		}
	});
});

// Scroll Progress Indicator
const progressBar = document.createElement("div");
progressBar.className = "scroll-progress";
document.body.appendChild(progressBar);

window.addEventListener("scroll", () => {
	const windowHeight =
		document.documentElement.scrollHeight -
		document.documentElement.clientHeight;
	const scrolled = (window.scrollY / windowHeight) * 100;
	progressBar.style.transform = `scaleX(${scrolled / 100})`;
});

// Parallax Effect
window.addEventListener("scroll", () => {
	const parallaxElements = document.querySelectorAll(".parallax");
	parallaxElements.forEach((element) => {
		const speed = element.dataset.speed || 0.5;
		const yPos = -(window.scrollY * speed);
		element.style.transform = `translateY(${yPos}px)`;
	});
});

// Form Submissions with Loading State
const scheduleForm = document.getElementById("schedule-form");
const contactForm = document.getElementById("contact-form");

function handleFormSubmit(form, successMessage) {
	const submitButton = form.querySelector("button[type='submit']");
	const originalText = submitButton.textContent;

	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		submitButton.classList.add("loading");
		submitButton.textContent = "Processing...";

		const formData = new FormData(form);
		const data = Object.fromEntries(formData.entries());

		try {
			// Simulate API call
			await new Promise((resolve) => setTimeout(resolve, 1500));
			console.log("Form submitted:", data);
			alert(successMessage);
			form.reset();
		} catch (error) {
			console.error("Error submitting form:", error);
			alert(
				"There was an error submitting your request. Please try again later."
			);
		} finally {
			submitButton.classList.remove("loading");
			submitButton.textContent = originalText;
		}
	});
}

if (scheduleForm) {
	handleFormSubmit(
		scheduleForm,
		"Thank you for scheduling a consultation. We will contact you shortly!"
	);
}

if (contactForm) {
	handleFormSubmit(
		contactForm,
		"Thank you for your message. We will get back to you soon!"
	);
}

// Newsletter Form
const newsletterForm = document.querySelector("footer form");
if (newsletterForm) {
	handleFormSubmit(
		newsletterForm,
		"Thank you for subscribing to our newsletter!"
	);
}

// Enhanced Scroll Animations
const observerOptions = {
	root: null,
	rootMargin: "0px",
	threshold: 0.1,
};

const observer = new IntersectionObserver((entries) => {
	entries.forEach((entry) => {
		if (entry.isIntersecting) {
			entry.target.classList.add("animate-fade-in");
			observer.unobserve(entry.target);
		}
	});
}, observerOptions);

// Observe elements with animation classes
document
	.querySelectorAll("section, .service-card, .pricing-card")
	.forEach((element) => {
		observer.observe(element);
	});

// Add hover effect to service cards
document.querySelectorAll(".service-card").forEach((card) => {
	card.addEventListener("mouseenter", () => {
		card.style.transform = "translateY(-10px)";
	});

	card.addEventListener("mouseleave", () => {
		card.style.transform = "translateY(0)";
	});
});

// Add hover effect to pricing cards
document.querySelectorAll(".pricing-card").forEach((card) => {
	card.addEventListener("mouseenter", () => {
		card.style.transform = "translateY(-10px)";
	});

	card.addEventListener("mouseleave", () => {
		card.style.transform = "translateY(0)";
	});
});

// Add floating animation to certain elements
document.querySelectorAll(".animate-float").forEach((element) => {
	element.style.animationDelay = `${Math.random() * 2}s`;
});

// Add text gradient effect to headings
document.querySelectorAll("h1, h2, h3").forEach((heading) => {
	heading.classList.add("text-gradient");
});

// Add active class to current navigation item
const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll('nav a[href^="#"]');

window.addEventListener("scroll", () => {
	let current = "";

	sections.forEach((section) => {
		const sectionTop = section.offsetTop;
		const sectionHeight = section.clientHeight;

		if (pageYOffset >= sectionTop - 60) {
			current = section.getAttribute("id");
		}
	});

	navLinks.forEach((link) => {
		link.classList.remove("text-blue-600");
		if (link.getAttribute("href").slice(1) === current) {
			link.classList.add("text-blue-600");
		}
	});
});

// Add parallax effect to hero section
const heroSection = document.querySelector(".hero-section");
if (heroSection) {
	window.addEventListener("scroll", () => {
		const scrolled = window.pageYOffset;
		heroSection.style.transform = `translateY(${scrolled * 0.5}px)`;
	});
}

// Add loading animation to images
document.querySelectorAll("img").forEach((img) => {
	img.addEventListener("load", () => {
		img.classList.add("loaded");
	});
});
