document.addEventListener('DOMContentLoaded', async () => {
    await loadData();   // waits for Supabase data before rendering
    startScanner();
});
