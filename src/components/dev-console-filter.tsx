/**
 * DevConsoleFilter - Suppresses noisy development console logs
 * 
 * Returns a raw inline script to be placed in <head> that runs
 * BEFORE React loads to intercept all console messages.
 * 
 * Filters out:
 * - [Fast Refresh] / [HMR] messages from Next.js
 * - forward-logs-shared.ts messages
 * - React DevTools suggestions
 * - XHR/Fetch loading messages (JavaScript-originated)
 * - Polling/socket verbose logs
 * 
 * Note: Browser-level "XHR finished loading" logs cannot be filtered via JS.
 * To hide those in Chrome DevTools Console, add filter: -/XHR finished|Fetch finished/
 * 
 * Only active in development mode.
 */
export function DevConsoleFilter() {
  // Only render in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  // Inline script to run before React loads
  const filterScript = `
(function() {
  if (typeof window === 'undefined') return;
  
  // Patterns to filter out - be specific to avoid hiding important logs
  var filterPatterns = [
    /\\[Fast Refresh\\]/,
    /\\[HMR\\]/,
    /forward-logs-shared\\.ts/,
    /Download the React DevTools/,
    /Fetch finished loading/,
    /Fetch failed loading/,
    /XHR finished loading/,
    /polling-xhr\\.js/,
    /use-presence\\.ts:\\d+\\s*XHR/,
    /server-action-reducer\\.ts.*Fetch/,
  ];
  
  // Helper to check if message should be filtered
  function shouldFilter(args) {
    var message = Array.prototype.slice.call(args)
      .map(function(arg) { return typeof arg === 'string' ? arg : String(arg); })
      .join(' ');
    
    for (var i = 0; i < filterPatterns.length; i++) {
      if (filterPatterns[i].test(message)) {
        return true;
      }
    }
    return false;
  }
  
  // Store originals
  var origLog = console.log;
  var origInfo = console.info;
  var origWarn = console.warn;
  var origDebug = console.debug;
  
  // Override console.log
  console.log = function() {
    if (!shouldFilter(arguments)) {
      origLog.apply(console, arguments);
    }
  };
  
  // Override console.info
  console.info = function() {
    if (!shouldFilter(arguments)) {
      origInfo.apply(console, arguments);
    }
  };
  
  // Override console.warn
  console.warn = function() {
    if (!shouldFilter(arguments)) {
      origWarn.apply(console, arguments);
    }
  };
  
  // Override console.debug
  console.debug = function() {
    if (!shouldFilter(arguments)) {
      origDebug.apply(console, arguments);
    }
  };
  
  // Store reference for potential cleanup
  window.__devConsoleFilterOriginals = {
    log: origLog,
    info: origInfo,
    warn: origWarn,
    debug: origDebug
  };
})();
`;

  // Use a raw script tag - runs synchronously before React hydrates
  return (
    <script
      id="dev-console-filter"
      dangerouslySetInnerHTML={{ __html: filterScript }}
    />
  );
}
