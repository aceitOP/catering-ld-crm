/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          950: 'rgb(var(--brand-950) / <alpha-value>)',
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
