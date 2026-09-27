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
        wechat: {
          green: '#07C160',
          greenHover: '#06AD56',
          greenActive: '#059B4D',
          greenLight: '#E8F8F0',
          greenSoft: 'rgba(7, 193, 96, 0.12)',
          bgLight: '#EDEDED',
          bgLightCard: '#FFFFFF',
          bgLightSidebar: '#F5F5F5',
          bgDark: '#111111',
          bgDarkCard: '#1E1E1E',
          bgDarkSidebar: '#181818',
          textLightMain: '#191919',
          textLightMuted: '#7F7F7F',
          textDarkMain: '#EDEDED',
          textDarkMuted: '#8D8D8D',
          borderLight: '#E5E5E5',
          borderDark: 'rgba(255, 255, 255, 0.08)',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
