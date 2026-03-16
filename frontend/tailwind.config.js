/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0edff',
          100: '#ddd6fe',
          200: '#c4b5fd',
          300: '#a78bfa',
          400: '#8b5cf6',
          500: '#7c3aed',
          600: '#6d28d9',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#2d1b69',
          950: '#1b1142',
        },
        accent: {
          DEFAULT: '#EB5939',
          50:  '#fef3f0',
          100: '#fde4dd',
          200: '#fbbfb1',
          300: '#f89a85',
          400: '#f37559',
          500: '#EB5939',
          600: '#d44020',
          700: '#b03318',
          800: '#8c2814',
          900: '#6e2011',
        },
        surface: '#f4f7fe',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 6px 24px -4px rgb(0 0 0 / 0.06)',
        'card-hover': '0 2px 8px 0 rgb(0 0 0 / 0.06), 0 8px 32px -4px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
};
