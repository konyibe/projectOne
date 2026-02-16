/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        severity: {
          1: '#3B82F6', // blue - info
          2: '#22C55E', // green - low
          3: '#EAB308', // yellow - warning
          4: '#F97316', // orange - high
          5: '#EF4444', // red - critical
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};
