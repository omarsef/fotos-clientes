import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Login form ──────────────────────────────────────────────
const form    = document.getElementById("loginForm");
const errorEl = document.getElementById("errorMsg");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.style.display = "none";
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // redirect handled by onAuthStateChanged below
    } catch (err) {
      errorEl.style.display = "block";
    }
  });
}

// ── Route guard + redirect after login ─────────────────────
onAuthStateChanged(auth, async (user) => {
  const page = window.location.pathname;

  if (!user) {
    // If on a protected page, redirect to login
    if (page.includes("admin.html") || page.includes("cliente.html")) {
      window.location.href = "login.html";
    }
    return;
  }

  // User is logged in — get their role
  const userDoc = await getDoc(doc(db, "usuarios", user.uid));
  if (!userDoc.exists()) return;

  const role = userDoc.data().role;

  // If on login page, redirect based on role
  if (page.includes("login.html")) {
    if (role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "cliente.html";
    }
    return;
  }

  // If admin tries to access cliente page or vice versa
  if (page.includes("admin.html") && role !== "admin") {
    window.location.href = "cliente.html";
  }
  if (page.includes("cliente.html") && role === "admin") {
    window.location.href = "admin.html";
  }
});

// ── Logout (global) ─────────────────────────────────────────
window.logout = async () => {
  await signOut(auth);
  window.location.href = "login.html";
};
