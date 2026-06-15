// Stockix default theme is dark (see index.html). Override via localStorage theme=light.
const theme = localStorage.getItem('theme') || 'dark';

if (theme === 'dark') {
  document.documentElement.classList.add('bp4-dark');
  document.body.classList.add('bp4-dark');
}

// Remove dark mode for payment portal pages
if (window.location.pathname.startsWith('/payment')) {
  document.documentElement.classList.remove('bp4-dark');
  document.body.classList.remove('bp4-dark');
}
