/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans Arabic', 'Cairo', 'sans-serif'],
      },
      colors: {
        primary: {
          50:  '#fdf7f0',
          100: '#f9ecdb',
          200: '#f1d5b2',
          300: '#e6b980',
          400: '#d99c55',
          500: '#c4925a',
          600: '#b07b45',
          700: '#8b6035',
          800: '#6b4a28',
          900: '#4a301a',
        },
        brand: {
          gold:    '#c4925a',
          dark:    '#7b4a2d',
          darker:  '#4a301a',
          light:   '#f1d5b2',
        },
      },
      keyframes: {
        shimmer: {
          '0%':   { transform: 'translateX(100%)' },
          '50%':  { transform: 'translateX(-20%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}