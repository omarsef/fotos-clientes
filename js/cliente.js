import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, updateDoc, collection, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser  = null;
let fotos        = [];       // [{id, url, seleccionada}]
let seleccionadas = new Set();
let lightboxIdx  = -1;

// ── Auth guard ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  const snap = await getDoc(doc(db, "usuarios", user.uid));
  if (!snap.exists()) { window.location.href = "login.html"; return; }

  const data = snap.data();
  if (data.role === "admin") { window.location.href = "admin.html"; return; }

  currentUser = { uid: user.uid, ...data };
  document.getElementById("clientEmail").textContent = user.email;
  document.getElementById("clientName").textContent  = data.nombre || user.email;

  cargarFotos();
});

window.logout = async () => { await signOut(auth); window.location.href = "login.html"; };

// ── Cargar galería ───────────────────────────────────────────
async function cargarFotos() {
  const container = document.getElementById("galeriaCliente");
  const empty     = document.getElementById("emptyState");

  const snap = await getDocs(query(
    collection(db, "fotos"),
    where("clienteId", "==", currentUser.uid)
  ));

  if (snap.empty) {
    container.style.display = "none";
    empty.style.display = "block";
    return;
  }

  fotos = [];
  snap.forEach(d => {
    fotos.push({ id: d.id, ...d.data() });
    if (d.data().seleccionada) seleccionadas.add(d.id);
  });

  renderGaleria();
  actualizarContador();
}

// ── Render fotos ─────────────────────────────────────────────
function renderGaleria() {
  const container = document.getElementById("galeriaCliente");
  container.innerHTML = "";

  fotos.forEach((foto, idx) => {
    const div = document.createElement("div");
    div.className = "gallery-item" + (seleccionadas.has(foto.id) ? " selected" : "");
    div.innerHTML = `
      <img src="${foto.url}" alt="foto ${idx + 1}" loading="lazy" />
      <div class="check">✓</div>
    `;
    div.addEventListener("click", () => toggleSeleccion(foto.id));
    div.addEventListener("dblclick", () => abrirLightbox(idx));
    container.appendChild(div);
  });
}

// ── Toggle selección ─────────────────────────────────────────
function toggleSeleccion(fotoId) {
  if (seleccionadas.has(fotoId)) {
    seleccionadas.delete(fotoId);
  } else {
    seleccionadas.add(fotoId);
  }
  renderGaleria();
  actualizarContador();
}

function actualizarContador() {
  const count = seleccionadas.size;
  document.getElementById("countSelected").textContent = count;
  document.getElementById("btnConfirm").disabled = count === 0;
}

// ── Confirmar selección ──────────────────────────────────────
document.getElementById("btnConfirm").addEventListener("click", async () => {
  if (!confirm(`¿Confirmás la selección de ${seleccionadas.size} foto(s)?`)) return;

  const btn = document.getElementById("btnConfirm");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    // Update all fotos in Firestore
    for (const foto of fotos) {
      await updateDoc(doc(db, "fotos", foto.id), {
        seleccionada: seleccionadas.has(foto.id)
      });
    }
    showToast("✅ Selección confirmada. ¡Gracias!");
    btn.textContent = "✅ Selección guardada";
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Confirmar selección";
    showToast("Error al guardar. Intentá de nuevo.");
  }
});

// ── Lightbox ─────────────────────────────────────────────────
function abrirLightbox(idx) {
  lightboxIdx = idx;
  const foto = fotos[idx];
  document.getElementById("lightboxImg").src = foto.url;
  document.getElementById("lightbox").classList.add("open");

  const btn = document.getElementById("lightboxSelect");
  btn.textContent = seleccionadas.has(foto.id) ? "✓ Seleccionada" : "Seleccionar esta foto";
  btn.onclick = () => {
    toggleSeleccion(foto.id);
    btn.textContent = seleccionadas.has(foto.id) ? "✓ Seleccionada" : "Seleccionar esta foto";
  };
}

document.getElementById("lightboxClose").addEventListener("click", () => {
  document.getElementById("lightbox").classList.remove("open");
});

document.getElementById("lightbox").addEventListener("click", (e) => {
  if (e.target === document.getElementById("lightbox")) {
    document.getElementById("lightbox").classList.remove("open");
  }
});

// ── Toast ────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}
