module.exports = {
    content: ['./index.html', './script.js'],
    theme: {
        extend: {
            colors: {
                nerve: {
                    50: '#f0f5fa', 100: '#dae4f0', 200: '#b5c9e0',
                    300: '#8badc9', 400: '#6090b0', 500: '#3d7097',
                    600: '#2a5578', 700: '#1e3a5f', 800: '#162a42',
                    900: '#0f1d2e', 950: '#070e18'
                },
                primary: { DEFAULT: '#dc2626', dark: '#b91c1c', light: '#ef4444' }
            },
            fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
        }
    }
};
