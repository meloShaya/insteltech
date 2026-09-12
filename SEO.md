# Search readiness

## Implemented

- Concise title, Harare/Zimbabwe service description, homepage canonical, and consistent social metadata.
- Organization, website, webpage, and service JSON-LD with business details and hours matching the page. No fabricated ratings or street address.
- Crawlable HTML, main landmark, service heading, robots.txt, and a sitemap listing the canonical homepage.
- JPEG social preview instead of SVG; image dimensions and alternative text.
- Locally compiled Tailwind CSS instead of browser-time compilation. Run npm ci and npm run build:css after changing utility classes; commit tailwind.generated.css.
- Removed the invalid Google Analytics placeholder. A real measurement ID is needed to enable analytics.
- Old About/Contact URLs retain client-side redirects and the homepage canonical. GitHub Pages does not support arbitrary per-path server-side 301 configuration.

## After deployment

1. Verify ownership in Google Search Console and Bing Webmaster Tools. Submit https://insteltech.co.zw/sitemap.xml and inspect indexing. Owner account access is required.
2. Update the genuine Google Business Profile with Harare and accurate service-area/address details.
3. Replace placeholder “trusted by” names with genuine customer evidence. Validate existing numerical results, values, and scarcity claims before presenting them as proof.
4. Publish documented customer case studies and collect authentic reviews. Focus on qualified local service searches rather than a promised “number one tech site” ranking.
5. Measure mobile Core Web Vitals and search performance after deployment. No Lighthouse score or ranking improvement is claimed by this audit.

## Limits and sources

The live homepage returned 200 during the audit; robots.txt returned 404. The live site was still serving the older page. Local fixes only affect search after deployment and recrawling.

Google says ordinary SEO practices apply to its AI search features. No special AI schema or machine-readable file is required. Sitemaps do not guarantee indexing, rankings, or AI recommendations.

- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
- https://developers.google.com/search/docs/appearance/structured-data/organization
