/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        grain: {
          50: '#fbf9f4',
          100: '#f5f0e4',
          200: '#e9ddc3',
          300: '#dac39a',
          400: '#caa370',
          500: '#bd894f',
          600: '#a86f3f',
          700: '#875334',
          800: '#6f4430',
          900: '#5c392b',
        },
      },
    },
  },
  plugins: [],
}
