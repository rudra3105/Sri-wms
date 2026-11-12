export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { navy: { DEFAULT:'#101C2B', 800:'#16273b', 700:'#1d3350', 600:'#27425f' }, brand:{ orange:'#F28C28', teal:'#00A6A6' }, bg:'#F5F7FA', line:'#E1E5EB', ink:'#182433', mute:'#718096' },
    fontFamily: { sans: ['Inter','system-ui','sans-serif'] },
    boxShadow: { card: '0 1px 2px rgba(16,28,43,.06), 0 1px 3px rgba(16,28,43,.04)' },
  } },
  plugins: [],
};
