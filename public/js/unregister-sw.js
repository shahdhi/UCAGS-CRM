/**
 * Unregister Service Worker
 * This script removes any previously registered service workers
 * that may be interfering with network requests
 */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister().then(function(success) {
        if (success) {
          console.log('✓ Service Worker unregistered successfully');
        }
      });
    }
  }).catch(function(err) {
    console.log('Service Worker unregistration failed: ', err);
  });
}
