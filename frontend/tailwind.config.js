/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#100d17',
        panel: '#17131f',
        line: '#2b2634',
        muted: '#968fa4',
        lavender: '#aa8bff',
        lilac: '#d3c3ff',
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 42px rgba(154, 119, 255, .16)' },
    },
  },
  plugins: [],
}
