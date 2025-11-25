/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'topo-cream': '#f4ebe1',
        'topo-brown': '#3d2817',
        'topo-green': '#1a4d2e',
        'topo-blue': '#0a2f51',
        'contour': '#8b7355',
        'water': '#4a7c9e',
        'highlight': '#d35400',
        'warn': '#c0392b',
      },
      fontFamily: {
        'display': ['Newsreader', 'serif'],
        'mono': ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
