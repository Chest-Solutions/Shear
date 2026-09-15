/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Shear's neutral ramp — darker than stock neutral on purpose.
        ink: {
          950: '#0b0b0b',
          925: '#0e0e0e',
          900: '#121212',
          850: '#161616',
          800: '#1a1a1a',
          750: '#1f1f1f',
          700: '#242424',
          600: '#2e2e2e',
          500: '#3a3a3a',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Inter',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        panel: '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
        artboard: '0 2px 24px rgba(0,0,0,0.5)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
