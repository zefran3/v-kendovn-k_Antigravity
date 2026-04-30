importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyCdj6j7zU94jnPtkypUJTANvges7t47-Jc",
  authDomain: "vikendovnik.firebaseapp.com",
  projectId: "vikendovnik",
  storageBucket: "vikendovnik.firebasestorage.app",
  messagingSenderId: "613302610738",
  appId: "1:613302610738:web:270e73eeccd68f94c2852b",
  measurementId: "G-RC2QDBSE17"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Zobrazit notifikaci manuálně POUZE pokud neobsahuje objekt notification.
  // Pokud obsahuje notification, Firebase (nebo systém) ji zobrazí automaticky,
  // čímž předejdeme dvojitým nebo vícenásobným upozorněním!
  if (!payload.notification) {
    const notificationTitle = payload.data?.title || 'Nová aktivita ve Víkendovníku!';
    const notificationOptions = {
      body: payload.data?.body,
      icon: '/pwa-192x192.png',
      badge: '/logo.png',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      data: payload.data
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});

