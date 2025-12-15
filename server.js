const app = require('./index');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Global error handlers to log unexpected errors and avoid silent exits
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
  // don't exit immediately — allow logs to flush. Consider exiting after cleanup.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // keep process alive for now; you may want to shutdown gracefully here.
});

// Helpful for graceful shutdown in development
function shutdown(signal) {
  console.info(`Received ${signal}, shutting down server...`);
  server.close(() => {
    console.info('Server closed');
    process.exit(0);
  });
  // force exit after timeout
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM')); 
