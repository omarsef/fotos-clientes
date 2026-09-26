// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBLUKYeded6kgSpj0j3SVYt9Bgzes1qv8E",
  authDomain: "repositorio-de-clientes.firebaseapp.com",
  projectId: "repositorio-de-clientes",
  storageBucket: "repositorio-de-clientes.firebasestorage.app",
  messagingSenderId: "156948512622",
  appId: "1:156948512622:web:5703ada78a1c5bc346cb7f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Cloudinary Configuration
export const CLOUDINARY_CLOUD_NAME = "ouont68q";
export const CLOUDINARY_API_KEY = "146614388432368";
export const CLOUDINARY_UPLOAD_PRESET = "fotos_clientes"; // lo creamos en Cloudinary
