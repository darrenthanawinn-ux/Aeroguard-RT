/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          950: '#05080c',
          900: '#080d13',
          850: '#0b1118',
          800: '#0f1721',
        },
      },
      keyframes: {
        pulseRing: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0.15' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 1.2s ease-in-out infinite',
        blink: 'blink 0.9s steps(1) infinite',
      },
    },
  },
  plugins: [],
};
