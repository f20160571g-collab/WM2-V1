// Example staging runtime config.
// Copy values into runtime-config.js on the staging branch/deployment.
(function (global) {
  'use strict';
  global.WM2_RUNTIME_CONFIG = {
    ENV_NAME: 'staging',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/REPLACE_WITH_STAGING_DEPLOYMENT/exec',
  };
})(typeof window !== 'undefined' ? window : this);
