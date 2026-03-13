/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef0f9',
          100: '#d5d9f1',
          200: '#aab4e3',
          300: '#7f8ed5',
          400: '#5468c7',
          500: '#2942b9',
          600: '#2239a0',
          700: '#1c3087',
          800: '#1d2570',
          900: '#262d64',
          950: '#1a1f47',
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
      },
      fontFamily: {
        sans: ['Syne', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
