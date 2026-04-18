import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// This will be updated once Firebase is set up
const firebaseConfig = {
  apiKey: "AIzaSyCdj6j7zU94jnPtkypUJTANvges7t47-Jc",
  authDomain: "vikendovnik.firebaseapp.com",
  projectId: "vikendovnik",
  storageBucket: "vikendovnik.firebasestorage.app",
  messagingSenderId: "613302610738",
  appId: "1:613302610738:web:270e73eeccd68f94c2852b",
  measurementId: "G-RC2QDBSE17"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
