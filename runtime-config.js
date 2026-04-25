// Runtime deployment config.
// Keep this file branch-specific so stable/staging deployments can use different endpoints.
(function (global) {
  'use strict';

  var existing = (global && global.WM2_RUNTIME_CONFIG && typeof global.WM2_RUNTIME_CONFIG === 'object')
    ? global.WM2_RUNTIME_CONFIG
    : {};

  global.WM2_RUNTIME_CONFIG = Object.assign({
    ENV_NAME: 'production',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx9DhejTnzmXsQToVBzqDbQx1nSlkfN79WvxNuCWaArOy49GYwNrCzMfDoLSORxxr9f/exec',
  }, existing);
})(typeof window !== 'undefined' ? window : this);
